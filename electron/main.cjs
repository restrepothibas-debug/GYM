const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function isInternalNavigation(url, currentUrl) {
  if (!url) return true;
  if (devServerUrl && url.startsWith(devServerUrl)) return true;
  if (!devServerUrl && url.startsWith('file://')) return true;
  return url === currentUrl;
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'GYM-FLOW',
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalNavigation(url, mainWindow.webContents.getURL())) return;
    event.preventDefault();
    if (url.startsWith('https://')) shell.openExternal(url);
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
