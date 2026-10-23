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
  isElectron: true,
});
