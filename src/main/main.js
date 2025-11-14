const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

ipcMain.handle('database:select', async () => {
  if (!mainWindow) {
    throw new Error('Application window is not ready.');
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Database File',
    buttonLabel: 'Select',
    filters: [
      { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('database:set-path', async (event, filePath) => {
  await dataService.setDatabasePath(filePath);
  return dataService.getDatabasePath();
});

ipcMain.handle('database:reset-path', async () => {
  await dataService.resetDatabasePath();
  return dataService.getDatabasePath();
});

ipcMain.handle('sync:run', async (event, options = {}) => {
  if (!mainWindow) {
    throw new Error('Application window is not ready.');
  }

  const progressEmitter = (progress) => {
    mainWindow.webContents.send('sync:progress', progress);
  };

  const incrementalUpdateEmitter = (update) => {
    mainWindow.webContents.send('sync:incremental', update);
  };

  const stateEmitter = (state) => {
    mainWindow.webContents.send('sync:state', { state });
  };

  try {
    const result = await dataService.syncData(progressEmitter, incrementalUpdateEmitter, stateEmitter, options);
    mainWindow.webContents.send('sync:completed', result);
    return result;
  } catch (error) {
    mainWindow.webContents.send('sync:error', { message: error.message });
    throw error;
  }
});

ipcMain.handle('sync:pause', () => dataService.pauseSync());

ipcMain.handle('sync:resume', () => dataService.resumeSync());

ipcMain.handle('sync:stop', () => dataService.stopSync());

ipcMain.handle('sync:state', () => dataService.getSyncState());
