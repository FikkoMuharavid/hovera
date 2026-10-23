import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Play, Flame } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/sound';

interface StretchStep {
  id: number;
  title: string;
  target: string;
  instruction: string;
  duration: number; // in seconds
  icon: string;
  badge: string;
  color: string;
}

const STRETCH_STEPS: StretchStep[] = [
  {
    id: 1,
    title: 'Rotasi Leher & Pundak',
    target: 'Leher & Bahu',
    instruction: 'Putar kepala 3x ke kiri & kanan. Tarik kedua bahu ke belakang.',
    duration: 15,
    icon: '🙆‍♂️',
    badge: '15 Detik',
    color: 'from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 2,
    title: 'Puntir Tulang Belakang',
    target: 'Pinggang & Tulang Belakang',
    instruction: 'Duduk tegak, putar badan ke samping sambil pegang sandaran kursi.',
    duration: 15,
    icon: '🧘‍♀️',
    badge: '15 Detik',
    color: 'from-sky-500/20 to-blue-500/20 text-sky-300 border-sky-500/30',
  },
  {
    id: 3,
    title: 'Regang Gelang Tangan',
    target: 'Jari & Pergelangan',
    instruction: 'Luruskan lengan ke depan, tarik jemari ke belakang menghadap dada.',
    duration: 15,
    icon: '🤲',
    badge: '15 Detik',
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 4,
    title: 'Berdiri & Jinjit 10x',
    target: 'Kaki & Sirkulasi Darah',
    instruction: 'Berdiri dari kursi, jinjit naik-turun perlahan untuk pompa aliran darah.',
    duration: 15,
    icon: '🦵',
    badge: '15 Detik',
    color: 'from-rose-500/20 to-pink-500/20 text-rose-300 border-rose-500/30',
  },
];

interface StretchWidgetProps {
  sittingMinutes: number;
  onResetSitting: () => void;
  reminderInterval: number;
  onIntervalChange: (mins: number) => void;
}

export const StretchWidget: React.FC<StretchWidgetProps> = ({
  sittingMinutes,
  onResetSitting,
  reminderInterval,
  onIntervalChange,
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
            // Move to next step or complete
            if (activeStepIndex < STRETCH_STEPS.length - 1) {
              setActiveStepIndex((curr) => (curr !== null ? curr + 1 : 0));
              return STRETCH_STEPS[activeStepIndex + 1].duration;
            } else {
              // Completed all 4 steps
              setIsSessionActive(false);
              setActiveStepIndex(null);
              onResetSitting();
              try {
                confetti({
                  particleCount: 60,
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
  }, [isSessionActive, activeStepIndex, onResetSitting]);

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

  const isOverdue = sittingMinutes >= reminderInterval;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full select-none"
    >
      {/* Top Status Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isOverdue ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
            }`}
          />
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-zinc-400">Duduk:</span>
            <span
              className={`font-mono font-bold ${
                isOverdue ? 'text-rose-400' : 'text-zinc-100'
              }`}
            >
              {sittingMinutes} mnt
            </span>
            {isOverdue && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 border border-rose-500/40 text-[9px] text-rose-300 font-medium">
                Waktunya Regang!
              </span>
            )}
          </div>
        </div>

        {/* Interval dropdown / options & Reset */}
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
            {[30, 45, 60].map((mins) => (
              <button
                key={mins}
                onClick={() => {
                  sound.playClick();
                  onIntervalChange(mins);
                }}
                className={`px-1.5 py-0.5 rounded-md font-mono transition-all ${
                  reminderInterval === mins
                    ? 'bg-zinc-700 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {mins}m
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              sound.playSuccess();
              onResetSitting();
            }}
            className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-300 border border-zinc-800 text-[10px] font-medium transition-colors"
            title="Reset hitungan waktu duduk"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-2 pr-0.5">
        <AnimatePresence mode="wait">
          {isSessionActive && activeStepIndex !== null ? (
            /* Guided Step-by-Step Mode */
            <motion.div
              key="guided"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col items-center justify-between h-[175px] p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">
                  Langkah {activeStepIndex + 1} dari 4
                </span>
                <span className="text-sm font-mono font-bold text-amber-400">
                  {stepSecondsLeft}s
                </span>
              </div>

              <div className="flex flex-col items-center">
                <span className="text-3xl mb-1">{STRETCH_STEPS[activeStepIndex].icon}</span>
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
                    <span className="text-xl shrink-0 mt-0.5">{step.icon}</span>
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
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Total hanya 1 menit untuk segarkan tubuh!</span>
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
