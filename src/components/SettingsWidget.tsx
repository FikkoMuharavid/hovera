import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  MousePointer,
  Hand,
  Power,
  Move,
  RotateCcw,
  Zap,
  EyeOff,
  Mic2,
  ExternalLink,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import type { UpdateInfo } from '../types/electron';
import { sound } from '../utils/sound';

interface SettingsWidgetProps {
  expandOnHover: boolean;
  onToggleExpandOnHover: (val: boolean) => void;
  isDragMode: boolean;
  onToggleDragMode: (val: boolean) => void;
  onResetPosition: () => void;
  isCustomPosition: boolean;
  displayStyle?: 'floating' | 'top-notch';
  onToggleDisplayStyle?: (val: 'floating' | 'top-notch') => void;
  showLyrics?: boolean;
  onToggleShowLyrics?: (val: boolean) => void;
  soundEnabled?: boolean;
  onToggleSound?: (val: boolean) => void;
  initialUpdateInfo?: UpdateInfo | null;
}

export const SettingsWidget = React.memo<SettingsWidgetProps>(({
  expandOnHover,
  onToggleExpandOnHover,
  isDragMode,
  onToggleDragMode,
  onResetPosition,
  isCustomPosition,
  displayStyle = 'floating',
  onToggleDisplayStyle,
  showLyrics = true,
  onToggleShowLyrics,
  soundEnabled: soundEnabledProp,
  onToggleSound,
  initialUpdateInfo,
}) => {
  const [internalSoundEnabled, setInternalSoundEnabled] = useState(sound.enabled);
  const soundEnabled = soundEnabledProp !== undefined ? soundEnabledProp : internalSoundEnabled;
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(() => initialUpdateInfo || null);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ percent: number; downloaded: number; total: number } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');

  useEffect(() => {
    if (initialUpdateInfo) {
      setUpdateInfo(initialUpdateInfo);
    }
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setAppVersion(v.replace(/^v/, ''));
      });
    }
  }, [initialUpdateInfo]);

  const handleCheckUpdate = async () => {
    sound.playClick();
    setIsCheckingUpdate(true);
    setUpdateStatusMessage(null);
    setUpdateError(null);
    try {
      if (window.electronAPI?.checkForUpdates) {
        const res = await window.electronAPI.checkForUpdates();
        if (res && res.hasUpdate) {
          setUpdateInfo(res);
        } else {
          setUpdateInfo(null);
          setUpdateStatusMessage(`Hovera sudah versi terbaru (v${appVersion})`);
          setTimeout(() => setUpdateStatusMessage(null), 4000);
        }
      } else {
        setUpdateStatusMessage('Fitur periksa update siap di versi rilis.');
        setTimeout(() => setUpdateStatusMessage(null), 4000);
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'Gagal memeriksa update.';
      setUpdateError(msg);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    sound.playClick();
    setIsInstallingUpdate(true);
    setUpdateError(null);
    setUpdateProgress({ percent: 0, downloaded: 0, total: 0 });

    let unlisten: (() => void) | undefined;
    if (window.electronAPI?.onUpdateProgress) {
      unlisten = window.electronAPI.onUpdateProgress((p) => {
        setUpdateProgress(p);
      });
    }

    try {
      if (window.electronAPI?.installAppUpdate) {
        const res = await window.electronAPI.installAppUpdate();
        if (res?.success) {
          setUpdateSuccess(true);
          setUpdateProgress(null);
        } else if (res?.error) {
          setUpdateError(res.error);
          setUpdateProgress(null);
        }
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'Gagal memasang pembaruan.';
      setUpdateError(msg);
      setUpdateProgress(null);
    } finally {
      if (unlisten) unlisten();
      setIsInstallingUpdate(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const checkAutoStart = () => {
      if (window.electronAPI?.getAutoStart) {
        window.electronAPI
          .getAutoStart()
          .then((res) => {
            if (isMounted) {
              setAutoStartEnabled(!!res);
            }
          })
          .catch(() => {});
      }
    };

    checkAutoStart();
    window.addEventListener('focus', checkAutoStart);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', checkAutoStart);
    };
  }, []);

  const toggleSound = () => {
    if (onToggleSound) {
      onToggleSound(!soundEnabled);
    } else {
      const nextVal = sound.toggleSound();
      setInternalSoundEnabled(nextVal);
      if (window.electronAPI?.saveAppSettings && window.electronAPI?.getAppSettings) {
        window.electronAPI.getAppSettings().then((curr) => {
          window.electronAPI?.saveAppSettings?.({ ...(curr || {}), soundEnabled: nextVal });
        }).catch(() => {});
      }
    }
  };

  const handleToggleAutoStart = async () => {
    sound.playClick();
    const nextVal = !autoStartEnabled;
    setAutoStartEnabled(nextVal);
    if (window.electronAPI?.setAutoStart) {
      try {
        await window.electronAPI.setAutoStart(nextVal);
        if (window.electronAPI.getAutoStart) {
          const actual = await window.electronAPI.getAutoStart();
          setAutoStartEnabled(!!actual);
        }
      } catch {
        // fallback
      }
    }
  };

  const handleOpenStartupSettings = () => {
    sound.playClick();
    if (window.electronAPI?.openStartupSettings) {
      window.electronAPI.openStartupSettings();
    } else if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal('ms-settings:startupapps');
    }
  };

  const handleHideToTray = () => {
    sound.playPop();
    if (window.electronAPI?.hideWindow) {
      window.electronAPI.hideWindow();
    }
  };

  const handleQuit = () => {
    sound.playPop();
    if (window.electronAPI) {
      window.electronAPI.quitApp();
    } else {
      alert('Aplikasi berjalan di browser. Di desktop Electron, ini akan menutup aplikasi.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col flex-1 min-h-0 w-full select-none"
    >
      <div className="pb-2 border-b border-zinc-800/80 shrink-0">
        <span className="text-xs text-zinc-300 font-medium">Pengaturan Hovera</span>
      </div>

      <div className="flex-1 min-h-0 space-y-2 mt-2 overflow-y-auto pr-0.5 pb-2 no-scrollbar">
        {/* Display Style: Floating vs Top Notch */}
        <div className="flex flex-col p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <div className="flex flex-col">
                <span className="text-xs text-zinc-200 font-medium">Gaya Tampilan</span>
                <span className="text-[10px] text-zinc-500">
                  Pilih bentuk kapsul Dynamic Island atau Notch menempel atas
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950/80 rounded-xl border border-zinc-800/80">
            <button
              onClick={() => {
                sound.playClick();
                onToggleDisplayStyle?.('floating');
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all ${
                displayStyle === 'floating'
                  ? 'bg-zinc-800 text-white shadow-sm border border-cyan-500/40 text-cyan-300'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <div className="w-3.5 h-2 rounded-full border border-current opacity-80" />
              <span>Melayang (Island)</span>
            </button>

            <button
              onClick={() => {
                sound.playClick();
                onToggleDisplayStyle?.('top-notch');
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all ${
                displayStyle === 'top-notch'
                  ? 'bg-zinc-800 text-white shadow-sm border border-cyan-500/40 text-cyan-300'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <div className="w-3.5 h-2 border-t-2 border-x border-b-0 border-current rounded-b-md opacity-80" />
              <span>Menempel Atas (Notch)</span>
            </button>
          </div>
        </div>

        {/* Drag Mode (Geser Posisi Dynamic Island) */}
        <div className="flex flex-col p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Move className={`w-4 h-4 ${isDragMode ? 'text-sky-400' : 'text-zinc-400'}`} />
              <div className="flex flex-col">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-zinc-200 font-medium">
                    {displayStyle === 'top-notch' ? 'Mode Geser (Horizontal)' : 'Mode Geser (Bebas Pindah)'}
                  </span>
                  {isDragMode && (
                    <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 text-[8.5px] font-mono border border-sky-500/30">
                      ON
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500">
                  {isDragMode
                    ? displayStyle === 'top-notch'
                      ? 'Tahan dan geser notch ke kanan atau kiri di sepanjang tepi atas layar.'
                      : 'Tahan dan geser kapsul ke mana saja di layar (X & Y). Matikan switch jika ingin mengunci.'
                    : 'Aktifkan switch untuk menggeser letak Hovera'}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                onToggleDragMode(!isDragMode);
              }}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                isDragMode ? 'bg-sky-500' : 'bg-zinc-700'
              }`}
              title={isDragMode ? 'Matikan mode geser (kunci posisi)' : 'Aktifkan mode geser'}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  isDragMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Reset position button if moved */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center space-x-1 text-[10px] text-zinc-400">
              <Move className="w-3 h-3 text-zinc-500" />
              <span>{isCustomPosition ? 'Posisi Kustom Aktif' : 'Posisi Default (Tengah Atas)'}</span>
            </div>
            <button
              onClick={onResetPosition}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-medium transition-colors"
              title="Kembalikan posisi ke tengah atas"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reset Posisi</span>
            </button>
          </div>
        </div>

        {/* Trigger mode */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center space-x-2">
            {expandOnHover ? (
              <Hand className="w-4 h-4 text-sky-400" />
            ) : (
              <MousePointer className="w-4 h-4 text-amber-400" />
            )}
            <div className="flex flex-col">
              <span className="text-xs text-zinc-200 font-medium">Buka Saat Hover</span>
              <span className="text-[10px] text-zinc-500">
                {expandOnHover ? 'Kapsul terbuka saat kursor diarahkan' : 'Kapsul terbuka hanya saat diklik'}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              onToggleExpandOnHover(!expandOnHover);
            }}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
              expandOnHover ? 'bg-sky-500' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                expandOnHover ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Sound toggle */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center space-x-2">
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-zinc-500" />
            )}
            <div className="flex flex-col">
              <span className="text-xs text-zinc-200 font-medium">Efek Suara Haptik</span>
              <span className="text-[10px] text-zinc-500">Suara feedback sentuhan Apple UI</span>
            </div>
          </div>

          <button
            onClick={toggleSound}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
              soundEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                soundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Synced Lyrics toggle */}
        {onToggleShowLyrics && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center space-x-2">
              <Mic2 className={`w-4 h-4 ${showLyrics ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <div className="flex flex-col">
                <span className="text-xs text-zinc-200 font-medium">Lirik Musik Tersinkronisasi</span>
                <span className="text-[10px] text-zinc-500">Tampilkan lirik berjalan otomatis saat memutar lagu Spotify / browser</span>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                onToggleShowLyrics(!showLyrics);
              }}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                showLyrics ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
              title="Aktifkan/Matikan Lirik Musik"
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  showLyrics ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}

        {/* Windows Startup Auto Launch */}
        <div className="flex flex-col p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className={`w-4 h-4 ${autoStartEnabled ? 'text-amber-400' : 'text-zinc-500'}`} />
              <div className="flex flex-col">
                <span className="text-xs text-zinc-200 font-medium">Buka Otomatis Saat Windows Dinyalakan</span>
                <span className="text-[10px] text-zinc-500">
                  {autoStartEnabled
                    ? 'Aktif: Otomatis standby di atas layar saat laptop dinyalakan'
                    : 'Mati: Hanya dibuka saat Anda mengklik aplikasinya'}
                </span>
              </div>
            </div>

            <button
              onClick={handleToggleAutoStart}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                autoStartEnabled ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
              title="Aktifkan/Matikan Auto Startup Windows"
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  autoStartEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px]">
            <span className="text-zinc-500">
              Tersinkronisasi resmi dengan Windows Settings & Task Manager
            </span>
            <button
              type="button"
              onClick={handleOpenStartupSettings}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Buka Pengaturan Startup Windows (ms-settings:startupapps)"
            >
              <span>Buka Pengaturan Windows</span>
              <ExternalLink className="w-2.5 h-2.5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Pembaruan Aplikasi (Hovera Update) */}
        <div className="flex flex-col p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <div className="flex flex-col">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-zinc-200 font-medium">Pembaruan Aplikasi</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[9px] font-mono border border-cyan-500/20">
                    v{appVersion}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500">
                  Update resmi otomatis terdistribusi via GitHub Releases
                </span>
              </div>
            </div>

            <button
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate || isInstallingUpdate}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 text-[10px] font-medium border border-zinc-700/80 transition-all cursor-pointer disabled:opacity-50"
              title="Periksa apakah ada versi baru di GitHub"
            >
              <RefreshCw className={`w-3 h-3 text-cyan-400 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdate ? 'Memeriksa...' : 'Periksa Update'}</span>
            </button>
          </div>

          {/* Status Message */}
          {updateStatusMessage && (
            <div className="flex items-center space-x-1.5 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10.5px]">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{updateStatusMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {updateError && (
            <div className="flex items-center space-x-1.5 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10.5px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{updateError}</span>
            </div>
          )}

          {/* Update Available Card */}
          {updateInfo?.hasUpdate && !updateSuccess && (
            <div className="flex flex-col p-2 rounded-lg bg-gradient-to-br from-cyan-950/30 to-zinc-900 border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[11px] font-semibold text-white">
                    Pembaruan Tersedia: v{updateInfo.version}
                  </span>
                </div>
                {updateInfo.pubDate && (
                  <span className="text-[9.5px] text-zinc-400">
                    {new Date(updateInfo.pubDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>

              {updateInfo.notes && (
                <div className="text-[10px] text-zinc-300 bg-black/40 p-2 rounded border border-white/5 whitespace-pre-wrap max-h-24 overflow-y-auto leading-relaxed">
                  {updateInfo.notes}
                </div>
              )}

              {/* Download Progress Bar */}
              {isInstallingUpdate && updateProgress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[9.5px] text-zinc-400 font-mono">
                    <span>Mengunduh...</span>
                    <span>{updateProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-300 rounded-full"
                      style={{ width: `${updateProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleInstallUpdate}
                disabled={isInstallingUpdate}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-black font-semibold text-[11px] transition-all cursor-pointer disabled:opacity-60 shadow-lg shadow-cyan-500/20"
              >
                <Download className={`w-3.5 h-3.5 ${isInstallingUpdate ? 'animate-bounce' : ''}`} />
                <span>{isInstallingUpdate ? 'Mengunduh & Memasang...' : 'Perbarui Sekarang'}</span>
              </button>
            </div>
          )}

          {/* Update Success Banner */}
          {updateSuccess && (
            <div className="flex flex-col space-y-2 p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px]">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium">Pembaruan berhasil dipasang!</span>
                  <span className="text-[9.5px] text-emerald-400/80">Muat ulang Hovera untuk menikmati versi terbaru.</span>
                </div>
              </div>
              <button
                onClick={() => {
                  sound.playPop();
                  if (window.electronAPI?.quitApp) {
                    window.electronAPI.quitApp();
                  }
                }}
                className="w-full flex items-center justify-center py-1.5 px-3 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black font-semibold text-[10.5px] transition-all cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <span>Restart Hovera Sekarang</span>
              </button>
            </div>
          )}
        </div>

        {/* Minimize to System Tray */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center space-x-2">
            <EyeOff className="w-4 h-4 text-sky-400" />
            <div className="flex flex-col">
              <span className="text-xs text-zinc-200 font-medium">Sembunyikan ke System Tray</span>
              <span className="text-[10px] text-zinc-500">
                Kapsul disembunyikan ke taskbar dekat jam Windows (klik icon tray untuk tampilkan)
              </span>
            </div>
          </div>

          <button
            onClick={handleHideToTray}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sky-300 hover:text-white text-[10px] font-medium border border-zinc-700/80 transition-colors cursor-pointer"
          >
            <span>Sembunyikan</span>
          </button>
        </div>

        {/* App Info & Quit */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2 text-[10px] text-zinc-500">
            <span className="text-zinc-400 font-medium">Dynamic Island Windows v1.0</span>
          </div>

          <button
            onClick={handleQuit}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs transition-colors"
          >
            <Power className="w-3 h-3" />
            <span>Keluar Aplikasi</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
});
