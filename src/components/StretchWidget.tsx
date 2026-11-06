import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Play, Flame, Bell, Clock, AlertCircle, Activity, Sparkles, Move } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/sound';

interface StretchStep {
  id: number;
  title: string;
  target: string;
  instruction: string;
  duration: number; // in seconds
  iconType: 'neck' | 'spine' | 'wrist' | 'legs';
  badge: string;
}

const STRETCH_STEPS: StretchStep[] = [
  {
    id: 1,
    title: 'Rotasi Leher & Pundak',
    target: 'Leher & Bahu',
    instruction: 'Putar kepala 3x ke kiri & kanan. Tarik kedua bahu ke belakang.',
    duration: 15,
    iconType: 'neck',
    badge: '15 Detik',
  },
  {
    id: 2,
    title: 'Puntir Tulang Belakang',
    target: 'Pinggang & Punggung',
    instruction: 'Duduk tegak, putar badan ke samping sambil pegang sandaran kursi.',
    duration: 15,
    iconType: 'spine',
    badge: '15 Detik',
  },
  {
    id: 3,
    title: 'Regang Gelang Tangan',
    target: 'Jari & Pergelangan',
    instruction: 'Luruskan lengan ke depan, tarik jemari ke belakang menghadap dada.',
    duration: 15,
    iconType: 'wrist',
    badge: '15 Detik',
  },
  {
    id: 4,
    title: 'Berdiri & Jinjit 10x',
    target: 'Kaki & Sirkulasi Darah',
    instruction: 'Berdiri dari kursi, jinjit naik-turun perlahan untuk pompa aliran darah.',
    duration: 15,
    iconType: 'legs',
    badge: '15 Detik',
  },
];

const renderStepIcon = (type: 'neck' | 'spine' | 'wrist' | 'legs', large = false) => {
  const sizeClass = large ? 'w-5 h-5' : 'w-3.5 h-3.5';
  const containerClass = large
    ? 'w-10 h-10 rounded-xl mb-1 shadow-sm'
    : 'w-6 h-6 rounded-lg shrink-0 mt-0.5 shadow-sm';

  switch (type) {
    case 'neck':
      return (
        <div className={`${containerClass} bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400`}>
          <RotateCcw className={sizeClass} />
        </div>
      );
    case 'spine':
      return (
        <div className={`${containerClass} bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400`}>
          <Move className={sizeClass} />
        </div>
      );
    case 'wrist':
      return (
        <div className={`${containerClass} bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400`}>
          <Sparkles className={sizeClass} />
        </div>
      );
    case 'legs':
      return (
        <div className={`${containerClass} bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400`}>
          <Activity className={sizeClass} />
        </div>
      );
  }
};

interface StretchWidgetProps {
  stretchSecondsLeft: number;
  totalIntervalMinutes: number;
  onResetTimer: () => void;
  onSnoozeTimer: (minutes: number) => void;
  onIntervalChange: (minutes: number) => void;
  autoAlertEnabled: boolean;
  onToggleAutoAlert: () => void;
}

