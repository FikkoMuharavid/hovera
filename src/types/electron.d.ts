export interface ProjectInfo {
  name: string;
  path: string;
  category: string;
}

export interface ElectronAPI {
  setIgnoreMouseEvents: (ignore: boolean) => void;
  openExternal: (url: string) => Promise<boolean>;
  launchApp: (target: string) => Promise<boolean>;
  adjustYOffset: (offset: number) => void;
  quitApp: () => void;
  isElectron?: boolean;
  openProjectInAntigravity?: (folderPath: string) => Promise<boolean>;
  scanProjects?: () => Promise<ProjectInfo[]>;
  selectFolder?: () => Promise<string | null>;
  moveWindow?: (deltaX: number, deltaY: number) => void;
  setWindowPosition?: (x: number, y: number) => void;
  getWindowPosition?: () => Promise<{ x: number; y: number; isCustom?: boolean } | null>;
  resetWindowPosition?: () => Promise<{ x: number; y: number } | null>;
  onPositionReset?: (callback: () => void) => () => void;
  saveNoteFile?: (params: {
    title: string;
    content: string;
    format: 'txt' | 'md';
  }) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  transcribeAudio?: (params: {
    audioSamples: Float32Array | number[];
    language?: string;
  }) => Promise<{ success: boolean; text?: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

