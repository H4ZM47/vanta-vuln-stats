const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { DataService } = require('./dataService');

let mainWindow;
const dataService = new DataService();

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.env.ELECTRON_START_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('settings:get', () => dataService.getCredentials());

ipcMain.handle('settings:update', (event, payload) => dataService.updateCredentials(payload));

ipcMain.handle('stats:get', (event, filters) => dataService.getStatistics(filters));

ipcMain.handle('vulnerabilities:list', (event, options) => dataService.getVulnerabilities(options));

ipcMain.handle('vulnerabilities:details', (event, id) => dataService.getVulnerabilityDetails(id));

ipcMain.handle('remediations:list', (event, vulnerabilityId) => dataService.getRemediations(vulnerabilityId));

ipcMain.handle('sync:history', () => dataService.getSyncHistory());
ipcMain.handle('database:path', () => dataService.getDatabasePath());

ipcMain.handle('sync:run', async () => {
  if (!mainWindow) {
    throw new Error('Application window is not ready.');
  }

  const progressEmitter = (progress) => {
    mainWindow.webContents.send('sync:progress', progress);
  };

  const incrementalUpdateEmitter = (update) => {
    mainWindow.webContents.send('sync:incremental', update);
  };

  try {
    const result = await dataService.syncData(progressEmitter, incrementalUpdateEmitter);
    mainWindow.webContents.send('sync:completed', result);
    return result;
  } catch (error) {
    mainWindow.webContents.send('sync:error', { message: error.message });
    throw error;
  }
});
