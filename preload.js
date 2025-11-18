const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  mergeFiles: (files) => ipcRenderer.invoke('merge-files', files)
});
