import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ElectronAPI, ProjectInfo } from '../types/electron';

export function initTauriBridge(): void {
  if (typeof window === 'undefined') return;

  // If already in Electron and not Tauri, keep native electronAPI
  if ((window as any).electronAPI?.isElectron) return;

  const bridge: ElectronAPI = {
    setIgnoreMouseEvents: (ignore: boolean) => {
      invoke('set_ignore_mouse_events', { ignore }).catch(() => {});
    },
    openExternal: async (url: string) => {
      return await invoke<boolean>('open_external', { url });
    },
    launchApp: async (target: string) => {
      return await invoke<boolean>('launch_app', { target });
    },
    adjustYOffset: (offset: number) => {
      invoke('adjust_y_offset', { offset }).catch(() => {});
    },
    quitApp: () => {
      invoke('quit_app').catch(() => {});
    },
    openProjectInAntigravity: async (folderPath?: string) => {
      return await invoke<boolean>('open_project_in_antigravity', { folderPath });
    },
    scanProjects: async () => {
      return await invoke<ProjectInfo[]>('scan_projects');
    },
    selectFolder: async () => {
      return await invoke<string | null>('select_folder');
    },
    moveWindow: (deltaX: number, deltaY: number) => {
      invoke('move_window', { deltaX, deltaY }).catch(() => {});
    },
    setWindowPosition: (x: number, y: number) => {
      invoke('set_window_position', { x, y }).catch(() => {});
    },
    getWindowPosition: async () => {
      return await invoke<{ x: number; y: number; isCustom?: boolean } | null>('get_window_position');
    },
    resetWindowPosition: async () => {
      return await invoke<{ x: number; y: number } | null>('reset_window_position');
    },
    getAppSettings: async () => {
      return await invoke<Record<string, any>>('get_app_settings');
    },
    saveAppSettings: async (settings: Record<string, any>) => {
      return await invoke<boolean>('save_app_settings', { settings });
    },
    onPositionReset: (callback: () => void) => {
      let isCancelled = false;
      let unlisten: (() => void) | null = null;
      listen('window-position-reset', () => {
        callback();
      }).then((un) => {
        if (isCancelled) {
          un();
        } else {
          unlisten = un;
        }
      }).catch(() => {});
      return () => {
        isCancelled = true;
        if (unlisten) unlisten();
      };
    },
    onCursorLeft: (callback: () => void) => {
      let isCancelled = false;
      let unlisten: (() => void) | null = null;
      listen('native-cursor-left', () => {
        callback();
      }).then((un) => {
        if (isCancelled) {
          un();
        } else {
          unlisten = un;
        }
      }).catch(() => {});
      return () => {
        isCancelled = true;
        if (unlisten) unlisten();
      };
    },
    saveNoteFile: async (params) => {
      return await invoke<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>(
        'save_note_file',
        params
      );
    },
    transcribeAudio: async (_params) => {
      return { success: false, error: 'Voice transcription completed' };
    },
    hideWindow: () => {
      invoke('hide_window').catch(() => {});
    },
    setWindowExpanded: (expanded: boolean, height?: number, width?: number) => {
      invoke('set_window_expanded', { expanded, height, width }).catch(() => {});
    },
    getAutoStart: async () => {
      return await invoke<boolean>('get_auto_start');
    },
    setAutoStart: async (enable: boolean) => {
      return await invoke<boolean>('set_auto_start', { enable });
    },
    openStartupSettings: async () => {
      await invoke('open_startup_settings');
    },
    checkOfficeInstalled: async () => {
      return await invoke<{ word: boolean; excel: boolean; powerpoint: boolean; available: boolean }>('check_office_installed');
    },
    pickFilesDialog: async (filterType: 'images' | 'docs' | 'all') => {
      return await invoke<{ path: string; name: string; extension: string; size: number }[]>('pick_files_dialog', { filterType });
    },
    readFileAsBase64: async (path: string) => {
      return await invoke<string>('read_file_as_base64', { path });
    },
    saveFileInSameFolder: async (params) => {
      return await invoke<{ success: boolean; filePath: string; fileName: string; folderPath: string }>(
        'save_file_in_same_folder',
        {
          sourcePath: params.sourcePath,
          suffix: params.suffix,
          targetExt: params.targetExt,
          base64Data: params.base64Data,
        }
      );
    },
    convertOfficeToPdf: async (inputPath: string) => {
      return await invoke<{ success: boolean; filePath: string; fileName: string; folderPath: string }>(
        'convert_office_to_pdf',
        { inputPath }
      );
    },
    compressPdfFile: async (inputPath: string) => {
      return await invoke<{
        success: boolean;
        filePath: string;
        fileName: string;
        folderPath: string;
        originalSize: number;
        compressedSize: number;
        savingsPercent: number;
      }>('compress_pdf_file', { inputPath });
    },
    showInFolder: async (path: string) => {
      return await invoke<boolean>('show_in_folder', { path });
    },
    openFile: async (path: string) => {
      return await invoke<boolean>('open_file', { path });
    },
    trimMemory: () => {
      try {
        (window as any).gc?.();
      } catch {}
      invoke('trim_memory').catch(() => {});
    },
    getMediaState: async () => {
      return await invoke<any>('get_media_state');
    },
    mediaTogglePlay: async () => {
      return await invoke<boolean>('media_toggle_play');
    },
    mediaNext: async () => {
      return await invoke<boolean>('media_next');
    },
    mediaPrev: async () => {
      return await invoke<boolean>('media_prev');
    },
    downloadMediaUrl: async (params) => {
      return await invoke<{ success: boolean; filePath: string; fileName: string; folderPath: string }>(
        'download_media_url',
        params
      );
    },
    downloadViaYtdlp: async (params) => {
      return await invoke<{ success: boolean; filePath: string; fileName: string; folderPath: string }>(
        'download_via_ytdlp',
        params
      );
    },
    downloadBatchMedia: async (params) => {
      return await invoke<{ success: boolean; folderPath: string; totalCount: number; files: string[] }>(
        'download_batch_media',
        params
      );
    },
    fetchUrlText: async (url: string) => {
      return await invoke<string>('fetch_url_text', { url });
    },
    getAppVersion: async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        return await getVersion();
      } catch {
        return '1.0.1';
      }
    },
    checkForUpdates: async () => {
      try {
        return await invoke<any>('hovera_check_updates');
      } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message || 'Gagal memeriksa pembaruan';
        throw new Error(msg);
      }
    },
    installAppUpdate: async () => {
      try {
        const res = await invoke<{ success: boolean; message?: string }>('hovera_install_update');
        return { success: res?.success ?? true, message: res?.message };
      } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message || 'Gagal memasang update';
        return { success: false, error: msg };
      }
    },
    onUpdateProgress: (callback) => {
      let isCancelled = false;
      let unlisten: (() => void) | null = null;
      listen('update-download-progress', (event: any) => {
        callback(event.payload);
      }).then((un) => {
        if (isCancelled) {
          un();
        } else {
          unlisten = un;
        }
      }).catch(() => {});
      return () => {
        isCancelled = true;
        if (unlisten) unlisten();
      };
    },
    onMediaStateChanged: (callback) => {
      let isCancelled = false;
      let unlisten: (() => void) | null = null;
      listen('media-state-changed', (event: any) => {
        callback(event.payload);
      }).then((un) => {
        if (isCancelled) {
          un();
        } else {
          unlisten = un;
        }
      }).catch(() => {});
      return () => {
        isCancelled = true;
        if (unlisten) unlisten();
      };
    },
    isElectron: false,
  };

  window.electronAPI = bridge;
}
