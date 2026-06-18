'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zapret', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getStrategies: () => ipcRenderer.invoke('get-strategies'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  connect: () => ipcRenderer.invoke('connect'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  getLogText: () => ipcRenderer.invoke('get-log-text'),
  copyLog: () => ipcRenderer.invoke('copy-log'),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  downloadBinaries: () => ipcRenderer.invoke('download-binaries'),
  onStatus: (cb) => ipcRenderer.on('status', (_, data) => cb(data)),
  onLog: (cb) => ipcRenderer.on('log-entry', (_, data) => cb(data))
});
