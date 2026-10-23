export interface ElectronAPI {
  setIgnoreMouseEvents: (ignore: boolean) => void;
  openExternal: (url: string) => Promise<boolean>;
  launchApp: (target: string) => Promise<boolean>;
  adjustYOffset: (offset: number) => void;
  quitApp: () => void;
  isElectron?: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
