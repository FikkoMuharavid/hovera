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
  return (
    <motion.div
      onClick={onClick}
      className="flex items-center justify-between w-full h-full px-3.5 cursor-pointer select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {/* Leading Left: Date */}
      <div className="flex items-center space-x-1.5 text-zinc-400">
        <Calendar className="w-3 h-3 text-zinc-500 shrink-0" />
        <span className="text-[11px] font-medium text-zinc-300 tracking-tight">
          {currentDate}
        </span>
      </div>

      {/* Center: Water Alert, Stretch Alert, or Task Indicator */}
      <div className="flex items-center space-x-1">
        {isWaterAlert ? (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/40 text-[9px] text-sky-300 font-medium animate-pulse">
            <Droplets className="w-2.5 h-2.5 fill-current" />
            <span>Minum</span>
          </div>
        ) : isStretchAlert ? (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-[9px] text-rose-300 font-medium animate-pulse">
            <HeartPulse className="w-2.5 h-2.5" />
            <span>Regang</span>
          </div>
        ) : activeTasksCount > 0 ? (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-zinc-800/90 border border-zinc-700/60 text-[10px] text-zinc-300 font-mono">
            <CheckCircle2 className="w-2.5 h-2.5 text-sky-400" />
            <span>{activeTasksCount}</span>
          </div>
        ) : null}
      </div>

      {/* Trailing Right: Clock or Active Timer */}
      <div>
        {timerActive ? (
          <div className="flex items-center space-x-1 text-amber-400 text-xs font-semibold tracking-wider font-mono">
            <TimerIcon className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
            <span>{timerRemaining}</span>
          </div>
        ) : (
          <span className="text-xs font-semibold font-mono tracking-wide text-zinc-100">
            {currentTime}
          </span>
        )}
      </div>
    </motion.div>
  );
};
