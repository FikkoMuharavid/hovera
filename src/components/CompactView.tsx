import React from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  CheckCircle2,
  Timer as TimerIcon,
  HeartPulse,
  Droplets,
  Heart,
  Sparkles,
} from 'lucide-react';

interface CompactViewProps {
  currentTime: string;
  currentDate: string;
  activeTasksCount: number;
  timerActive: boolean;
  timerRemaining: string;
  stopwatchActive?: boolean;
  stopwatchTime?: string;
  isStretchAlert?: boolean;
  isWaterAlert?: boolean;
  isAnnivToday?: boolean;
  isMensiveToday?: boolean;
  isMensiveApproaching?: boolean;
  daysUntilMensive?: number;
  showAnnivBadge?: boolean;
  onClick: () => void;
}

export const CompactView: React.FC<CompactViewProps> = ({
  currentTime,
  currentDate,
  activeTasksCount,
  timerActive,
  timerRemaining,
  stopwatchActive = false,
  stopwatchTime = '',
  isStretchAlert = false,
  isWaterAlert = false,
  isAnnivToday = false,
  isMensiveToday = false,
  isMensiveApproaching = false,
  daysUntilMensive,
  showAnnivBadge = false,
  onClick,
}) => {
  // Hanya aktif jika memang ada badge notifikasi yang akan ditampilkan
  const hasWater = isWaterAlert;
  const hasStretch = isStretchAlert;
  const hasTimer = timerActive;
  const hasStopwatch = stopwatchActive;
  const hasTasks = activeTasksCount > 0;
  const hasAnniv = isAnnivToday;
  const hasMensive = !isAnnivToday && isMensiveToday;
  const hasApproachingAnniv =
    !isAnnivToday &&
    !isMensiveToday &&
    showAnnivBadge &&
    (isMensiveApproaching || (daysUntilMensive !== undefined && daysUntilMensive <= 3));

  const hasAnyReminder =
    hasWater || hasStretch || hasTimer || hasStopwatch || hasTasks || hasAnniv || hasMensive || hasApproachingAnniv;

  return (
    <motion.div
      onClick={onClick}
      className={`flex items-center ${
        hasAnyReminder ? 'justify-between px-3.5' : 'justify-center px-3'
      } w-full h-full cursor-pointer select-none whitespace-nowrap`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {/* Sisi Kiri / Tengah: Tanggal & Jam Menjadi Satu - Lurus & Level Sempurna */}
      <div className="inline-flex items-center space-x-1.5 text-zinc-300 shrink-0 leading-none">
        <div className="inline-flex items-center space-x-1 text-zinc-400 leading-none">
          <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="text-[11.5px] font-medium text-zinc-300 tracking-tight leading-none">
            {currentDate}
          </span>
        </div>
        <span className="text-zinc-600 text-[10px] leading-none px-0.5 select-none">·</span>
        <span className="text-xs font-semibold text-white tracking-tight tabular-nums leading-none">
          {currentTime}
        </span>
      </div>

      {/* Sisi Kanan: Hanya render jika benar-benar ada notifikasi aktif */}
      {hasAnyReminder && (
        <div className="inline-flex items-center space-x-1.5 justify-end shrink-0 leading-none">
          {/* Pengingat Anniversary Tahunan (14 Feb) */}
          {hasAnniv && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-pink-500/30 to-purple-500/30 border border-pink-400/50 text-[9px] text-pink-200 font-medium animate-pulse shadow-sm leading-none">
              <Sparkles className="w-2.5 h-2.5 text-pink-300 shrink-0" />
              <span>Anniv! 💍</span>
            </div>
          )}

          {/* Pengingat Mensive Bulanan (Hari H Tgl 14) */}
          {hasMensive && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/50 text-[9px] text-rose-200 font-medium animate-pulse shadow-sm leading-none">
              <Heart className="w-2.5 h-2.5 fill-current text-rose-400 shrink-0" />
              <span>Mensive! 💖</span>
            </div>
          )}

          {/* Pengingat Mensive Menjelang (H-3/H-2/H-1) */}
          {hasApproachingAnniv && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-400/30 text-[9px] text-rose-300 font-medium leading-none">
              <Heart className="w-2.5 h-2.5 fill-current text-rose-400 shrink-0" />
              <span>
                {daysUntilMensive !== undefined ? `H-${daysUntilMensive} Mensive` : '14 Feb'}
              </span>
            </div>
          )}

          {/* Pengingat Minum Air Putih */}
          {hasWater && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-[9px] text-sky-300 font-medium animate-pulse shadow-sm leading-none">
              <Droplets className="w-2.5 h-2.5 fill-current text-sky-400 shrink-0" />
              <span>Minum</span>
            </div>
          )}

          {/* Pengingat Peregangan Duduk */}
          {hasStretch && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-[9px] text-rose-300 font-medium animate-pulse shadow-sm leading-none">
              <HeartPulse className="w-2.5 h-2.5 text-rose-400 shrink-0" />
              <span>Regang</span>
            </div>
          )}

          {/* Timer Fokus Aktif */}
          {hasTimer && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-300 font-medium tabular-nums leading-none">
              <TimerIcon
                className="w-2.5 h-2.5 animate-spin text-amber-400 shrink-0"
                style={{ animationDuration: '4s' }}
              />
              <span>{timerRemaining}</span>
            </div>
          )}

          {/* Stopwatch Aktif */}
          {hasStopwatch && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium tabular-nums leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>{stopwatchTime}</span>
            </div>
          )}

          {/* Badge Pengingat Tugas Aktif */}
          {hasTasks && (
            <div
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-zinc-800/90 border border-zinc-700/60 text-[10px] text-zinc-300 tabular-nums leading-none"
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
