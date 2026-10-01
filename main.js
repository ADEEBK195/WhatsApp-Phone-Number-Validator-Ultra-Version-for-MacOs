const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { startServer, stopTunnel, validator, PORT } = require('./server');

let mainWindow = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createWindow() {
    const isMac = process.platform === 'darwin';
    const iconPath = isMac
      ? path.join(__dirname, 'public', 'app-icon.png')
      : path.join(__dirname, 'public', 'icon.ico');

    mainWindow = new BrowserWindow({
      width: 1420,
      height: 900,
      minWidth: 1100,
      minHeight: 720,
      title: 'OutGrow | WhatsApp Number Validator ULTRA',
      icon: iconPath,
      backgroundColor: '#151922',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    if (isMac) {
      if (app.dock) {
        app.dock.setIcon(path.join(__dirname, 'public', 'app-icon.png'));
      }
      const template = [
        {
          label: 'OutGrow Ultra',
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
          ]
        },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        },
        {
          label: 'Window',
          submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
          ]
        }
      ];
      Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    } else {
      Menu.setApplicationMenu(null);
    }

    mainWindow.loadURL(`http://localhost:${PORT}`);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  app.whenReady().then(async () => {
    try {
      await startServer(PORT);
    } catch (err) {
      console.error('Failed to start server:', err);
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', async () => {
    try {
      if (validator && typeof validator.closeBrowser === 'function') {
        await validator.closeBrowser();
      }
    } catch (e) {}

    try {
      if (typeof stopTunnel === 'function') {
        stopTunnel();
      }
    } catch (e) {}

    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
