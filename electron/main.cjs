const { app, BrowserWindow, screen, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');

// Optimize Chromium flags for ultra-low RAM and 0% CPU idle
app.commandLine.appendSwitch('disable-features', 'Translate,Autofill,AudioServiceOutOfProcess,CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('renderer-process-limit', '1');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128 --expose-gc');

let mainWindow = null;
let tray = null;
let currentYOffset = 6; // default distance from top edge

const WINDOW_WIDTH = 580;
const WINDOW_HEIGHT = 680;

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
  } catch {
    // fallback
  }
}

function saveWindowPosition(x, y) {
  try {
    const fs = require('fs');
    const p = getWindowStateFilePath();
    if (p) {
      const tmp = p + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ x: Math.round(x), y: Math.round(y) }), 'utf8');
      fs.renameSync(tmp, p);
    }
  } catch {
    // fallback
  }
}

function getAppSettingsFilePath() {
  try {
    return path.join(app.getPath('userData'), 'app-settings.json');
  } catch {
    return null;
  }
}

function clearSavedWindowPosition() {
  try {
    const fs = require('fs');
    const p = getWindowStateFilePath();
    if (p && fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch {
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
  const { bounds } = primaryDisplay;

  // Selalu tepat di tengah atas layar monitor fisik (center top)
  const x = Math.round(bounds.x + (bounds.width - WINDOW_WIDTH) / 2);
  const y = bounds.y + currentYOffset;

  mainWindow.setBounds({
    x,
    y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });
}

function getAppIconPath() {
  const fs = require('fs');
  const candidates = [
    path.join(__dirname, 'assets/icon.png'),
    path.join(__dirname, 'assets/icon.ico'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../build/icon.ico'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function getTrayIcon() {
  const fs = require('fs');
  const candidates = [
    path.join(__dirname, 'assets/tray-icon.png'),
    path.join(__dirname, '../build/tray-icon.png'),
    path.join(__dirname, 'assets/icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, 'assets/icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const img = nativeImage.createFromPath(c);
        if (!img.isEmpty()) {
          return img.resize({ width: 16, height: 16 });
        }
      } catch {
        // continue
      }
    }
  }
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAERJREFUOE9jZKAQMFKon2H4//9/BkZGRkYmJia4AiYmJhhFDIxgmhhAEY5GBoDkYHQvYgQGg+L/QG3EphmH9wZ+AAB7yQY1/J9W3wAAAABJRU5ErkJggg==';
  return nativeImage.createFromDataURL(iconBase64);
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
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: process.env.NODE_ENV === 'development',
      backgroundThrottling: true,
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

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

function createTray() {
  try {
    const icon = getTrayIcon();
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
  } catch (err) {
    console.warn('Failed to create system tray:', err);
  }
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

ipcMain.handle('get-app-settings', () => {
  try {
    const fs = require('fs');
    const p = getAppSettingsFilePath();
    if (p && fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {}
  return {};
});

ipcMain.handle('save-app-settings', (event, settings) => {
  try {
    const fs = require('fs');
    const p = getAppSettingsFilePath();
    if (p) {
      const tmp = p + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
      fs.renameSync(tmp, p);
      return true;
    }
  } catch {}
  return false;
});

ipcMain.on('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.on('hide-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('get-auto-start', () => {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
});

ipcMain.handle('set-auto-start', (event, enable) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enable,
      path: process.execPath,
    });
    return app.getLoginItemSettings().openAtLogin;
  } catch (err) {
    console.error('Failed to set login item settings:', err);
    return false;
  }
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

    // Direct Antigravity / Code support
    if (appTarget === 'antigravity' || appTarget === 'antigravity-ide' || appTarget === 'code') {
      const fs = require('fs');
      const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
      const antigravityExe = path.join(localAppData, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
      const antigravityCmd = path.join(localAppData, 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd');
      const targetExe = fs.existsSync(antigravityExe) ? antigravityExe : antigravityCmd;
      exec(`"${targetExe}"`);
      return true;
    }

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
    const fs = require('fs');
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    const antigravityExe = path.join(
      localAppData,
      'Programs',
      'Antigravity IDE',
      'Antigravity IDE.exe'
    );
    const antigravityCmd = path.join(
      localAppData,
      'Programs',
      'Antigravity IDE',
      'bin',
      'antigravity-ide.cmd'
    );
    const targetExe = fs.existsSync(antigravityExe) ? antigravityExe : antigravityCmd;

    if (folderPath && fs.existsSync(folderPath)) {
      exec(`"${targetExe}" "${folderPath}"`);
    } else {
      exec(`"${targetExe}"`);
    }
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

// Whisper Speech-to-Text Transcriber (Local, 100% Free, No API Keys) - Lazy Loaded & Auto Unloaded
let whisperPipelinePromise = null;
let whisperIdleTimer = null;

function scheduleWhisperUnload() {
  if (whisperIdleTimer) clearTimeout(whisperIdleTimer);
  whisperIdleTimer = setTimeout(() => {
    if (whisperPipelinePromise) {
      whisperPipelinePromise = null;
      if (global.gc) {
        try {
          global.gc();
        } catch {
          // ignore
        }
      }
      console.log('Whisper AI pipeline unloaded from RAM after idle timeout');
    }
  }, 180000); // 3 minutes idle
}

async function getWhisperTranscriber() {
  if (whisperIdleTimer) {
    clearTimeout(whisperIdleTimer);
    whisperIdleTimer = null;
  }
  if (!whisperPipelinePromise) {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = true;
    whisperPipelinePromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
  }
  return whisperPipelinePromise;
}

function cleanRepetitiveText(text) {
  if (!text || typeof text !== 'string') return '';
  let str = text.trim();

  // Strip brackets like [MENU], [music], etc.
  str = str.replace(/\[.*?\]|\(.*?\)/g, '');

  // Strip rogue Asian/CJK characters hallucinated on low-volume frames
  str = str.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '');

  // 1. Remove repeated phrases separated by commas, periods, or semicolons
  const chunks = str.split(/[,.\n;]+/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length >= 2) {
    const counts = {};
    for (const c of chunks) {
      const lower = c.toLowerCase();
      counts[lower] = (counts[lower] || 0) + 1;
    }
    const maxCount = Math.max(...Object.values(counts));
    if (maxCount >= 2 && maxCount / chunks.length >= 0.35) {
      const uniqueChunks = [];
      for (const c of chunks) {
        if (!uniqueChunks.some((u) => u.toLowerCase() === c.toLowerCase())) {
          uniqueChunks.push(c);
        }
      }
      str = uniqueChunks.join(', ') + '.';
    }
  }

  // 2. Remove repeating n-word patterns (e.g., "jauh baru jauh baru")
  for (let n = 4; n >= 1; n--) {
    const w = str.split(/\s+/);
    if (w.length >= n * 2) {
      const result = [];
      for (let i = 0; i < w.length; i++) {
        if (i + n <= w.length && result.length >= n) {
          const sliceCurr = w.slice(i, i + n).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
          const slicePrev = result.slice(result.length - n).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
          if (sliceCurr && sliceCurr === slicePrev) {
            i += n - 1; // skip this repeated phrase
            continue;
          }
        }
        result.push(w[i]);
      }
      str = result.join(' ');
    }
  }

  // Strip common YouTube closing subtitle hallucinations if appearing in isolation
  if (/^(terima kasih( kerana| banyak)?|thank you( for watching)?)[.!?]?$/i.test(str)) {
    return '';
  }

  return str.trim();
}

ipcMain.handle('transcribe-audio', async (event, { audioSamples, language }) => {
  try {
    const transcriber = await getWhisperTranscriber();
    const float32 = audioSamples instanceof Float32Array ? audioSamples : Float32Array.from(audioSamples);
    const lang = language === 'en-US' || language === 'english' ? 'english' : 'indonesian';

    const options = {
      language: lang,
      task: 'transcribe',
      temperature: 0,
      condition_on_previous_text: false,
      do_sample: false,
      num_beams: 1,
    };

    // Only apply chunking if audio is longer than 25 seconds
    if (float32.length > 16000 * 25) {
      options.chunk_length_s = 30;
      options.stride_length_s = 5;
    }

    const output = await transcriber(float32, options);
    const cleaned = cleanRepetitiveText(output?.text || '');
    return { success: true, text: cleaned };
  } catch (err) {
    console.error('Whisper transcription error:', err);
    return { success: false, error: err.message || String(err) };
  } finally {
    scheduleWhisperUnload();
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