export const StretchWidget: React.FC<StretchWidgetProps> = ({
  stretchSecondsLeft,
  totalIntervalMinutes,
  onResetTimer,
  onSnoozeTimer,
  onIntervalChange,
  autoAlertEnabled,
  onToggleAutoAlert,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [stepSecondsLeft, setStepSecondsLeft] = useState(15);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Interval timer for guided stretch session
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isSessionActive && activeStepIndex !== null) {
      interval = setInterval(() => {
        setStepSecondsLeft((prev) => {
          if (prev <= 1) {
            sound.playSuccess();
            if (activeStepIndex < STRETCH_STEPS.length - 1) {
              setActiveStepIndex((curr) => (curr !== null ? curr + 1 : 0));
              return STRETCH_STEPS[activeStepIndex + 1].duration;
            } else {
              // Completed all 4 steps
              setIsSessionActive(false);
              setActiveStepIndex(null);
              onResetTimer();
              try {
                confetti({
                  particleCount: 65,
                  spread: 70,
                  origin: { y: 0.2 },
                  colors: ['#34d399', '#38bdf8', '#fbbf24', '#f43f5e'],
                });
              } catch {
                // fallback
              }
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSessionActive, activeStepIndex, onResetTimer]);

  const startGuidedSession = () => {
    sound.playClick();
    setActiveStepIndex(0);
    setStepSecondsLeft(STRETCH_STEPS[0].duration);
    setIsSessionActive(true);
  };

  const cancelSession = () => {
    sound.playPop();
    setIsSessionActive(false);
    setActiveStepIndex(null);
  };

  // Format countdown MM:SS
  const mins = Math.floor(stretchSecondsLeft / 60).toString().padStart(2, '0');
  const secs = (stretchSecondsLeft % 60).toString().padStart(2, '0');
  const countdownFormatted = `${mins}:${secs}`;
  const isTimeUp = stretchSecondsLeft === 0;

  // Progress percentage
  const totalSeconds = totalIntervalMinutes * 60;
  const progressPercent = totalSeconds > 0 
    ? Math.min(100, Math.max(0, ((totalSeconds - stretchSecondsLeft) / totalSeconds) * 100))
    : 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full select-none"
    >
      {/* Top Countdown & Status Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <div className="flex items-center space-x-2">
          <Clock className={`w-3.5 h-3.5 ${isTimeUp ? 'text-rose-400 animate-pulse' : 'text-sky-400'}`} />
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-zinc-400">Timer Regang:</span>
            <span
              className={`font-mono font-bold tracking-wider ${
                isTimeUp ? 'text-rose-400 animate-bounce' : 'text-zinc-100'
              }`}
            >
              {isTimeUp ? '00:00 (Waktunya!)' : countdownFormatted}
            </span>
          </div>
        </div>

        {/* Interval Presets & Toggle */}
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
            {[20, 30, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => {
                  sound.playClick();
                  onIntervalChange(m);
                }}
                className={`px-1.5 py-0.5 rounded-md font-mono transition-all ${
                  totalIntervalMinutes === m
                    ? 'bg-zinc-700 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m}m
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              sound.playClick();
              onToggleAutoAlert();
            }}
            className={`p-1 rounded-lg border text-xs transition-colors ${
              autoAlertEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}
            title={autoAlertEnabled ? 'Otomatis buka pulau saat waktu habis: Aktif' : 'Otomatis: Nonaktif'}
          >
            <Bell className="w-3 h-3" />
          </button>

          <button
            onClick={() => {
              sound.playSuccess();
              onResetTimer();
            }}
            className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-300 border border-zinc-800 text-[10px] font-medium transition-colors"
            title="Reset timer peregangan"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Thin Visual Progress Bar */}
      <div className="w-full h-1 bg-zinc-900 rounded-full my-1.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${
            isTimeUp ? 'bg-rose-500' : 'bg-gradient-to-r from-sky-500 to-emerald-400'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-1 pr-0.5">
        <AnimatePresence mode="wait">
          {/* Overdue Alert Banner if time is up */}
          {isTimeUp && !isSessionActive && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-2 mb-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs"
            >
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-medium">Sudah {totalIntervalMinutes} menit duduk! Yuk regangkan badan.</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => onSnoozeTimer(5)}
                  className="px-2 py-0.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-[10px] text-zinc-300 font-mono transition-colors"
                >
                  Tunda 5m
                </button>
                <button
                  onClick={startGuidedSession}
                  className="px-2.5 py-0.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-black font-semibold text-[10px] transition-colors"
                >
                  Regang Sekarang
                </button>
              </div>
            </motion.div>
          )}

          {isSessionActive && activeStepIndex !== null ? (
            /* Guided Step-by-Step Mode */
            <motion.div
              key="guided"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col items-center justify-between h-[165px] p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">
                  Langkah {activeStepIndex + 1} dari 4 ({STRETCH_STEPS[activeStepIndex].target})
                </span>
                <span className="text-sm font-mono font-bold text-amber-400">
                  {stepSecondsLeft}s
                </span>
              </div>

              <div className="flex flex-col items-center">
                {renderStepIcon(STRETCH_STEPS[activeStepIndex].iconType, true)}
                <h4 className="text-sm font-semibold text-white">
                  {STRETCH_STEPS[activeStepIndex].title}
                </h4>
                <p className="text-xs text-zinc-300 mt-1 max-w-[340px]">
                  {STRETCH_STEPS[activeStepIndex].instruction}
                </p>
              </div>

              <button
                onClick={cancelSession}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 underline transition-colors"
              >
                Hentikan Sesi
              </button>
            </motion.div>
          ) : (
            /* Infografis 4 Gerakan Singkat Padat Jelas */
            <motion.div
              key="infographic"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col space-y-2"
            >
              {/* Infographic 2x2 Grid */}
              <div className="grid grid-cols-2 gap-2">
                {STRETCH_STEPS.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start space-x-2.5 p-2 rounded-xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-all"
                  >
                    {renderStepIcon(step.iconType)}
                    <div className="flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-100 truncate">
                          {step.title}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-400 shrink-0 ml-1">
                          {step.badge}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5 leading-tight">
                        {step.instruction}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Banner */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Hanya 1 menit untuk segarkan tulang & otot</span>
                </div>

                <button
                  onClick={startGuidedSession}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-semibold text-xs shadow-md transition-all active:scale-95"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Mulai Peregangan 1 Menit</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
