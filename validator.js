const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const sheetsSync = require('./sheets_sync');

const SECURITY_PATTERNS = [
  /unusual activity/i,
  /too many requests/i,
  /temporarily blocked/i,
  /temporarily banned/i,
  /account restricted/i,
  /account banned/i,
  /verify your phone/i,
  /verification required/i,
  /security check/i,
  /captcha/i,
  /access blocked/i,
  /rate limit/i,
  /suspicious activity/i,
  /you have been logged out/i,
  /something went wrong.*try again later/i,
  /try again in \d+/i
];

function detectSecurityResponse(text) {
  if (!text) return null;
  for (const pattern of SECURITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

const INVALID_PATTERNS = [
  /invalid/i,
  /not on whatsapp/i,
  /isn't on whatsapp/i,
  /url is invalid/i
];

function isNormalInvalidResponse(text) {
  if (!text) return false;
  if (detectSecurityResponse(text)) return false;
  return INVALID_PATTERNS.some((p) => p.test(text));
}

class WhatsAppValidator {
  constructor() {
    let baseDir = __dirname;
    if (process.versions && process.versions.electron) {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      if (process.platform === 'darwin') {
        baseDir = path.join(home, 'Library', 'Application Support', 'OutGrow WhatsApp Validator Ultra');
      } else if (process.platform === 'win32') {
        baseDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'OutGrow WhatsApp Validator Ultra') : __dirname;
      } else {
        baseDir = path.join(home, '.outgrow-whatsapp-validator-ultra');
      }
      if (!fs.existsSync(baseDir)) {
        try {
          fs.mkdirSync(baseDir, { recursive: true });
        } catch (e) {}
      }
    }
    this.sessionDir = path.join(baseDir, '.wweb_session');
    this.context = null;
    this.page = null;
    this.isRunning = false;
    this.shouldStop = false;
  }

  // Ensure persistent context exists and is launched
  async getContext(headless = false) {
    if (this.context) {
      try {
        if (this.context.pages().length > 0) {
          return this.context;
        }
      } catch (e) {
        this.context = null;
      }
    }

    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    let launchOptions = {
      headless: headless,
      viewport: { width: 1280, height: 820 },
      channel: 'chrome',
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--test-type',
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--disable-infobars'
      ]
    };

    try {
      this.context = await chromium.launchPersistentContext(this.sessionDir, launchOptions);
    } catch (err) {
      console.warn('Could not launch with Chrome channel, attempting default chromium/edge...', err.message);
      try {
        launchOptions.channel = 'msedge';
        this.context = await chromium.launchPersistentContext(this.sessionDir, launchOptions);
      } catch (edgeErr) {
        delete launchOptions.channel;
        this.context = await chromium.launchPersistentContext(this.sessionDir, launchOptions);
      }
    }

    this.page = this.context.pages()[0] || (await this.context.newPage());

    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    return this.context;
  }

  async closeBrowser() {
    this.isRunning = false;
    this.shouldStop = false;
    sheetsSync.sheetPage = null;
    sheetsSync.currentSpreadsheetId = null;
    sheetsSync.currentGid = null;
    if (this.context) {
      try {
        await this.context.close();
      } catch (e) {
        console.error('Error closing context:', e.message);
      }
      this.context = null;
      this.page = null;
    }
  }

  // Logout and clear session directory so user can link a different account
  async logout() {
    this.isRunning = false;
    this.shouldStop = false;
    this._lastAuthStatus = null;

    await this.closeBrowser();
    await new Promise((r) => setTimeout(r, 800));

    if (fs.existsSync(this.sessionDir)) {
      try {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('Could not delete session directory directly, cleaning subfiles:', err.message);
        try {
          const files = fs.readdirSync(this.sessionDir);
          for (const file of files) {
            try {
              fs.rmSync(path.join(this.sessionDir, file), { recursive: true, force: true });
            } catch (e) {}
          }
        } catch (e) {}
      }
    }

    return { success: true, message: 'Logged out successfully. You can now link another account.' };
  }

  // Open WhatsApp Web for QR scan / verification
  async openLoginWindow() {
    await this.getContext(false);
    if (!this.page || this.page.isClosed()) {
      this.page = await this.context.newPage();
    }
    await this.page.bringToFront().catch(() => {});
    const url = this.page.url();
    if (!url.includes('web.whatsapp.com')) {
      await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
  }

  // Get QR Code base64 image directly for dashboard display
  async getQrCodeImage() {
    try {
      await this.getContext(false);
      if (!this.page || this.page.isClosed()) {
        this.page = await this.context.newPage();
      }

      const currentUrl = this.page.url();
      if (!currentUrl.includes('web.whatsapp.com')) {
        await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      const isChatList = await this.page.$('#pane-side, #side, [data-testid="chat-list"], [data-testid="intro-title"]');
      if (isChatList) {
        return { status: 'LOGGED_IN' };
      }

      const reloadBtn = await this.page.$('button:has-text("Click to reload"), span:has-text("Click to reload QR")');
      if (reloadBtn) {
        await reloadBtn.click().catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
      }

      const qrSelector =
        'canvas[aria-label*="Scan"], [data-testid="qrcode"] canvas, div[data-ref] canvas, canvas, [data-testid="qrcode"], div[data-ref]';
      let qrElement = await this.page.$(qrSelector);

      if (!qrElement) {
        qrElement = await this.page.waitForSelector(qrSelector, { timeout: 8000 }).catch(() => null);
      }

      if (qrElement) {
        const innerCanvas = await qrElement.$('canvas').catch(() => null);
        const targetElement = innerCanvas || qrElement;
        const buffer = await targetElement.screenshot();
        return {
          status: 'QR_REQUIRED',
          qrImage: `data:image/png;base64,${buffer.toString('base64')}`
        };
      }

      const checkAgain = await this.page.$('#pane-side, #side, [data-testid="chat-list"]');
      if (checkAgain) {
        return { status: 'LOGGED_IN' };
      }

      return { status: 'LOADING', message: 'WhatsApp Web is loading...' };
    } catch (err) {
      console.error('getQrCodeImage error:', err);
      return { status: 'ERROR', message: err.message };
    }
  }

  // Check login status with waiting for splash screen to resolve
  async checkLoginStatus() {
    if (this._isCheckingAuth) {
      return this._lastAuthStatus || { status: 'CHECKING', message: 'Checking...' };
    }
    this._isCheckingAuth = true;

    try {
      await this.getContext(false);
      if (!this.page || this.page.isClosed()) {
        this.page = await this.context.newPage();
      }

      const currentUrl = this.page.url();
      if (!currentUrl.includes('web.whatsapp.com')) {
        await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      const domStatus = await this.page.evaluate(() => {
        const text = document.body ? document.body.innerText : '';
        const hasPaneSide = !!document.querySelector('#pane-side, #side, [data-testid="chat-list"], [data-testid="intro-title"]');
        const hasQR = !!(
          document.querySelector('div[data-ref], canvas[aria-label*="Scan"], [data-testid="qrcode"]') ||
          text.includes('Scan to log in') ||
          text.includes('Scan the QR code') ||
          text.includes('Link with phone number')
        );
        const isProgress =
          !!document.querySelector('progress, [role="progressbar"]') ||
          (text.includes('WhatsApp End-to-end encrypted') && !hasQR && !hasPaneSide);

        return { hasPaneSide, hasQR, isProgress };
      });

      let res;
      if (domStatus.hasPaneSide) {
        res = { status: 'LOGGED_IN', message: 'WhatsApp Web is authenticated.' };
      } else if (domStatus.hasQR) {
        res = { status: 'QR_REQUIRED', message: 'Please scan the QR code to log in.' };
      } else if (domStatus.isProgress) {
        res = { status: 'LOADING', message: 'WhatsApp Web is syncing chats...' };
      } else {
        res = { status: 'LOADING', message: 'WhatsApp Web is loading...' };
      }

      this._lastAuthStatus = res;
      return res;
    } catch (err) {
      return { status: 'ERROR', message: err.message };
    } finally {
      this._isCheckingAuth = false;
    }
  }

  // Sanitize phone number: automatically strips leading 0s and auto-detects country code if not provided
  sanitizeNumber(rawNumber, defaultCountryCode = '') {
    if (!rawNumber) return null;
    let cleaned = rawNumber.toString().trim();

    // Keep digits only
    cleaned = cleaned.replace(/\D/g, '');
    if (!cleaned) return null;

    // Always strip leading 0 or 00 automatically (e.g. 0568978864 -> 568978864, 0097150... -> 97150...)
    const hadLeadingZero = cleaned.startsWith('0');
    cleaned = cleaned.replace(/^0+/, '');

    if (defaultCountryCode) {
      const cc = defaultCountryCode.replace(/\D/g, '');
      if (cc && !cleaned.startsWith(cc) && cleaned.length <= 10) {
        cleaned = cc + cleaned;
      }
      return cleaned;
    }

    // Automatic Country Code Detection when Default Country Code is left blank:
    // 1. 9-digit local numbers (e.g. 0568978864 -> 568978864, 0504623961 -> 504623961, 04... -> 4...) -> UAE (971)
    if (cleaned.length === 9) {
      cleaned = '971' + cleaned;
    }
    // 2. 10-digit local numbers starting with 6, 7, 8, 9 (e.g. 9876543210 or 09876543210) -> India (91) default
    else if (cleaned.length === 10 && /^[6-9]/.test(cleaned) && (hadLeadingZero || /^[6-9]\d{9}$/.test(cleaned))) {
      cleaned = '91' + cleaned;
    }

    return cleaned;
  }

  // Build candidate international numbers for automatic country detection when user didn't specify a country code
  getCandidateNumbers(rawNumber, defaultCountryCode = '') {
    const primary = this.sanitizeNumber(rawNumber, defaultCountryCode);
    if (!primary) return [];
    if (defaultCountryCode) return [primary];

    const digits = rawNumber.toString().trim().replace(/\D/g, '').replace(/^0+/, '');
    const candidates = [primary];

    const addCandidate = (num) => {
      if (num && num.length >= 9 && !candidates.includes(num)) {
        candidates.push(num);
      }
    };

    if (digits.length === 9) {
      addCandidate('971' + digits); // UAE
      addCandidate('966' + digits); // Saudi Arabia
    } else if (digits.length === 10) {
      addCandidate('91' + digits);  // India
      addCandidate('1' + digits);   // US / Canada
      if (digits.startsWith('7')) addCandidate('44' + digits); // UK
      if (digits.startsWith('3')) addCandidate('92' + digits); // Pakistan
    }
    addCandidate(digits);

    return candidates;
  }

  // Cancellable sleep helper
  cancellableSleep(ms) {
    return new Promise((resolve) => {
      if (this.shouldStop || ms <= 0) {
        return resolve(false);
      }
      let elapsed = 0;
      const interval = 100;
      const timer = setInterval(() => {
        elapsed += interval;
        if (this.shouldStop) {
          clearInterval(timer);
          this._activePacing = null;
          return resolve(false);
        }
        if (elapsed >= ms) {
          clearInterval(timer);
          this._activePacing = null;
          return resolve(true);
        }
      }, interval);
      this._activePacing = { timer, resolve };
    });
  }

  // Validate a single number WITHOUT reloading WhatsApp Web on every row
  async validateSingleNumber(rawNumber, defaultCountryCode = '', timeoutMs = 15000) {
    if (rawNumber === null || rawNumber === undefined || String(rawNumber).trim() === '') {
      return {
        number: '(Empty Row)',
        cleanNumber: '-',
        status: 'NO NUMBER',
        reason: 'Row is empty — no phone number provided'
      };
    }

    const cleanNumber = this.sanitizeNumber(rawNumber, defaultCountryCode);
    if (!cleanNumber) {
      return {
        number: String(rawNumber).trim() || '(Empty Row)',
        cleanNumber: '-',
        status: 'NO NUMBER',
        reason: 'No phone number found in this row'
      };
    }

    if (cleanNumber.length < 7) {
      return {
        number: rawNumber,
        cleanNumber: cleanNumber || '',
        status: 'INVALID',
        reason: 'Malformed phone number format (too short)'
      };
    }

    const candidates = this.getCandidateNumbers(rawNumber, defaultCountryCode);

    try {
      await this.getContext(false);
      if (!this.page || this.page.isClosed()) {
        this.page = await this.context.newPage();
      }

      // Ensure WhatsApp Web is open ONCE (do NOT reload if already loaded!)
      const currentUrl = this.page.url();
      if (!currentUrl.includes('web.whatsapp.com')) {
        await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }

      // Wait until the main WhatsApp Web interface is ready
      const readySelector = '#pane-side, #side, [data-testid="chat-list"], [data-testid="intro-title"]';
      let isReady = await this.page.$(readySelector).catch(() => null);
      if (!isReady) {
        isReady = await this.page.waitForSelector(readySelector, { timeout: 20000 }).catch(() => null);
      }

      if (this.shouldStop) {
        return {
          number: rawNumber,
          cleanNumber,
          status: 'STOPPED',
          reason: 'Validation stopped by user'
        };
      }

      // Check for any security/restriction banner before querying
      const preBodyText = await this.page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
      const preSecMatch = detectSecurityResponse(preBodyText);
      if (preSecMatch) {
        return {
          number: rawNumber,
          cleanNumber,
          status: 'SECURITY_STOP',
          reason: `WhatsApp security/restriction response: "${preSecMatch}"`
        };
      }

      // =========================================================================
      // TIER 1: Instant In-Memory WhatsApp Web WebSocket Query (Zero Page Reload!)
      // Uses WhatsApp Web's internal WAWebQueryExistsJob & WAWebWidFactory modules
      // =========================================================================
      const wsCheck = await this.page
        .evaluate(async (candidateList) => {
          try {
            if (typeof window.require !== 'function') {
              return { handled: false };
            }
            const WidFactory = window.require('WAWebWidFactory');
            const QueryExists = window.require('WAWebQueryExistsJob');
            if (!WidFactory || !QueryExists || typeof QueryExists.queryWidExists !== 'function') {
              return { handled: false };
            }

            for (const phone of candidateList) {
              const wid = WidFactory.createWid(`${phone}@c.us`);
              const res = await QueryExists.queryWidExists(wid);

              if (res && res.wid) {
                // Open the chat in the right pane without reloading
                try {
                  const FindChat = window.require('WAWebFindChatAction');
                  const Cmd = window.require('WAWebCmd');
                  if (FindChat && typeof FindChat.findOrCreateLatestChat === 'function' && Cmd && Cmd.Cmd) {
                    const chat = await FindChat.findOrCreateLatestChat(res.wid);
                    if (chat) {
                      if (typeof Cmd.Cmd.openChatBottom === 'function') {
                        Cmd.Cmd.openChatBottom({ chat });
                      } else if (typeof Cmd.Cmd.openChatFromUnread === 'function') {
                        Cmd.Cmd.openChatFromUnread(chat);
                      }
                    }
                  }
                } catch (openErr) {}

                return {
                  handled: true,
                  matchedPhone: phone,
                  status: 'VALID',
                  reason: 'Active on WhatsApp'
                };
              }
            }

            return {
              handled: true,
              matchedPhone: candidateList[0],
              status: 'INVALID',
              reason: 'Phone number is not on WhatsApp'
            };
          } catch (err) {
            return { handled: false, error: err && err.message ? err.message : String(err) };
          }
        }, candidates)
        .catch(() => ({ handled: false }));

      if (wsCheck && wsCheck.handled) {
        return {
          number: rawNumber,
          cleanNumber: wsCheck.matchedPhone || cleanNumber,
          status: wsCheck.status,
          reason: wsCheck.reason
        };
      }

      // =========================================================================
      // TIER 2: In-Page "New Chat" Drawer Search (Zero Page Reload Fallback!)
      // =========================================================================
      try {
        const searchBoxSelector =
          'div[aria-label="Search name or number"][contenteditable="true"], div[contenteditable="true"][data-tab="3"][aria-label*="Search"]';
        let searchBox = await this.page.$(searchBoxSelector).catch(() => null);

        if (!searchBox) {
          const newChatBtn = await this.page
            .$(
              '[data-icon="new-chat-outline"], [aria-label="New chat"], [title="New chat"], span[data-icon="chat"]'
            )
            .catch(() => null);
          if (newChatBtn) {
            await newChatBtn.click().catch(() => {});
            searchBox = await this.page.waitForSelector(searchBoxSelector, { timeout: 3000 }).catch(() => null);
          }
        }

        if (searchBox) {
          await searchBox.click().catch(() => {});
          await this.page.keyboard.down('Control');
          await this.page.keyboard.press('KeyA');
          await this.page.keyboard.up('Control');
          await this.page.keyboard.press('Backspace');
          await searchBox.fill(cleanNumber).catch(async () => {
            await this.page.keyboard.type(cleanNumber, { delay: 10 });
          });

          const drawerStart = Date.now();
          while (Date.now() - drawerStart < 6000) {
            if (this.shouldStop) {
              return {
                number: rawNumber,
                cleanNumber,
                status: 'STOPPED',
                reason: 'Validation stopped by user'
              };
            }

            const drawerState = await this.page
              .evaluate((phone) => {
                const bodyText = document.body ? document.body.innerText : '';
                if (
                  bodyText.includes(`No results found for '${phone}'`) ||
                  bodyText.includes(`No results found for "${phone}"`) ||
                  /No results found for/i.test(bodyText)
                ) {
                  return 'INVALID';
                }
                if (/Contacts on WhatsApp|Not in your contacts/i.test(bodyText)) {
                  return 'VALID';
                }
                return null;
              }, cleanNumber)
              .catch(() => null);

            if (drawerState === 'INVALID') {
              return {
                number: rawNumber,
                cleanNumber,
                status: 'INVALID',
                reason: 'Phone number is not on WhatsApp'
              };
            }
            if (drawerState === 'VALID') {
              return {
                number: rawNumber,
                cleanNumber,
                status: 'VALID',
                reason: 'Contact found on WhatsApp'
              };
            }

            await new Promise((r) => setTimeout(r, 150));
          }
        }
      } catch (drawerErr) {}

      // =========================================================================
      // TIER 3: Final Fallback to URL navigation if neither Tier 1 nor Tier 2 resolved
      // =========================================================================
      const url = `https://web.whatsapp.com/send/?phone=${cleanNumber}&text&type=phone_number&app_absent=0`;
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (navErr) {}

      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        if (this.shouldStop) {
          return {
            number: rawNumber,
            cleanNumber,
            status: 'STOPPED',
            reason: 'Validation stopped by user'
          };
        }

        try {
          const modal = await this.page.$('div[role="dialog"], div[data-animate-modal-popup="true"]').catch(() => null);
          if (modal) {
            const text = await modal.innerText().catch(() => '');
            const secMatch = detectSecurityResponse(text);
            if (secMatch) {
              return {
                number: rawNumber,
                cleanNumber,
                status: 'SECURITY_STOP',
                reason: `WhatsApp security/restriction response: "${secMatch}"`
              };
            }
            if (isNormalInvalidResponse(text)) {
              try {
                const okButton = await modal.$('button, [role="button"]').catch(() => null);
                if (okButton) await okButton.click().catch(() => {});
                else await this.page.keyboard.press('Escape').catch(() => {});
              } catch (e) {}

              return {
                number: rawNumber,
                cleanNumber,
                status: 'INVALID',
                reason: text.split('\n')[0] || 'Phone number is not on WhatsApp'
              };
            }
          }

          const chatInput = await this.page
            .$(
              'footer div[contenteditable="true"], div[contenteditable="true"][data-tab="10"], div[role="textbox"][data-tab="10"], header [data-testid="conversation-info-header"]'
            )
            .catch(() => null);
          if (chatInput) {
            return {
              number: rawNumber,
              cleanNumber,
              status: 'VALID',
              reason: 'Chat opened successfully'
            };
          }
        } catch (e) {}

        await new Promise((r) => setTimeout(r, 220));
      }

      return {
        number: rawNumber,
        cleanNumber,
        status: 'UNKNOWN',
        reason: 'Could not confidently classify response'
      };
    } catch (err) {
      console.error(`Error validating ${cleanNumber}:`, err);
      return {
        number: rawNumber,
        cleanNumber,
        status: 'ERROR',
        reason: err.message
      };
    }
  }

  // Validate manual list of numbers sequentially with randomized delay
  async validateList(numbers, defaultCountryCode, pacingConfig, onResult, onStatus) {
    this.isRunning = true;
    this.shouldStop = false;

    let minDelay = 1.5;
    let maxDelay = 3.5;
    let startFromRow = 1;
    if (typeof pacingConfig === 'number') {
      minDelay = Math.max(0, pacingConfig);
      maxDelay = Math.max(minDelay, pacingConfig);
    } else if (pacingConfig && typeof pacingConfig === 'object') {
      minDelay = Math.max(0, parseFloat(pacingConfig.minDelay) ?? 1.5);
      maxDelay = Math.max(minDelay, parseFloat(pacingConfig.maxDelay) ?? minDelay);
      startFromRow = Math.max(1, parseInt(pacingConfig.startFromRow, 10) || 1);
    }

    const startIdx = Math.max(0, startFromRow - 1);
    const remainingTotal = Math.max(0, numbers.length - startIdx);

    try {
      if (remainingTotal === 0) {
        onStatus &&
          onStatus({
            error: true,
            completed: true,
            message: `Start row (#${startFromRow}) is beyond the total number of rows (${numbers.length}).`
          });
        this.isRunning = false;
        return;
      }

      onStatus && onStatus({ message: 'Initializing WhatsApp Web session...' });
      const statusCheck = await this.checkLoginStatus();

      if (statusCheck.status === 'QR_REQUIRED') {
        onStatus &&
          onStatus({
            error: true,
            message: 'WhatsApp Web is not logged in. Please scan the QR code first.'
          });
        this.isRunning = false;
        return;
      }

      let processedCount = 0;

      for (let i = startIdx; i < numbers.length; i++) {
        const rowNumber = i + 1;
        if (this.shouldStop) {
          onStatus &&
            onStatus({
              completed: true,
              stopped: true,
              nextStartRow: rowNumber,
              message: `Validation stopped. To continue, start from Row #${rowNumber}.`
            });
          break;
        }

        const rawNumber = numbers[i];
        processedCount++;

        onStatus &&
          onStatus({
            currentIndex: processedCount,
            total: remainingTotal,
            rowNumber,
            currentNumber: rawNumber,
            message: `Row #${rowNumber} • Validating (${processedCount}/${remainingTotal}): ${rawNumber || '(Empty Row)'}...`
          });

        const result = await this.validateSingleNumber(rawNumber, defaultCountryCode);
        if (result.status === 'STOPPED') {
          onStatus &&
            onStatus({
              completed: true,
              stopped: true,
              nextStartRow: rowNumber,
              message: `Validation stopped at Row #${rowNumber}. To continue, start from Row #${rowNumber}.`
            });
          break;
        }

        result.rowNumber = rowNumber;
        onResult && onResult(result);

        if (result.status === 'SECURITY_STOP') {
          this.shouldStop = true;
          if (this._activePacing) {
            clearInterval(this._activePacing.timer);
            this._activePacing.resolve(false);
            this._activePacing = null;
          }
          onStatus &&
            onStatus({
              securityStop: true,
              error: true,
              completed: true,
              nextStartRow: rowNumber,
              message: 'Checking stopped because WhatsApp returned a security/restriction response.'
            });
          break;
        }

        if (i < numbers.length - 1 && !this.shouldStop && result.status !== 'NO NUMBER') {
          const delaySeconds =
            minDelay === maxDelay
              ? minDelay
              : Number((minDelay + Math.random() * (maxDelay - minDelay)).toFixed(1));
          const delayMs = delaySeconds * 1000;

          onStatus &&
            onStatus({
              pacing: true,
              delaySeconds,
              currentIndex: processedCount,
              total: remainingTotal,
              rowNumber,
              message: `Row #${rowNumber} ✓ • Pacing: waiting ${delaySeconds}s before Row #${rowNumber + 1}...`
            });

          const completedSleep = await this.cancellableSleep(delayMs);
          if (!completedSleep || this.shouldStop) {
            onStatus &&
              onStatus({
                completed: true,
                stopped: true,
                nextStartRow: rowNumber + 1,
                message: `Validation stopped after Row #${rowNumber}. To continue, start from Row #${rowNumber + 1}.`
              });
            break;
          }
        }
      }

      if (!this.shouldStop) {
        onStatus && onStatus({ completed: true, message: 'Validation completed.' });
      }
    } catch (err) {
      console.error('Batch validation error:', err);
      onStatus && onStatus({ error: true, message: err.message });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * ULTRA FEATURE: Validate Google Sheet row-by-row and write results ("Valid" / "Invalid")
   * directly into the right-side "Validity" column in real time (cloud saved automatically).
   * Stopping at any point preserves all previously written rows in the "Validity" column.
   */
  async validateGoogleSheet(sheetConfig, onResult, onStatus) {
    this.isRunning = true;
    this.shouldStop = false;

    const {
      spreadsheetId,
      tabsToProcess = [], // [{ gid, name, phoneColLetter }]
      defaultCountryCode = '',
      pacing = { minDelay: 1.5, maxDelay: 3.5 },
      startFromRow = 1
    } = sheetConfig;

    const minDelay = Math.max(0, parseFloat(pacing.minDelay) ?? 1.5);
    const maxDelay = Math.max(minDelay, parseFloat(pacing.maxDelay) ?? minDelay);
    const requestedStartRow = Math.max(1, parseInt(startFromRow, 10) || 1);

    try {
      onStatus && onStatus({ message: 'Checking WhatsApp Web authentication...' });
      const statusCheck = await this.checkLoginStatus();

      if (statusCheck.status === 'QR_REQUIRED') {
        onStatus &&
          onStatus({
            error: true,
            message: 'WhatsApp Web is not logged in. Please scan the QR code first.'
          });
        this.isRunning = false;
        return;
      }

      // First prepare the work plan across all requested tabs so we know total rows
      const preparedTabs = [];
      let grandTotalRows = 0;

      for (const tabReq of tabsToProcess) {
        if (this.shouldStop) break;
        let targetColLetter = tabReq.phoneColLetter;

        if (!targetColLetter || targetColLetter === 'AUTO') {
          const analysis = await sheetsSync.analyzeTabColumns(spreadsheetId, tabReq.gid, tabReq.name);
          targetColLetter = analysis.bestColumnLetter;
        }

        if (!targetColLetter) continue;

        const tabData = await sheetsSync.getTabRowsForValidation(spreadsheetId, tabReq.gid, targetColLetter);
        if (tabData.entries.length > 0) {
          // Filter entries to start from requestedStartRow (e.g. Row #649)
          const filteredEntries = tabData.entries.filter((e) => e.rowNumber >= requestedStartRow);
          if (filteredEntries.length > 0) {
            preparedTabs.push({
              gid: tabReq.gid,
              name: tabReq.name || 'Sheet',
              phoneColLetter: tabData.phoneColLetter,
              validityColLetter: tabData.validityColLetter,
              rightColumnAction: tabData.rightColumnAction,
              entries: filteredEntries
            });
            grandTotalRows += filteredEntries.length;
          }
        }
      }

      if (preparedTabs.length === 0 || grandTotalRows === 0) {
        onStatus &&
          onStatus({
            error: true,
            completed: true,
            message:
              requestedStartRow > 1
                ? `Start row (#${requestedStartRow}) is beyond the total rows in the selected Google Sheet column.`
                : 'No phone number rows found in the selected Google Sheet column.'
          });
        this.isRunning = false;
        return;
      }

      onStatus &&
        onStatus({
          total: grandTotalRows,
          currentIndex: 0,
          message:
            requestedStartRow > 1
              ? `Connecting to Google Sheet (Continuing from Row #${requestedStartRow} • ${grandTotalRows} rows remaining)...`
              : `Connecting to Google Sheet in browser for live cloud sync (${grandTotalRows} rows)...`
        });

      let processedGlobal = 0;

      for (const tab of preparedTabs) {
        if (this.shouldStop) break;

        onStatus &&
          onStatus({
            total: grandTotalRows,
            currentIndex: processedGlobal,
            message: `Opening tab "${tab.name}" and preparing right-side "Validity" column (Col ${tab.validityColLetter})...`
          });

        // Open/switch to this sheet tab in Playwright
        const sheetPage = await sheetsSync.ensureSheetPage(
          this.getContext.bind(this),
          spreadsheetId,
          tab.gid,
          true
        );

        if (this.shouldStop) break;

        const colPrep = await sheetsSync.prepareValidityColumn(
          sheetPage,
          tab.phoneColLetter,
          tab.validityColLetter,
          tab.rightColumnAction
        );

        const prepMsg =
          colPrep.actionTaken === 'REUSED_EXISTING_COLUMN'
            ? `Using existing "Validity" column (Col ${tab.validityColLetter}) in "${tab.name}".`
            : colPrep.actionTaken === 'INSERTED_NEW_COLUMN'
            ? `Inserted new "Validity" column at Col ${tab.validityColLetter} in "${tab.name}".`
            : `Titled Col ${tab.validityColLetter} as "Validity" in "${tab.name}".`;

        onStatus &&
          onStatus({
            total: grandTotalRows,
            currentIndex: processedGlobal,
            message: prepMsg
          });

        for (let i = 0; i < tab.entries.length; i++) {
          const entry = tab.entries[i];

          if (this.shouldStop) {
            onStatus &&
              onStatus({
                completed: true,
                stopped: true,
                nextStartRow: entry.rowNumber,
                message: `Stopped before Row #${entry.rowNumber} (Sheet Row ${entry.sheetRow}). To continue, start from Row #${entry.rowNumber}.`
              });
            break;
          }

          processedGlobal++;

          onStatus &&
            onStatus({
              currentIndex: processedGlobal,
              total: grandTotalRows,
              rowNumber: entry.rowNumber,
              currentNumber: entry.rawNumber,
              message: `[${tab.name} • Row #${entry.rowNumber} (${entry.targetCell})] Validating (${processedGlobal}/${grandTotalRows}): ${entry.rawNumber || '(Empty Row)'}...`
            });

          const result = await this.validateSingleNumber(entry.rawNumber, defaultCountryCode);

          // If user clicked Stop while validateSingleNumber was polling, do not overwrite or erase anything
          if (result.status === 'STOPPED' || this.shouldStop) {
            onStatus &&
              onStatus({
                completed: true,
                stopped: true,
                nextStartRow: entry.rowNumber,
                message: `Stopped at "${tab.name}" Row #${entry.rowNumber} (Sheet Row ${entry.sheetRow}). To continue, start from Row #${entry.rowNumber}.`
              });
            break;
          }

          // Immediately stop on WhatsApp security response without corrupting sheet
          if (result.status === 'SECURITY_STOP') {
            this.shouldStop = true;
            if (this._activePacing) {
              clearInterval(this._activePacing.timer);
              this._activePacing.resolve(false);
              this._activePacing = null;
            }
            result.rowNumber = entry.rowNumber;
            result.sheetName = tab.name;
            result.sheetRow = entry.sheetRow;
            result.targetCell = entry.targetCell;
            result.cloudSaved = false;
            onResult && onResult(result);

            onStatus &&
              onStatus({
                securityStop: true,
                error: true,
                completed: true,
                nextStartRow: entry.rowNumber,
                message: 'Checking stopped because WhatsApp returned a security/restriction response.'
              });
            break;
          }

          // Write result ("VALID", "INVALID", "NO NUMBER", etc.) directly to the right-side "Validity" cell in Google Sheets
          onStatus &&
            onStatus({
              currentIndex: processedGlobal,
              total: grandTotalRows,
              rowNumber: entry.rowNumber,
              message: `[${tab.name} • Row #${entry.rowNumber} (${entry.targetCell})] Writing "${result.status}" to Google Sheet "Validity" column...`
            });

          let cloudSaved = false;
          try {
            await sheetsSync.writeCell(sheetPage, entry.targetCell, result.status);
            cloudSaved = true;
          } catch (writeErr) {
            console.error(`Failed writing to ${entry.targetCell}:`, writeErr.message);
            result.reason = `${result.reason} (Sheet write warning: ${writeErr.message})`;
          }

          result.rowNumber = entry.rowNumber;
          result.sheetName = tab.name;
          result.sheetRow = entry.sheetRow;
          result.targetCell = entry.targetCell;
          result.cloudSaved = cloudSaved;

          onResult && onResult(result);

          if (this.shouldStop) {
            onStatus &&
              onStatus({
                completed: true,
                stopped: true,
                nextStartRow: entry.rowNumber + 1,
                message: `Stopped after saving Row #${entry.rowNumber} (${entry.targetCell}). To continue next time, start from Row #${entry.rowNumber + 1}.`
              });
            break;
          }

          // Randomized pacing delay between checks (unless last row or empty row)
          if (processedGlobal < grandTotalRows && !this.shouldStop && result.status !== 'NO NUMBER') {
            const delaySeconds =
              minDelay === maxDelay
                ? minDelay
                : Number((minDelay + Math.random() * (maxDelay - minDelay)).toFixed(1));
            const delayMs = delaySeconds * 1000;

            onStatus &&
              onStatus({
                pacing: true,
                delaySeconds,
                currentIndex: processedGlobal,
                total: grandTotalRows,
                rowNumber: entry.rowNumber,
                message: `Saved Row #${entry.rowNumber} (${entry.targetCell}) ✓ • Pacing: waiting ${delaySeconds}s before Row #${entry.rowNumber + 1}...`
              });

            const completedSleep = await this.cancellableSleep(delayMs);
            if (!completedSleep || this.shouldStop) {
              onStatus &&
                onStatus({
                  completed: true,
                  stopped: true,
                  nextStartRow: entry.rowNumber + 1,
                  message: `Stopped after Row #${entry.rowNumber}. All written "Validity" results are saved in Google Sheets. Continue from Row #${entry.rowNumber + 1}.`
                });
              break;
            }
          }
        }
      }

      if (!this.shouldStop) {
        onStatus &&
          onStatus({
            completed: true,
            message: `Google Sheet validation completed! All ${processedGlobal} results written to "Validity" column & saved to cloud.`
          });
      }
    } catch (err) {
      console.error('Google Sheet validation error:', err);
      onStatus && onStatus({ error: true, completed: true, message: err.message });
    } finally {
      this.isRunning = false;
    }
  }

  stop() {
    this.shouldStop = true;
    if (this._activePacing) {
      clearInterval(this._activePacing.timer);
      this._activePacing.resolve(false);
      this._activePacing = null;
    }
  }
}

const validatorInstance = new WhatsAppValidator();
validatorInstance.WhatsAppValidator = WhatsAppValidator;
validatorInstance.SECURITY_PATTERNS = SECURITY_PATTERNS;
validatorInstance.detectSecurityResponse = detectSecurityResponse;
validatorInstance.isNormalInvalidResponse = isNormalInvalidResponse;

module.exports = validatorInstance;
