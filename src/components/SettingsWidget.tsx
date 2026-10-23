import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  MousePointer,
  Hand,
  MoveVertical,
  Power,
  ShieldCheck,
  Move,
  RotateCcw,
} from 'lucide-react';
import { sound } from '../utils/sound';

interface SettingsWidgetProps {
  expandOnHover: boolean;
  onToggleExpandOnHover: (val: boolean) => void;
  yOffset: number;
  onYOffsetChange: (val: number) => void;
  isDragMode: boolean;
  onToggleDragMode: (val: boolean) => void;
  onResetPosition: () => void;
  isCustomPosition: boolean;
}

export const SettingsWidget: React.FC<SettingsWidgetProps> = ({
  expandOnHover,
  onToggleExpandOnHover,
  yOffset,
  onYOffsetChange,
  isDragMode,
  onToggleDragMode,
  onResetPosition,
  isCustomPosition,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(sound.enabled);

  const toggleSound = () => {
    const nextVal = sound.toggleSound();
    setSoundEnabled(nextVal);
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
      className="flex flex-col h-full w-full select-none"
    >
      <div className="pb-2 border-b border-zinc-800/80">
        <span className="text-xs text-zinc-300 font-medium">Pengaturan Dynamic Island</span>
      </div>

      <div className="flex-1 space-y-2 mt-2 overflow-y-auto pr-0.5">
        {/* Drag Mode (Geser Posisi Dynamic Island) */}
        <div
          className={`flex flex-col p-2.5 rounded-xl border transition-all ${
            isDragMode
              ? 'bg-cyan-950/40 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
              : 'bg-zinc-900/80 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Move className={`w-4 h-4 ${isDragMode ? 'text-cyan-400 animate-pulse' : 'text-zinc-400'}`} />
              <div className="flex flex-col">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-zinc-200 font-medium">Mode Geser (Bebas Pindah)</span>
                  {isDragMode && (
                    <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/25 text-cyan-300 text-[8.5px] font-mono border border-cyan-500/40 animate-pulse">
                      ON · Siap Digeser
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500">
                  {isDragMode
                    ? 'Tahan dan geser kapsul ke mana saja di layar'
                    : 'Aktifkan untuk memindahkan letak Dynamic Island'}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                onToggleDragMode(!isDragMode);
              }}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                isDragMode ? 'bg-cyan-500' : 'bg-zinc-700'
              }`}
              title={isDragMode ? 'Kunci posisi (Matikan mode geser)' : 'Aktifkan mode geser'}
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
            <span className="text-[10px] text-zinc-400">
              {isCustomPosition ? '📍 Posisi Kustom Aktif' : '📍 Posisi Default (Tengah Atas)'}
            </span>
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

        {/* Y-Offset slider */}
        <div className="flex flex-col p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-2">
              <MoveVertical className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-zinc-200 font-medium">Jarak Atas (Y-Offset)</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">{yOffset}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="40"
            value={yOffset}
            onChange={(e) => onYOffsetChange(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-zinc-700 rounded-lg"
          />
        </div>

        {/* App Info & Quit */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span>Always-On Dynamic Island v1.0</span>
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
};
