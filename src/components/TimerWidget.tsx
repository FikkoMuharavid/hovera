import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Timer as TimerIcon } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/sound';

interface TimerWidgetProps {
  onTimerStateChange: (active: boolean, remainingFormatted: string) => void;
}

export const TimerWidget: React.FC<TimerWidgetProps> = ({ onTimerStateChange }) => {
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            sound.playSuccess();
            try {
              confetti({ particleCount: 50, spread: 60, origin: { y: 0.2 } });
            } catch {
              // fallback
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, secondsLeft]);

  // Format MM:SS
  const mins = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const secs = (secondsLeft % 60).toString().padStart(2, '0');
  const formattedTime = `${mins}:${secs}`;

  useEffect(() => {
    onTimerStateChange(isRunning, formattedTime);
  }, [isRunning, formattedTime, onTimerStateChange]);

  const toggleRun = () => {
    sound.playClick();
    if (secondsLeft === 0) {
      setSecondsLeft(totalSeconds);
      setIsRunning(true);
    } else {
      setIsRunning(!isRunning);
    }
  };

  const resetTimer = () => {
    sound.playPop();
    setIsRunning(false);
    setSecondsLeft(totalSeconds);
  };

  const setPreset = (minutes: number) => {
    sound.playClick();
    setIsRunning(false);
    setTotalSeconds(minutes * 60);
    setSecondsLeft(minutes * 60);
  };

  // Progress for SVG ring
  const progress = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
  const strokeDashoffset = 283 * (1 - progress);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-between h-full w-full select-none"
    >
      {/* Presets header */}
      <div className="flex items-center space-x-1.5 pb-2 border-b border-zinc-800/80 w-full justify-between">
        <div className="flex items-center space-x-1.5 text-xs text-zinc-300 font-medium">
          <TimerIcon className="w-3.5 h-3.5 text-amber-400" />
          <span>Fokus Timer</span>
        </div>

        <div className="flex items-center space-x-1 text-[10px]">
          {[5, 15, 25].map((m) => (
            <button
              key={m}
              onClick={() => setPreset(m)}
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

      {/* Circular Progress & Countdown */}
      <div className="relative flex items-center justify-center my-1">
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
      <div className="flex items-center space-x-3 mt-1">
        <button
          onClick={resetTimer}
          className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors"
          title="Reset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={toggleRun}
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
    </motion.div>
  );
};
