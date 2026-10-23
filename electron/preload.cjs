const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore);
  },
  openExternal: (url) => {
    return ipcRenderer.invoke('open-external', url);
  },
  launchApp: (target) => {
    return ipcRenderer.invoke('launch-app', target);
  },
  adjustYOffset: (offset) => {
    ipcRenderer.send('adjust-y-offset', offset);
  },
  quitApp: () => {
    ipcRenderer.send('quit-app');
  },
  openProjectInAntigravity: (folderPath) => {
    return ipcRenderer.invoke('open-project-in-antigravity', folderPath);
  },
  scanProjects: () => {
    return ipcRenderer.invoke('scan-projects');
  },
  selectFolder: () => {
    return ipcRenderer.invoke('select-folder');
  },
  moveWindow: (deltaX, deltaY) => {
    ipcRenderer.send('move-window', { deltaX, deltaY });
  },
  setWindowPosition: (x, y) => {
    ipcRenderer.send('set-window-position', { x, y });
  },
  getWindowPosition: () => {
    return ipcRenderer.invoke('get-window-position');
  },
  resetWindowPosition: () => {
    return ipcRenderer.invoke('reset-window-position');
  },
  onPositionReset: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('window-position-reset', handler);
    return () => ipcRenderer.removeListener('window-position-reset', handler);
  },
  isElectron: true,
});
