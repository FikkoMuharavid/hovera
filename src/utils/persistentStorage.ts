import { invoke } from '@tauri-apps/api/core';

/**
 * Mirrors every `di_*` localStorage key (notes, todos, shortcuts, settings…) to
 * `user-storage.json` in the app data folder, so user data survives a WebView2
 * profile reset. On startup, keys missing from localStorage are restored from disk.
 *
 * Existing components keep using `localStorage` unchanged.
 */
const PREFIX = 'di_';
const SAVE_DELAY_MS = 800;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function snapshot(): Record<string, string> {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      }
    }
  } catch {
    // storage unavailable
  }
  return data;
}

function flush(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  invoke('save_user_storage', { data: snapshot() }).catch(() => {});
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
}

export async function initPersistentStorage(): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

  // 1. Restore keys that are missing locally (e.g. after a WebView2 data reset).
  try {
    const saved = await invoke<Record<string, unknown>>('get_user_storage');
    for (const [key, value] of Object.entries(saved ?? {})) {
      if (key.startsWith(PREFIX) && typeof value === 'string' && localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
      }
    }
  } catch {
    // first run or file missing
  }

  // 2. Mirror future writes to disk (debounced).
  const proto = Storage.prototype;
  const originalSet = proto.setItem;
  const originalRemove = proto.removeItem;
  const originalClear = proto.clear;

  proto.setItem = function (key: string, value: string) {
    originalSet.call(this, key, value);
    if (this === localStorage && key.startsWith(PREFIX)) scheduleSave();
  };
  proto.removeItem = function (key: string) {
    originalRemove.call(this, key);
    if (this === localStorage && key.startsWith(PREFIX)) scheduleSave();
  };
  proto.clear = function () {
    originalClear.call(this);
    if (this === localStorage) scheduleSave();
  };

  window.addEventListener('beforeunload', () => {
    if (saveTimer) flush();
  });

  // 3. Make sure the disk copy exists even if nothing changes this session.
  scheduleSave();
}
