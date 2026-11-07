export interface ProjectInfo {
  name: string;
  path: string;
  category: string;
}

export interface MediaState {
  isPlaying: boolean;
  title: string;
  artist: string;
  sourceApp: string;
  audioPeak: number;
  positionSecs?: number;
  durationSecs?: number;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  version?: string;
  notes?: string;
  pubDate?: string;
}

export interface ClipboardItem {
  id: string;
  content: string;
  preview: string;
  itemType: 'text' | 'link' | 'color' | 'code';
  colorHex?: string;
  charCount: number;
  isPinned: boolean;
  timestamp: number;
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
  getAppSettings?: () => Promise<Record<string, any>>;
  saveAppSettings?: (settings: Record<string, any>) => Promise<boolean>;
  onPositionReset?: (callback: () => void) => () => void;
  onCursorLeft?: (callback: () => void) => () => void;
  saveNoteFile?: (params: {
    title: string;
    content: string;
    format: 'txt' | 'md';
  }) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  transcribeAudio?: (params: {
    audioSamples: Float32Array | number[];
    language?: string;
  }) => Promise<{ success: boolean; text?: string; error?: string }>;
  hideWindow?: () => void;
  setWindowExpanded?: (expanded: boolean, height?: number, width?: number) => void;
  getAutoStart?: () => Promise<boolean>;
  setAutoStart?: (enable: boolean) => Promise<boolean>;
  openStartupSettings?: () => Promise<void>;
  checkOfficeInstalled?: () => Promise<{ word: boolean; excel: boolean; powerpoint: boolean; available: boolean }>;
  pickFilesDialog?: (filterType: 'images' | 'docs' | 'all') => Promise<{ path: string; name: string; extension: string; size: number }[]>;
  readFileAsBase64?: (path: string) => Promise<string>;
  saveFileInSameFolder?: (params: {
    sourcePath: string;
    suffix?: string;
    targetExt?: string;
    base64Data: string;
  }) => Promise<{ success: boolean; filePath: string; fileName: string; folderPath: string }>;
  convertOfficeToPdf?: (inputPath: string) => Promise<{ success: boolean; filePath: string; fileName: string; folderPath: string }>;
  compressPdfFile?: (inputPath: string) => Promise<{
    success: boolean;
    filePath: string;
    fileName: string;
    folderPath: string;
    originalSize: number;
    compressedSize: number;
    savingsPercent: number;
  }>;
  showInFolder?: (path: string) => Promise<boolean>;
  openFile?: (path: string) => Promise<boolean>;
  trimMemory?: () => void;
  getMediaState?: () => Promise<MediaState>;
  mediaTogglePlay?: () => Promise<boolean>;
  mediaNext?: () => Promise<boolean>;
  mediaPrev?: () => Promise<boolean>;
  onMediaStateChanged?: (callback: (state: MediaState) => void) => () => void;
  downloadMediaUrl?: (params: {
    url: string;
    filename: string;
  }) => Promise<{ success: boolean; filePath: string; fileName: string; folderPath: string }>;
  downloadViaYtdlp?: (params: {
    url: string;
    formatType: 'video' | 'audio';
  }) => Promise<{ success: boolean; filePath: string; fileName: string; folderPath: string }>;
  downloadBatchMedia?: (params: {
    items: Array<{ url: string; filename: string }>;
    folderName: string;
  }) => Promise<{ success: boolean; folderPath: string; totalCount: number; files: string[] }>;
  fetchUrlText?: (url: string) => Promise<string>;
  getAppVersion?: () => Promise<string>;
  checkForUpdates?: () => Promise<UpdateInfo>;
  installAppUpdate?: () => Promise<{ success: boolean; error?: string }>;
  onUpdateProgress?: (callback: (progress: { percent: number; downloaded: number; total: number }) => void) => () => void;
  getClipboardHistory?: () => Promise<ClipboardItem[]>;
  copyToClipboard?: (text: string) => Promise<boolean>;
  deleteClipboardItem?: (id: string) => Promise<boolean>;
  togglePinClipboardItem?: (id: string) => Promise<boolean>;
  clearClipboardHistory?: () => Promise<boolean>;
  onClipboardUpdated?: (callback: (items: ClipboardItem[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

