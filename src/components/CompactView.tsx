import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, CheckCircle2, Timer as TimerIcon, HeartPulse, Droplets } from 'lucide-react';

interface CompactViewProps {
  currentTime: string;
  currentDate: string;
  activeTasksCount: number;
  timerActive: boolean;
  timerRemaining: string;
  isStretchAlert?: boolean;
  isWaterAlert?: boolean;
  onClick: () => void;
}

export const CompactView: React.FC<CompactViewProps> = ({
  currentTime,
  currentDate,
  activeTasksCount,
  timerActive,
  timerRemaining,
  isStretchAlert = false,
  isWaterAlert = false,
  onClick,
}) => {
  const hasReminders = isWaterAlert || isStretchAlert || timerActive || activeTasksCount > 0;

  return (
    <motion.div
      onClick={onClick}
      className={`flex items-center ${
        hasReminders ? 'justify-between' : 'justify-center'
      } w-full h-full px-3 cursor-pointer select-none whitespace-nowrap`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {/* Sisi Kiri: Tanggal & Jam Menjadi Satu */}
      <div className="flex items-center space-x-1.5 shrink-0 text-zinc-300">
        <div className="flex items-center space-x-1 text-zinc-400">
          <Calendar className="w-3 h-3 text-zinc-500 shrink-0" />
          <span className="text-[11px] font-medium text-zinc-300 tracking-tight">
            {currentDate}
          </span>
        </div>
        <span className="text-zinc-600 text-[10px] select-none">·</span>
        <span className="text-xs font-semibold font-mono tracking-tight text-white">
          {currentTime}
        </span>
      </div>

      {/* Sisi Kanan: Notifikasi Pengingat */}
      {hasReminders && (
        <div className="flex items-center space-x-1.5 justify-end shrink-0">
          {/* Pengingat Minum Air Putih */}
          {isWaterAlert && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-[9px] text-sky-300 font-medium animate-pulse shadow-sm">
              <Droplets className="w-2.5 h-2.5 fill-current text-sky-400 shrink-0" />
              <span>Minum</span>
            </div>
          )}

          {/* Pengingat Peregangan Duduk */}
          {isStretchAlert && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-[9px] text-rose-300 font-medium animate-pulse shadow-sm">
              <HeartPulse className="w-2.5 h-2.5 text-rose-400 shrink-0" />
              <span>Regang</span>
            </div>
          )}

          {/* Timer Fokus Aktif */}
          {timerActive && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-300 font-mono font-medium">
              <TimerIcon
                className="w-2.5 h-2.5 animate-spin text-amber-400 shrink-0"
                style={{ animationDuration: '4s' }}
              />
              <span>{timerRemaining}</span>
            </div>
          )}

          {/* Badge Pengingat Tugas Aktif */}
          {activeTasksCount > 0 && (
            <div
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-zinc-800/90 border border-zinc-700/60 text-[10px] text-zinc-300 font-mono"
              title={`${activeTasksCount} tugas aktif`}
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-sky-400 shrink-0" />
              <span>{activeTasksCount}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
