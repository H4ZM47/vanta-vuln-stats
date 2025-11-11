const { contextBridge, ipcRenderer } = require('electron');

const createSubscription = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('vanta', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload) => ipcRenderer.invoke('settings:update', payload),
  getStatistics: (filters) => ipcRenderer.invoke('stats:get', filters ?? {}),
  listVulnerabilities: (options) => ipcRenderer.invoke('vulnerabilities:list', options ?? {}),
  getVulnerabilityDetails: (id) => ipcRenderer.invoke('vulnerabilities:details', id),
  getRemediations: (vulnerabilityId) => ipcRenderer.invoke('remediations:list', vulnerabilityId),
  getSyncHistory: () => ipcRenderer.invoke('sync:history'),
  getDatabasePath: () => ipcRenderer.invoke('database:path'),
  runSync: () => ipcRenderer.invoke('sync:run'),
  pauseSync: () => ipcRenderer.invoke('sync:pause'),
  resumeSync: () => ipcRenderer.invoke('sync:resume'),
  stopSync: () => ipcRenderer.invoke('sync:stop'),
  getSyncState: () => ipcRenderer.invoke('sync:state'),
  onSyncProgress: createSubscription('sync:progress'),
  onSyncCompleted: createSubscription('sync:completed'),
  onSyncError: createSubscription('sync:error'),
  onSyncIncremental: createSubscription('sync:incremental'),
  onSyncState: createSubscription('sync:state'),
});
