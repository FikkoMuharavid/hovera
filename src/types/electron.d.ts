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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

