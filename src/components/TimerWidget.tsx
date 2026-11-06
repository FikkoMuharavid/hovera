import React from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Timer as TimerIcon } from 'lucide-react';

interface TimerWidgetProps {
  totalSeconds: number;
  secondsLeft: number;
  isRunning: boolean;
  onToggleRun: () => void;
  onReset: () => void;
  onSetPreset: (minutes: number) => void;
  formattedTime: string;
}

export const TimerWidget: React.FC<TimerWidgetProps> = ({
  totalSeconds,
  secondsLeft,
  isRunning,
  onToggleRun,
  onReset,
  onSetPreset,
  formattedTime,
}) => {
  // Progress for SVG ring
  const progress = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
  const strokeDashoffset = 283 * (1 - progress);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-between h-full w-full select-none py-1"
    >
      {/* Presets header */}
      <div className="flex items-center space-x-1.5 pb-1.5 border-b border-zinc-800/80 w-full justify-between shrink-0">
        <div className="flex items-center space-x-1.5 text-xs text-zinc-300 font-medium">
          <TimerIcon className="w-3.5 h-3.5 text-amber-400" />
          <span>Fokus Timer</span>
        </div>

        <div className="flex items-center space-x-1 text-[10px]">
          {[5, 15, 25, 45].map((m) => (
            <button
              key={m}
              onClick={() => onSetPreset(m)}
              className={`px-2 py-0.5 rounded-md font-mono transition-all ${
                totalSeconds === m * 60
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      {/* Main Timer Body - Rapi terpusat tanpa meregang */}
      <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 space-y-3 py-1 overflow-y-auto no-scrollbar">
        {/* Circular Progress & Countdown */}
        <div className="relative flex items-center justify-center">
          <svg className="w-24 h-24 -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="42"
              stroke="currentColor"
              strokeWidth="4"
              className="text-zinc-800"
              fill="transparent"
            />
            <circle
              cx="48"
              cy="48"
              r="42"
              stroke="currentColor"
              strokeWidth="4"
              className="text-amber-400 transition-all duration-300"
              fill="transparent"
              strokeDasharray="283"
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>

          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-xl font-bold font-mono tracking-tight text-white drop-shadow">
              {formattedTime}
            </span>
            <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
              {isRunning ? 'Berjalan' : secondsLeft === 0 ? 'Selesai' : 'Jeda'}
            </span>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onReset}
            className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleRun}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold shadow-md transition-all ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-black'
                : 'bg-white hover:bg-zinc-200 text-black'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Jeda</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Mulai</span>
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
