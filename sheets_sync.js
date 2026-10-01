/**
 * OutGrow WhatsApp Validator ULTRA
 * Google Sheets Live Cloud Sync Engine
 * - Automatic URL Tab (#gid) Detection & Multi-Tab Discovery
 * - Smart Phone Column Detection (📞 Badge & Row Count)
 * - Right-Side "Validity" Column Inspection, Auto-Insert & Live Row-by-Row Writing
 */

class GoogleSheetsSync {
  constructor() {
    this.sheetPage = null;
    this.currentSpreadsheetId = null;
    this.currentGid = null;
  }

  /**
   * Extract spreadsheetId and optional gid from any Google Sheets URL
   */
  parseSheetUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return null;
    }
    const trimmed = rawUrl.trim();
    const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) {
      return null;
    }
    const spreadsheetId = idMatch[1];
    const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
    const urlGid = gidMatch ? gidMatch[1] : null;

    return {
      spreadsheetId,
      urlGid,
      cleanUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit${urlGid ? `#gid=${urlGid}` : ''}`
    };
  }

  /**
   * Convert 0-based column index to Excel/Sheets column letter (0 -> A, 1 -> B, 26 -> AA)
   */
  indexToColumnLetter(index) {
    let temp;
    let letter = '';
    let i = index;
    while (i >= 0) {
      temp = i % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      i = Math.floor(i / 26) - 1;
    }
    return letter;
  }

  /**
   * Convert Excel/Sheets column letter to 0-based index (A -> 0, B -> 1)
   */
  columnLetterToIndex(letter) {
    if (!letter) return 0;
    const clean = letter.toUpperCase().trim();
    let index = 0;
    for (let i = 0; i < clean.length; i++) {
      index = index * 26 + (clean.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * RFC-4180 compliant CSV parser returning 2D array of rows/cells
   */
  parseCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentVal += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentVal += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentVal);
          currentVal = '';
        } else if (char === '\r' && nextChar === '\n') {
          currentRow.push(currentVal);
          rows.push(currentRow);
          currentRow = [];
          currentVal = '';
          i++;
        } else if (char === '\n' || char === '\r') {
          currentRow.push(currentVal);
          rows.push(currentRow);
          currentRow = [];
          currentVal = '';
        } else {
          currentVal += char;
        }
      }
    }

    if (currentVal.length > 0 || currentRow.length > 0) {
      currentRow.push(currentVal);
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * Check if a cell string looks like a phone number
   */
  looksLikePhoneNumber(val) {
    if (!val) return false;
    const str = val.toString().trim();
    if (!str) return false;
    // Reject obvious dates, emails, URLs, or pure text words
    if (str.includes('@') || str.includes('http') || /[a-zA-Z]{3,}/.test(str)) {
      return false;
    }
    const digitsOnly = str.replace(/[\s\(\)\-\.\+]/g, '');
    return /^\d{7,15}$/.test(digitsOnly);
  }

  /**
   * Fetch raw CSV for a specific spreadsheetId and gid
   */
  async fetchTabCsv(spreadsheetId, gid = '0') {
    const targetGid = gid !== null && gid !== undefined ? gid : '0';
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${targetGid}`;
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${targetGid}`;

    try {
      const res = await fetch(exportUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        redirect: 'follow'
      });

      if (res.ok) {
        const text = await res.text();
        if (!text.trim().startsWith('<!DOCTYPE html') && !text.trim().startsWith('<html')) {
          return text;
        }
      }
    } catch (e) {
      // Fallback to gviz below
    }

    const resGviz = await fetch(gvizUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!resGviz.ok) {
      throw new Error(`Unable to read Google Sheet (HTTP ${resGviz.status}). Make sure link sharing is enabled ("Anyone with the link").`);
    }

    const gvizText = await resGviz.text();
    if (gvizText.trim().startsWith('<!DOCTYPE html') || gvizText.trim().startsWith('<html')) {
      throw new Error('This Google Sheet is private. Please set General Access to "Anyone with the link -> Editor".');
    }

    return gvizText;
  }

  /**
   * Discover all tabs/sheets (names & gids) and workbook title from a Google Sheet
   */
  async discoverWorkbook(rawUrl, getContextFn = null) {
    const parsed = this.parseSheetUrl(rawUrl);
    if (!parsed) {
      throw new Error('Invalid Google Sheets URL. Please paste a valid link like https://docs.google.com/spreadsheets/d/.../edit');
    }

    const { spreadsheetId, urlGid } = parsed;
    let title = 'Google Spreadsheet';
    const tabs = [];
    const seenGids = new Set();

    const addTab = (name, gid) => {
      if (!gid || seenGids.has(String(gid))) return;
      seenGids.add(String(gid));
      // Unescape common JS escapes if any
      const cleanName = (name || `Sheet ${tabs.length + 1}`)
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\u0026/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .trim();
      tabs.push({
        name: cleanName,
        gid: String(gid)
      });
    };

    // 1. Fast HTTP discovery via /htmlview and /edit
    try {
      const htmlViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
      const res = await fetch(htmlViewUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        redirect: 'follow'
      });

      if (res.ok) {
        const html = await res.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && !titleMatch[1].toLowerCase().includes('sign in')) {
          title = titleMatch[1].replace(/\s*-\s*Google Sheets$/i, '').trim() || title;
        }

        // Pattern A: items.push({name: "Sheet1", pageUrl: "...", gid: "0", ...})
        const itemsRegex = /items\.push\(\{\s*name:\s*["']((?:[^"'\\]|\\.)*)["']\s*,\s*pageUrl:\s*["'][^"']*["']\s*,\s*gid:\s*["'](\d+)["']/g;
        let match;
        while ((match = itemsRegex.exec(html)) !== null) {
          addTab(match[1], match[2]);
        }

        // Pattern B: <li id="sheet-button-0"><a href="#">Sheet1</a></li>
        if (tabs.length === 0) {
          const liRegex = /id=["']sheet-button-(\d+)["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi;
          while ((match = liRegex.exec(html)) !== null) {
            const strippedName = match[2].replace(/<[^>]+>/g, '').trim();
            addTab(strippedName, match[1]);
          }
        }
      }
    } catch (e) {
      console.warn('[SheetsSync] htmlview tab discovery warning:', e.message);
    }

    // 2. Also check /edit HTML if tabs still empty
    if (tabs.length === 0) {
      try {
        const editUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        const res = await fetch(editUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          },
          redirect: 'follow'
        });
        if (res.ok) {
          const html = await res.text();
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && !titleMatch[1].toLowerCase().includes('sign in')) {
            title = titleMatch[1].replace(/\s*-\s*Google Sheets$/i, '').trim() || title;
          }
          // Look for bootstrap tab definitions: [index, 0, "gid", [{"1":[[0,0,"TabName"]
          const bootstrapRegex = /\[\d+,0,["'](\d+)["'],\[\{"1":\[\[0,0,["']((?:[^"'\\]|\\.)*)["']\]/g;
          let bMatch;
          while ((bMatch = bootstrapRegex.exec(html)) !== null) {
            addTab(bMatch[2], bMatch[1]);
          }
        }
      } catch (e) {
        console.warn('[SheetsSync] edit page discovery warning:', e.message);
      }
    }

    // 3. Fallback: If still 0 tabs and Playwright context provider is available, inspect live DOM
    if (tabs.length === 0 && typeof getContextFn === 'function') {
      try {
        const page = await this.ensureSheetPage(getContextFn, spreadsheetId, urlGid || '0', false);
        const domInfo = await page.evaluate(() => {
          const docTitle = document.title ? document.title.replace(/\s*-\s*Google Sheets$/i, '').trim() : '';
          const tabNodes = Array.from(document.querySelectorAll('.docs-sheet-tab'));
          const extracted = tabNodes.map((el, idx) => {
            const idAttr = el.getAttribute('id') || '';
            const gid = idAttr.replace('sheet-button-', '') || String(idx);
            const nameEl = el.querySelector('.docs-sheet-tab-name');
            const name = nameEl ? nameEl.textContent.trim() : `Sheet${idx + 1}`;
            return { name, gid };
          });
          return { docTitle, extracted };
        });
        if (domInfo.docTitle) title = domInfo.docTitle;
        for (const t of domInfo.extracted) {
          addTab(t.name, t.gid);
        }
      } catch (e) {
        console.warn('[SheetsSync] Playwright tab discovery fallback warning:', e.message);
      }
    }

    // 4. Verify we can at least fetch CSV of the default/URL gid
    if (tabs.length === 0) {
      const fallbackGid = urlGid || '0';
      await this.fetchTabCsv(spreadsheetId, fallbackGid);
      addTab('Sheet1', fallbackGid);
    } else if (urlGid && !seenGids.has(String(urlGid))) {
      // Ensure the URL's gid is in the list
      addTab(`Sheet (gid:${urlGid})`, urlGid);
    }

    // Determine which tab was matched from the URL
    let detectedTab = tabs[0];
    let detectedFromUrl = false;
    if (urlGid) {
      const matched = tabs.find((t) => String(t.gid) === String(urlGid));
      if (matched) {
        detectedTab = matched;
        detectedFromUrl = true;
      }
    } else if (tabs.length === 1) {
      detectedFromUrl = true;
    }

    // Analyze the detected tab immediately so its columns are ready
    const initialTabAnalysis = await this.analyzeTabColumns(spreadsheetId, detectedTab.gid, detectedTab.name);

    return {
      spreadsheetId,
      title,
      urlGid,
      tabs,
      detectedTab,
      detectedFromUrl,
      initialTabAnalysis
    };
  }

  /**
   * Analyze a specific sheet tab (by gid) to list all columns, highlight phone columns (📞),
   * and inspect the right-side column for "Validity" placement.
   */
  async analyzeTabColumns(spreadsheetId, gid, tabName = 'Sheet') {
    const csvText = await this.fetchTabCsv(spreadsheetId, gid);
    const rows = this.parseCSV(csvText);

    if (!rows || rows.length === 0) {
      return {
        spreadsheetId,
        gid: String(gid),
        tabName,
        totalRows: 0,
        columns: [],
        bestColumnLetter: null
      };
    }

    // Determine max columns across all rows
    let maxCols = 0;
    for (const r of rows) {
      if (r.length > maxCols) maxCols = r.length;
    }

    // Determine if Row 1 (index 0) is a header row
    // Even if a user has headers like "Phone Number", "Phone", Row 1 is index 0, data starts at index 1 (Sheet Row 2)
    const headerRow = rows[0] || [];
    const dataStartRowIdx = 1; // Sheet Row 2

    // Find the last active row in the sheet (where any column has data)
    let lastActiveRowIdx = 0;
    for (let r = rows.length - 1; r >= dataStartRowIdx; r--) {
      const rowArr = rows[r] || [];
      const hasAnyValue = rowArr.some((cell) => cell !== undefined && String(cell).trim() !== '');
      if (hasAnyValue) {
        lastActiveRowIdx = r;
        break;
      }
    }

    const columns = [];
    let highestScore = -1;
    let bestColumnLetter = null;

    for (let colIdx = 0; colIdx < maxCols; colIdx++) {
      const colLetter = this.indexToColumnLetter(colIdx);
      const rawHeader = (headerRow[colIdx] || '').trim();
      const displayHeader = rawHeader || `Untitled (${colLetter})`;
      const headerLower = rawHeader.toLowerCase();

      let filledRowCount = 0;
      let phoneMatchCount = 0;
      const sampleNumbers = [];
      const phoneValues = [];

      for (let r = dataStartRowIdx; r <= lastActiveRowIdx; r++) {
        const cellVal = rows[r] && rows[r][colIdx] !== undefined ? String(rows[r][colIdx]).trim() : '';
        phoneValues.push(cellVal);
        if (cellVal !== '') {
          filledRowCount++;
          if (this.looksLikePhoneNumber(cellVal)) {
            phoneMatchCount++;
            if (sampleNumbers.length < 3) {
              sampleNumbers.push(cellVal);
            }
          }
        }
      }

      // Skip trailing completely blank columns that have neither header nor data
      if (!rawHeader && filledRowCount === 0) {
        continue;
      }

      const rowCount = lastActiveRowIdx;

      const isStatusHeader = /^(validity|valid|status|whatsapp status|wa status|result|verified|check)$/i.test(headerLower);
      const hasPhoneKeyword = !isStatusHeader && /(phone|mobile|whatsapp|\bwa\b|contact|number|tel|cell|mob|\bph\b)/i.test(headerLower);
      const phoneRatio = filledRowCount > 0 ? phoneMatchCount / filledRowCount : 0;
      const isPhoneColumn = !isStatusHeader && (hasPhoneKeyword || (phoneMatchCount > 0 && (phoneRatio >= 0.3 || phoneMatchCount >= 2)));

      // Score column to auto-select best match
      let score = 0;
      if (isPhoneColumn) {
        score += phoneMatchCount * 10;
        if (/^(phone number|whatsapp number|mobile number|phone|mobile|whatsapp|contact number|primary phone)$/i.test(headerLower)) {
          score += 2000;
        } else if (hasPhoneKeyword) {
          score += 1000;
        }
        if (filledRowCount > 0) {
          score += 200;
        }
        if (score > highestScore) {
          highestScore = score;
          bestColumnLetter = colLetter;
        }
      }

      // Inspect the column immediately to the right (colIdx + 1)
      const rightColIdx = colIdx + 1;
      const rightColLetter = this.indexToColumnLetter(rightColIdx);
      const rightHeaderRaw = (headerRow[rightColIdx] || '').trim();
      let rightDataCount = 0;
      let lastFilledDataRow = 0;
      for (let r = dataStartRowIdx; r <= lastActiveRowIdx; r++) {
        const rv = rows[r] && rows[r][rightColIdx] !== undefined ? String(rows[r][rightColIdx]).trim() : '';
        if (rv !== '') {
          rightDataCount++;
          lastFilledDataRow = r;
        }
      }

      let rightColumnAction = 'INSERT_RIGHT';
      let rightColumnMessage = '';
      let autoResumeRow = 1;
      if (rightHeaderRaw.toLowerCase() === 'validity') {
        rightColumnAction = 'REUSE_VALIDITY';
        if (lastFilledDataRow > 0 && lastFilledDataRow < rowCount) {
          autoResumeRow = lastFilledDataRow + 1;
          rightColumnMessage = `Column ${rightColLetter} is already "Validity" (${rightDataCount} rows completed up to Row #${lastFilledDataRow}) — auto-set to continue from Row #${autoResumeRow}!`;
        } else if (lastFilledDataRow >= rowCount && rowCount > 0) {
          autoResumeRow = 1;
          rightColumnMessage = `Column ${rightColLetter} is already "Validity" (All ${rowCount} rows filled).`;
        } else {
          rightColumnMessage = `Column ${rightColLetter} is already "Validity" — will write directly into Column ${rightColLetter} without creating a new column.`;
        }
      } else if (rightHeaderRaw === '' && rightDataCount === 0) {
        rightColumnAction = 'USE_EMPTY_RIGHT';
        rightColumnMessage = `Column ${rightColLetter} is empty — will set "${rightColLetter}1" as "Validity" and write results in Column ${rightColLetter}.`;
      } else {
        rightColumnAction = 'INSERT_RIGHT';
        const existingLabel = rightHeaderRaw ? `"${rightHeaderRaw}"` : `data (${rightDataCount} rows)`;
        rightColumnMessage = `Column ${rightColLetter} contains ${existingLabel} — will insert 1 new column to the right of Column ${colLetter} as "Validity" (new Column ${rightColLetter}).`;
      }

      columns.push({
        colIndex: colIdx,
        colLetter,
        header: rawHeader,
        displayHeader,
        rowCount,
        filledRowCount,
        phoneMatchCount,
        isPhoneColumn,
        isBestMatch: false,
        score,
        sampleNumbers,
        phoneValues,
        rightColIndex: rightColIdx,
        rightColLetter,
        rightHeader: rightHeaderRaw,
        rightDataCount,
        lastFilledDataRow,
        autoResumeRow,
        rightColumnAction,
        rightColumnMessage
      });
    }

    // If no phone column was detected by keyword/digits, pick the first column with rows as fallback
    if (!bestColumnLetter && columns.length > 0) {
      const firstWithRows = columns.find((c) => c.filledRowCount > 0) || columns[0];
      bestColumnLetter = firstWithRows.colLetter;
    }

    columns.forEach((c) => {
      if (c.colLetter === bestColumnLetter) {
        c.isBestMatch = true;
      }
    });

    // Sort columns so 📞 phone columns appear at the top, preserving best match first
    const sortedColumns = [
      ...columns.filter((c) => c.isPhoneColumn).sort((a, b) => b.score - a.score || a.colIndex - b.colIndex),
      ...columns.filter((c) => !c.isPhoneColumn).sort((a, b) => a.colIndex - b.colIndex)
    ];

    return {
      spreadsheetId,
      gid: String(gid),
      tabName,
      totalRows: lastActiveRowIdx,
      columns: sortedColumns,
      bestColumnLetter
    };
  }

  /**
   * Extract the exact list of rows to validate for a given tab and phone column letter
   */
  async getTabRowsForValidation(spreadsheetId, gid, phoneColLetter) {
    const csvText = await this.fetchTabCsv(spreadsheetId, gid);
    const rows = this.parseCSV(csvText);
    if (!rows || rows.length === 0) {
      return {
        entries: [],
        rightColumnAction: 'USE_EMPTY_RIGHT',
        phoneColIndex: 0,
        phoneColLetter: phoneColLetter || 'A',
        validityColLetter: 'B'
      };
    }

    const headerRow = rows[0] || [];
    const phoneColIndex = this.columnLetterToIndex(phoneColLetter);
    const rightColIndex = phoneColIndex + 1;
    const validityColLetter = this.indexToColumnLetter(rightColIndex);

    const rightHeaderRaw = (headerRow[rightColIndex] || '').trim();
    let rightDataCount = 0;
    for (let r = 1; r < rows.length; r++) {
      const rv = rows[r] && rows[r][rightColIndex] !== undefined ? String(rows[r][rightColIndex]).trim() : '';
      if (rv !== '') rightDataCount++;
    }

    let rightColumnAction = 'INSERT_RIGHT';
    if (rightHeaderRaw.toLowerCase() === 'validity') {
      rightColumnAction = 'REUSE_VALIDITY';
    } else if (rightHeaderRaw === '' && rightDataCount === 0) {
      rightColumnAction = 'USE_EMPTY_RIGHT';
    } else {
      rightColumnAction = 'INSERT_RIGHT';
    }

    // Find the last active row in the sheet (where any column has data)
    let lastActiveRowIdx = 0;
    for (let r = rows.length - 1; r >= 1; r--) {
      const rowArr = rows[r] || [];
      const hasAnyValue = rowArr.some((cell) => cell !== undefined && String(cell).trim() !== '');
      if (hasAnyValue) {
        lastActiveRowIdx = r;
        break;
      }
    }

    const entries = [];
    for (let r = 1; r <= lastActiveRowIdx; r++) {
      const rawPhone = rows[r] && rows[r][phoneColIndex] !== undefined ? String(rows[r][phoneColIndex]).trim() : '';

      const existingValidity =
        rightColumnAction === 'REUSE_VALIDITY' && rows[r] && rows[r][rightColIndex] !== undefined
          ? String(rows[r][rightColIndex]).trim()
          : '';

      entries.push({
        rowNumber: r, // 1-based data row index (1, 2, ..., 648, 649)
        sheetRow: r + 1, // 1-based Google Sheet row number (Row 2, Row 3, ...)
        rawNumber: rawPhone,
        isEmptyRow: !rawPhone,
        existingValidity,
        targetCell: `${validityColLetter}${r + 1}`
      });
    }

    return {
      entries,
      rightColumnAction,
      phoneColIndex,
      phoneColLetter: this.indexToColumnLetter(phoneColIndex),
      validityColLetter,
      rightHeaderRaw
    };
  }

  /**
   * Open or reuse the Google Sheet tab inside Playwright browser context for live cloud writing
   */
  async ensureSheetPage(getContextFn, spreadsheetId, gid, requireEditAccess = true) {
    const context = await getContextFn(false);

    if (!this.sheetPage || this.sheetPage.isClosed()) {
      this.sheetPage = await context.newPage();
    }

    const targetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${gid}#gid=${gid}`;
    const currentUrl = this.sheetPage.url();

    const needsNavigation =
      !currentUrl.includes(`/spreadsheets/d/${spreadsheetId}`) ||
      this.currentSpreadsheetId !== spreadsheetId ||
      String(this.currentGid) !== String(gid);

    if (needsNavigation) {
      await this.sheetPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      this.currentSpreadsheetId = spreadsheetId;
      this.currentGid = String(gid);
    }

    // Wait for Google Sheets editor UI to initialize (Name Box or Menu Bar)
    await this.sheetPage
      .waitForSelector('#t-name-box, input.waffle-name-box, #docs-menubar', { timeout: 25000 })
      .catch(() => {});

    // Give Google Sheets canvas a brief moment to settle
    await new Promise((r) => setTimeout(r, 1200));

    // If switching gid within the same spreadsheet, also verify active tab matches gid
    await this.sheetPage
      .evaluate((targetGid) => {
        const tabBtn = document.getElementById(`sheet-button-${targetGid}`);
        if (tabBtn && !tabBtn.classList.contains('docs-sheet-active-tab')) {
          tabBtn.click();
        }
      }, String(gid))
      .catch(() => {});

    if (requireEditAccess) {
      const isViewOnly = await this.sheetPage.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const viewOnlyBadge = document.querySelector('#docs-toolbar-mode-switcher[aria-label*="View only"], [data-tooltip*="View only"], [aria-label*="Request edit access"]');
        const nameBox = document.querySelector('#t-name-box, input.waffle-name-box');
        if (viewOnlyBadge) return true;
        if (bodyText.includes('Request edit access') && !nameBox) return true;
        return false;
      });

      if (isViewOnly) {
        throw new Error(
          'Google Sheet is in "View Only" mode. Please click "Share" in your Google Sheet and change General Access to "Anyone with the link -> Editor" so Ultra can write the Validity column.'
        );
      }
    }

    return this.sheetPage;
  }

  /**
   * Jump to a specific cell coordinate (e.g. "B1" or "C5") using Google Sheets Name Box
   */
  async jumpToCell(page, cellRef) {
    const nameBoxSelector = '#t-name-box, input.waffle-name-box';
    const nameBox = await page.waitForSelector(nameBoxSelector, { timeout: 10000 });
    await nameBox.fill(cellRef);
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 110));
  }

  /**
   * Write a literal text value into a specific cell coordinate and let Google Sheets auto-save to cloud.
   * Uses trailing-space + Backspace trick so Google Sheets NEVER autocompletes "Valid" into the header "Validity".
   */
  async writeCell(page, cellRef, value) {
    await this.jumpToCell(page, cellRef);
    // Clear any existing cell content first
    await page.keyboard.press('Delete');

    // Format status nicely ("Valid" / "Invalid") while preserving headers like "Validity"
    let cleanText = String(value || '').trim();
    if (cleanText.toUpperCase() === 'VALID') cleanText = 'Valid';
    else if (cleanText.toUpperCase() === 'INVALID') cleanText = 'Invalid';

    // Type the text followed by a trailing space ("Valid ").
    // Because "Validity" does not have a space after 'd', the trailing space immediately cancels
    // Google Sheets' column auto-complete suggestion ("Validity"), and Backspace removes the space!
    await page.keyboard.type(`${cleanText} `, { delay: 5 });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 90));
  }

  /**
   * Prepare the right-side "Validity" column before row-by-row validation starts:
   * - If rightColumnAction === 'REUSE_VALIDITY': do nothing (column is already "Validity")
   * - If rightColumnAction === 'USE_EMPTY_RIGHT': write "Validity" in Row 1 of right column
   * - If rightColumnAction === 'INSERT_RIGHT': insert 1 column to the right of phoneColLetter and title it "Validity"
   */
  async prepareValidityColumn(page, phoneColLetter, validityColLetter, rightColumnAction) {
    if (rightColumnAction === 'REUSE_VALIDITY') {
      // Already has "Validity" column immediately to the right — do not insert a new column
      return { actionTaken: 'REUSED_EXISTING_COLUMN', column: validityColLetter };
    }

    if (rightColumnAction === 'USE_EMPTY_RIGHT') {
      // Right column is empty — just write "Validity" in Row 1
      await this.writeCell(page, `${validityColLetter}1`, 'Validity');
      return { actionTaken: 'TITLED_EMPTY_COLUMN', column: validityColLetter };
    }

    // Otherwise rightColumnAction === 'INSERT_RIGHT':
    // 1. Jump to phone column Row 1 (e.g. B1)
    await this.jumpToCell(page, `${phoneColLetter}1`);
    await new Promise((r) => setTimeout(r, 300));

    let inserted = false;

    // Strategy A: Use Google Sheets "Search the menus" (Alt+/) to run "Insert 1 column right"
    try {
      const omnibox = await page.$('input.docs-omnibox-input, [aria-label*="Search the menus"]');
      if (omnibox) {
        await omnibox.click();
      } else {
        await page.keyboard.press('Alt+Slash');
      }
      await new Promise((r) => setTimeout(r, 350));

      await page.keyboard.type('Insert 1 column right', { delay: 20 });
      await new Promise((r) => setTimeout(r, 450));

      // Click the matching menu item in the omnibox popup
      const menuOption = await page.$(
        '.goog-menuitem:has-text("Insert 1 column right"), .docs-omnibox-autocomplete .goog-menuitem-content:has-text("Insert 1 column right"), .goog-menuitem:has-text("column right")'
      );
      if (menuOption) {
        await menuOption.click();
        inserted = true;
      } else {
        await page.keyboard.press('Enter');
        inserted = true;
      }
      await new Promise((r) => setTimeout(r, 700));
    } catch (err) {
      console.warn('[SheetsSync] Omnibox insert column fallback:', err.message);
    }

    // Strategy B: Fallback to Top Menu Bar "Insert" -> "Columns" -> "Insert 1 column right"
    if (!inserted) {
      try {
        await this.jumpToCell(page, `${phoneColLetter}1`);
        const insertMenu = await page.$('#docs-insert-menu, [role="menuitem"]:has-text("Insert")');
        if (insertMenu) {
          await insertMenu.click();
          await new Promise((r) => setTimeout(r, 400));

          const columnsItem = await page.$('.goog-menuitem:has-text("Columns"), [role="menuitem"]:has-text("Columns")');
          if (columnsItem) {
            await columnsItem.hover();
            await new Promise((r) => setTimeout(r, 400));
          }

          const rightItem = await page.$(
            '.goog-menuitem:has-text("Insert 1 column right"), [role="menuitem"]:has-text("Insert 1 column right"), .goog-menuitem:has-text("column right")'
          );
          if (rightItem) {
            await rightItem.click();
            inserted = true;
            await new Promise((r) => setTimeout(r, 700));
          }
        }
      } catch (err) {
        console.warn('[SheetsSync] Menu bar insert column fallback:', err.message);
      }
    }

    // Write "Validity" header into Row 1 of the newly inserted right-side column
    await this.writeCell(page, `${validityColLetter}1`, 'Validity');
    await new Promise((r) => setTimeout(r, 500));

    return { actionTaken: 'INSERTED_NEW_COLUMN', column: validityColLetter };
  }
}

module.exports = new GoogleSheetsSync();
