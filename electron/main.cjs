const { app, BrowserWindow, screen, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// Optimize Chromium flags for ultra-low RAM and 0% CPU idle
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'Translate,Autofill,AudioServiceOutOfProcess,CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow = null;
let tray = null;
let currentYOffset = 6; // default distance from top edge

const WINDOW_WIDTH = 560;
const WINDOW_HEIGHT = 440;

// Isolated application data path
app.name = 'DynamicIslandWindows';
try {
  const customUserData = path.join(app.getPath('appData'), 'DynamicIslandWindows');
  app.setPath('userData', customUserData);
} catch {
  // fallback
}

let customWindowX = null;
let customWindowY = null;

function getWindowStateFilePath() {
  try {
    return path.join(app.getPath('userData'), 'window-position.json');
  } catch {
    return null;
  }
}

function loadSavedWindowPosition() {
  try {
    const fs = require('fs');
    const p = getWindowStateFilePath();
    if (p && fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        customWindowX = Math.round(data.x);
        customWindowY = Math.round(data.y);
      }
    }
  } catch (err) {
    // fallback
  }
}

function saveWindowPosition(x, y) {
  try {
    const fs = require('fs');
    const p = getWindowStateFilePath();
    if (p) {
      fs.writeFileSync(p, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
    }
  } catch (err) {
    // fallback
  }
}

function clearSavedWindowPosition() {
  try {
    const fs = require('fs');
    const p = getWindowStateFilePath();
    if (p && fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch (err) {
    // fallback
  }
}

function updateWindowPosition() {
  if (!mainWindow) return;

  if (customWindowX !== null && customWindowY !== null) {
    mainWindow.setBounds({
      x: customWindowX,
      y: customWindowY,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
    });
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  const x = Math.round(workArea.x + (workArea.width - WINDOW_WIDTH) / 2);
  const y = workArea.y + currentYOffset;

  mainWindow.setBounds({
    x,
    y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: process.env.NODE_ENV === 'development',
    },
  });

  // Keep window always above regular apps
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });

  // Auto-grant media/audio permissions for speech recording
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true;
    return true;
  });
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') return callback(true);
    return callback(true);
  });

  loadSavedWindowPosition();
  updateWindowPosition();

  // Initially ignore mouse events on the transparent area
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  const fs = require('fs');
  const distHtml = path.join(__dirname, '../dist/index.html');
  const devUrl = 'http://localhost:5173';

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(devUrl);
  } else if (fs.existsSync(distHtml)) {
    mainWindow.loadFile(distHtml);
  } else {
    mainWindow.loadURL(devUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // 16x16 minimalist icon base64 for tray
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAERJREFUOE9jZKAQMFKon2H4//9/BkZGRkYmJia4AiYmJhhFDIxgmhhAEY5GBoDkYHQvYgQGg+L/QG3EphmH9wZ+AAB7yQY1/J9W3wAAAABJRU5ErkJggg==';
  const icon = nativeImage.createFromDataURL(iconBase64);
  
  tray = new Tray(icon);
  tray.setToolTip('Dynamic Island Windows');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Tampilkan / Sembunyikan Island',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Reset Posisi ke Atas Tengah',
      click: () => {
        customWindowX = null;
        customWindowY = null;
        currentYOffset = 6;
        clearSavedWindowPosition();
        updateWindowPosition();
        if (mainWindow) {
          mainWindow.webContents.send('window-position-reset');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Buka DevTools (Debug)',
      click: () => {
        if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
      },
    },
    { type: 'separator' },
    {
      label: 'Keluar (Quit)',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
}

// IPC Handlers
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('adjust-y-offset', (event, offset) => {
  currentYOffset = Math.max(0, Math.min(100, offset));
  if (customWindowX === null) {
    updateWindowPosition();
  }
});

ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  if (!mainWindow) return;
  const [currentX, currentY] = mainWindow.getPosition();
  const newX = Math.round(currentX + deltaX);
  const newY = Math.round(currentY + deltaY);
  mainWindow.setPosition(newX, newY);
  customWindowX = newX;
  customWindowY = newY;
  saveWindowPosition(newX, newY);
});

ipcMain.on('set-window-position', (event, { x, y }) => {
  if (!mainWindow) return;
  customWindowX = Math.round(x);
  customWindowY = Math.round(y);
  mainWindow.setPosition(customWindowX, customWindowY);
  saveWindowPosition(customWindowX, customWindowY);
});

ipcMain.handle('get-window-position', () => {
  if (!mainWindow) return null;
  const [x, y] = mainWindow.getPosition();
  return { x, y, isCustom: customWindowX !== null && customWindowY !== null };
});

ipcMain.handle('reset-window-position', () => {
  if (!mainWindow) return null;
  customWindowX = null;
  customWindowY = null;
  currentYOffset = 6;
  clearSavedWindowPosition();
  updateWindowPosition();
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

ipcMain.on('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.handle('open-external', async (event, targetUrl) => {
  try {
    if (!targetUrl) return false;
    await shell.openExternal(targetUrl);
    return true;
  } catch (err) {
    console.error('Failed to open external url:', err);
    return false;
  }
});

ipcMain.handle('launch-app', async (event, appTarget) => {
  try {
    if (!appTarget) return false;

    // Handle common system commands & URI schemes
    const knownSchemes = ['calc', 'notepad', 'explorer', 'taskmgr', 'ms-settings:'];
    if (knownSchemes.includes(appTarget) || appTarget.startsWith('http://') || appTarget.startsWith('https://') || appTarget.includes(':')) {
      if (appTarget === 'calc') exec('start calc:');
      else if (appTarget === 'notepad') exec('start notepad');
      else if (appTarget === 'explorer') exec('start explorer');
      else if (appTarget === 'taskmgr') exec('start taskmgr');
      else shell.openExternal(appTarget);
      return true;
    }

    // Try opening as file/app path
    const result = await shell.openPath(appTarget);
    if (result) {
      // If error message returned, try via cmd exec
      exec(`start "" "${appTarget}"`);
    }
    return true;
  } catch (err) {
    console.error('Failed to launch target:', err);
    return false;
  }
});

ipcMain.handle('open-project-in-antigravity', async (event, folderPath) => {
  try {
    if (!folderPath) return false;
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    const antigravityExe = path.join(
      localAppData,
      'Programs',
      'Antigravity IDE',
      'Antigravity IDE.exe'
    );
    exec(`"${antigravityExe}" "${folderPath}"`);
    return true;
  } catch (err) {
    console.error('Failed to open project in Antigravity:', err);
    return false;
  }
});

ipcMain.handle('scan-projects', async () => {
  try {
    const fs = require('fs');
    const baseDirs = [
      { category: 'Program Kantor', basePath: 'C:\\Developer\\Program Kantor' },
      { category: 'Program Freelance', basePath: 'C:\\Developer\\Program Freelance' },
    ];

    const results = [];
    for (const b of baseDirs) {
      if (fs.existsSync(b.basePath)) {
        const items = fs.readdirSync(b.basePath, { withFileTypes: true });
        for (const it of items) {
          if (it.isDirectory() && !it.name.startsWith('.')) {
            results.push({
              name: it.name,
              path: path.join(b.basePath, it.name),
              category: b.category,
            });
          }
        }
      }
    }
    return results;
  } catch (err) {
    console.error('Failed to scan projects:', err);
    return [];
  }
});

ipcMain.handle('select-folder', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder Project untuk Antigravity',
      properties: ['openDirectory'],
      defaultPath: 'C:\\Developer',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (err) {
    console.error('Failed to select folder:', err);
    return null;
  }
});

ipcMain.handle('save-note-file', async (event, { title, content, format }) => {
  try {
    const { dialog } = require('electron');
    const fs = require('fs');
    const ext = format === 'md' ? 'md' : 'txt';
    const sanitizedTitle = (title || 'Catatan_Meeting').replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Catatan Meeting',
      defaultPath: `${sanitizedTitle}.${ext}`,
      filters: [
        format === 'md'
          ? { name: 'Markdown File', extensions: ['md'] }
          : { name: 'Text File', extensions: ['txt'] },
        { name: 'Semua File', extensions: ['*'] },
      ],
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, filePath: result.filePath };
    }
    return { success: false, canceled: true };
  } catch (err) {
    console.error('Failed to save note file:', err);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createMainWindow();
  createTray();

  screen.on('display-metrics-changed', () => {
    updateWindowPosition();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
