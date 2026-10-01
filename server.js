const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const validator = require('./validator');
const sheetsSync = require('./sheets_sync');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store SSE clients
let sseClients = [];

function broadcast(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    try {
      res.write(message);
    } catch (e) {
      // client disconnected
    }
  });
}

// Server-Sent Events endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter((client) => client !== res);
  });
});

// Check WhatsApp Web login status
app.get('/api/check-auth', async (req, res) => {
  try {
    const status = await validator.checkLoginStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// Get QR Code Image for direct UI display
app.get('/api/qr', async (req, res) => {
  try {
    const data = await validator.getQrCodeImage();
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// Open Chrome window so the user can scan QR code
app.post('/api/open-login', async (req, res) => {
  try {
    validator.openLoginWindow().catch((err) => {
      console.error('Error opening login window:', err);
    });
    res.json({ success: true, message: 'Browser window launched. Please scan the QR code if prompted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// ULTRA: Google Sheets Cloud Sync Endpoints
// ==========================================

// 1. Inspect Google Sheet URL: detect tab from URL (#gid) + list all workbook tabs + initial columns
app.post('/api/sheets/inspect', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid Google Sheet URL.' });
  }

  try {
    const info = await sheetsSync.discoverWorkbook(url, validator.getContext.bind(validator));
    res.json({
      success: true,
      ...info
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to inspect Google Sheet.'
    });
  }
});

// 2. Analyze columns for a specific tab (or all tabs when "ALL_TABS" is selected)
app.post('/api/sheets/columns', async (req, res) => {
  const { spreadsheetId, gid, tabName, tabs } = req.body;
  if (!spreadsheetId) {
    return res.status(400).json({ error: 'Missing spreadsheetId.' });
  }

  try {
    if (gid === 'ALL_TABS' && Array.isArray(tabs)) {
      const tabSummaries = [];
      let totalRowsAllTabs = 0;

      for (const t of tabs) {
        try {
          const analysis = await sheetsSync.analyzeTabColumns(spreadsheetId, t.gid, t.name);
          const bestCol = analysis.columns.find((c) => c.colLetter === analysis.bestColumnLetter) || null;
          if (bestCol && bestCol.rowCount > 0) {
            totalRowsAllTabs += bestCol.rowCount;
          }
          tabSummaries.push({
            gid: t.gid,
            name: t.name,
            totalRows: analysis.totalRows,
            bestColumn: bestCol,
            columns: analysis.columns
          });
        } catch (e) {
          tabSummaries.push({
            gid: t.gid,
            name: t.name,
            error: e.message,
            totalRows: 0,
            bestColumn: null,
            columns: []
          });
        }
      }

      return res.json({
        success: true,
        isAllTabs: true,
        totalRowsAllTabs,
        tabSummaries
      });
    }

    const analysis = await sheetsSync.analyzeTabColumns(spreadsheetId, gid || '0', tabName || 'Sheet');
    res.json({
      success: true,
      isAllTabs: false,
      ...analysis
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to analyze columns for this sheet tab.'
    });
  }
});

// 3. Start Live Google Sheet Row-by-Row Validation & Cloud Writing
app.post('/api/sheets/start', async (req, res) => {
  const { spreadsheetId, tabsToProcess, defaultCountryCode, minDelay, maxDelay, startFromRow } = req.body;

  if (!spreadsheetId || !Array.isArray(tabsToProcess) || tabsToProcess.length === 0) {
    return res.status(400).json({ error: 'Please select a valid Google Sheet tab and phone column.' });
  }

  if (validator.isRunning) {
    return res.status(409).json({ error: 'A validation job is already in progress.' });
  }

  res.json({
    success: true,
    message: 'Google Sheet live validation initiated.'
  });

  const pacing = {
    minDelay: minDelay !== undefined ? minDelay : 5,
    maxDelay: maxDelay !== undefined ? maxDelay : 12
  };

  validator.validateGoogleSheet(
    {
      spreadsheetId,
      tabsToProcess,
      defaultCountryCode: defaultCountryCode || '',
      pacing,
      startFromRow: Math.max(1, parseInt(startFromRow, 10) || 1)
    },
    (result) => {
      broadcast('result', result);
    },
    (status) => {
      broadcast('status', status);
    }
  );
});

// 4. Open / Bring Google Sheet Browser Tab to Front
app.post('/api/sheets/open-window', async (req, res) => {
  const { spreadsheetId, gid } = req.body;
  if (!spreadsheetId) {
    return res.status(400).json({ error: 'No Google Sheet connected yet.' });
  }
  try {
    const page = await sheetsSync.ensureSheetPage(
      validator.getContext.bind(validator),
      spreadsheetId,
      gid || '0',
      false
    );
    await page.bringToFront().catch(() => {});
    res.json({ success: true, message: 'Google Sheet browser tab brought to front.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Classic Manual Phone List Validation
// ==========================================
app.post('/api/start', async (req, res) => {
  const { numbers, defaultCountryCode, minDelay, maxDelay, delaySeconds, startFromRow } = req.body;

  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Please provide an array of phone numbers.' });
  }

  if (validator.isRunning) {
    return res.status(409).json({ error: 'A validation job is already in progress.' });
  }

  res.json({ success: true, count: numbers.length, message: 'Validation initiated.' });

  const pacing = {
    minDelay: minDelay !== undefined ? minDelay : delaySeconds || 5,
    maxDelay: maxDelay !== undefined ? maxDelay : delaySeconds || 12,
    startFromRow: Math.max(1, parseInt(startFromRow, 10) || 1)
  };

  validator.validateList(
    numbers,
    defaultCountryCode || '',
    pacing,
    (result) => {
      broadcast('result', result);
    },
    (status) => {
      broadcast('status', status);
    }
  );
});

// Stop validation (Preserves all written rows in Google Sheet "Validity" column)
app.post('/api/stop', (req, res) => {
  validator.stop();
  res.json({
    success: true,
    message: 'Stopping validation job... All data already written to "Validity" remains saved in cloud.'
  });
});

// Close browser
app.post('/api/close-browser', async (req, res) => {
  await validator.closeBrowser();
  res.json({ success: true, message: 'Browser closed.' });
});

// ==========================================
// Cloudflare Tunnel Management
// ==========================================
let tunnelProcess = null;
let tunnelUrl = null;
let tunnelStatus = 'STOPPED';
let tunnelError = null;

function resolveCloudflaredBin() {
  const binName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const localBin = path.join(__dirname, binName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  if (process.resourcesPath) {
    const resourceBin = path.join(process.resourcesPath, binName);
    if (fs.existsSync(resourceBin)) {
      return resourceBin;
    }
  }
  return 'cloudflared';
}

function startTunnel() {
  return new Promise((resolve, reject) => {
    if (tunnelStatus === 'RUNNING' && tunnelUrl) {
      return resolve({ success: true, url: tunnelUrl });
    }

    if (tunnelProcess) {
      try {
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${tunnelProcess.pid} /T /F`, () => {});
        } else {
          tunnelProcess.kill('SIGKILL');
        }
      } catch (e) {}
      tunnelProcess = null;
    }

    tunnelStatus = 'STARTING';
    tunnelUrl = null;
    tunnelError = null;

    const bin = resolveCloudflaredBin();
    console.log(`[Cloudflare Tunnel] Launching using binary: ${bin}`);

    try {
      tunnelProcess = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (err) {
      tunnelStatus = 'ERROR';
      tunnelError = err.message;
      return reject(err);
    }

    let resolved = false;
    let candidateUrl = null;
    let fallbackTimer = null;
    const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
    const registeredRegex = /Registered tunnel connection/;

    const tryResolve = (url) => {
      if (resolved) return;
      resolved = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      tunnelUrl = url;
      tunnelStatus = 'RUNNING';
      tunnelError = null;
      console.log(`[Cloudflare Tunnel] Live Public URL: ${tunnelUrl}`);
      resolve({ success: true, url: tunnelUrl });
    };

    const onData = (data) => {
      const text = data.toString();
      const match = text.match(urlRegex);
      if (match) {
        candidateUrl = match[0];
        if (!fallbackTimer) {
          fallbackTimer = setTimeout(() => {
            if (candidateUrl && !resolved) {
              tryResolve(candidateUrl);
            }
          }, 12000);
        }
      }

      if (candidateUrl && registeredRegex.test(text)) {
        tryResolve(candidateUrl);
      }
    };

    tunnelProcess.stdout.on('data', onData);
    tunnelProcess.stderr.on('data', onData);

    tunnelProcess.on('error', (err) => {
      console.error('[Cloudflare Tunnel] Process error:', err);
      tunnelStatus = 'ERROR';
      tunnelError = err.message;
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    tunnelProcess.on('exit', (code, signal) => {
      console.log(`[Cloudflare Tunnel] Process exited (code: ${code}, signal: ${signal})`);
      tunnelProcess = null;
      if (tunnelStatus !== 'ERROR') {
        tunnelStatus = 'STOPPED';
      }
      tunnelUrl = null;
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared exited before establishing tunnel (code: ${code})`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (tunnelStatus !== 'RUNNING') {
          tunnelStatus = 'ERROR';
          tunnelError = 'Timed out waiting for Cloudflare Tunnel URL.';
          stopTunnel();
          reject(new Error('Cloudflare Tunnel connection timed out after 25 seconds.'));
        }
      }
    }, 25000);
  });
}

function stopTunnel() {
  if (tunnelProcess) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${tunnelProcess.pid} /T /F`, () => {});
      } else {
        tunnelProcess.kill('SIGKILL');
      }
    } catch (e) {}
    tunnelProcess = null;
  }
  tunnelStatus = 'STOPPED';
  tunnelUrl = null;
  tunnelError = null;
  console.log('[Cloudflare Tunnel] Stopped.');
  return { success: true, status: 'STOPPED' };
}

process.on('exit', () => stopTunnel());
process.on('SIGINT', () => {
  stopTunnel();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopTunnel();
  process.exit(0);
});

app.get('/api/tunnel/status', (req, res) => {
  res.json({
    status: tunnelStatus,
    running: tunnelStatus === 'RUNNING',
    url: tunnelUrl,
    error: tunnelError
  });
});

app.post('/api/tunnel/start', async (req, res) => {
  try {
    const result = await startTunnel();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tunnel/stop', (req, res) => {
  const result = stopTunnel();
  res.json(result);
});

app.post('/api/logout', async (req, res) => {
  try {
    const result = await validator.logout();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

let serverInstance = null;

function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      return resolve(serverInstance);
    }
    serverInstance = app
      .listen(port, () => {
        console.log(`===================================================`);
        console.log(` OutGrow - WhatsApp Number Validator ULTRA`);
        console.log(` Live Google Sheets Sync + Manual Batch Validator`);
        console.log(` Dashboard URL: http://localhost:${port}`);
        console.log(`===================================================`);

        if (process.env.AUTO_START_TUNNEL === 'true' || process.argv.includes('--tunnel')) {
          console.log('[Cloudflare Tunnel] Auto-starting public tunnel...');
          startTunnel()
            .then((res) => {
              console.log(`===================================================`);
              console.log(` 🌐 Live Public Link: ${res.url}`);
              console.log(` Share this link with anyone to access your dashboard!`);
              console.log(`===================================================`);
            })
            .catch((err) => {
              console.error('[Cloudflare Tunnel] Auto-start failed:', err.message);
            });
        }

        resolve(serverInstance);
      })
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[Server] Port ${port} is already active. Connecting to running instance.`);
          resolve(null);
        } else {
          reject(err);
        }
      });
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = { app, startServer, stopTunnel, validator, PORT };
