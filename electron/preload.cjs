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
  getAppSettings: () => {
    return ipcRenderer.invoke('get-app-settings');
  },
  saveAppSettings: (settings) => {
    return ipcRenderer.invoke('save-app-settings', settings);
  },
  onPositionReset: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('window-position-reset', handler);
    return () => ipcRenderer.removeListener('window-position-reset', handler);
  },
  onCursorLeft: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('native-cursor-left', handler);
    return () => ipcRenderer.removeListener('native-cursor-left', handler);
  },
  saveNoteFile: (params) => {
    return ipcRenderer.invoke('save-note-file', params);
  },
  transcribeAudio: (params) => {
    return ipcRenderer.invoke('transcribe-audio', params);
  },
  hideWindow: () => {
    ipcRenderer.send('hide-window');
  },
  setWindowExpanded: (expanded, height, width) => {
    ipcRenderer.send('set-window-expanded', { expanded, height, width });
  },
  getAutoStart: () => {
    return ipcRenderer.invoke('get-auto-start');
  },
  setAutoStart: (enable) => {
    return ipcRenderer.invoke('set-auto-start', enable);
  },
  openStartupSettings: () => {
    return ipcRenderer.invoke('open-external', 'ms-settings:startupapps');
  },
  checkOfficeInstalled: () => {
    return Promise.resolve({ word: false, excel: false, powerpoint: false, available: false });
  },
  pickFilesDialog: (filterType) => {
    return ipcRenderer.invoke('pick-files-dialog', filterType);
  },
  readFileAsBase64: (path) => {
    return ipcRenderer.invoke('read-file-as-base64', path);
  },
  saveFileInSameFolder: (params) => {
    return ipcRenderer.invoke('save-file-in-same-folder', params);
  },
  convertOfficeToPdf: (inputPath) => {
    return ipcRenderer.invoke('convert-office-to-pdf', inputPath);
  },
  compressPdfFile: (inputPath) => {
    return ipcRenderer.invoke('compress-pdf-file', inputPath);
  },
  showInFolder: (path) => {
    return ipcRenderer.invoke('show-in-folder', path);
  },
  openFile: (path) => {
    return ipcRenderer.invoke('open-file', path);
  },
  trimMemory: () => {
    ipcRenderer.send('trim-memory');
  },
  getMediaState: () => {
    return Promise.resolve({
      isPlaying: false,
      title: '',
      artist: '',
      sourceApp: '',
      audioPeak: 0,
    });
  },
  mediaTogglePlay: () => Promise.resolve(false),
  mediaNext: () => Promise.resolve(false),
  mediaPrev: () => Promise.resolve(false),
  onMediaStateChanged: () => () => {},
  downloadMediaUrl: (params) => ipcRenderer.invoke('download-media-url', params),
  downloadViaYtdlp: (params) => ipcRenderer.invoke('download-via-ytdlp', params),
  downloadBatchMedia: (params) => ipcRenderer.invoke('download-batch-media', params),
  fetchUrlText: (url) => ipcRenderer.invoke('fetch-url-text', url),
  checkForUpdates: () => {
    return Promise.resolve({ hasUpdate: false });
  },
  installAppUpdate: () => {
    return Promise.resolve({ success: false, error: 'Updater didukung di versi resmi' });
  },
  onUpdateProgress: () => () => {},
  isElectron: true,
});
