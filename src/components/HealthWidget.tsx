import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw,
  Play,
  Flame,
  Bell,
  AlertCircle,
  Droplets,
  Plus,
  Minus,
  HeartPulse,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/sound';

interface StretchStep {
  id: number;
  title: string;
  target: string;
  instruction: string;
  duration: number;
  icon: string;
  badge: string;
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
  },
  {
    id: 2,
    title: 'Puntir Tulang Belakang',
    target: 'Pinggang & Punggung',
    instruction: 'Duduk tegak, putar badan ke samping sambil pegang sandaran kursi.',
    duration: 15,
    icon: '🧘‍♀️',
    badge: '15 Detik',
  },
  {
    id: 3,
    title: 'Regang Gelang Tangan',
    target: 'Jari & Pergelangan',
    instruction: 'Luruskan lengan ke depan, tarik jemari ke belakang menghadap dada.',
    duration: 15,
    icon: '🤲',
    badge: '15 Detik',
  },
  {
    id: 4,
    title: 'Berdiri & Jinjit 10x',
    target: 'Kaki & Sirkulasi Darah',
    instruction: 'Berdiri dari kursi, jinjit naik-turun perlahan untuk pompa aliran darah.',
    duration: 15,
    icon: '🦵',
    badge: '15 Detik',
  },
];

interface HealthWidgetProps {
  // Stretch props
  stretchSecondsLeft: number;
  totalStretchInterval: number;
  onResetStretch: () => void;
  onSnoozeStretch: (mins: number) => void;
  onStretchIntervalChange: (mins: number) => void;
  autoStretchAlert: boolean;
  onToggleAutoStretchAlert: () => void;

  // Water props
  waterGlasses: number;
  onAddWaterGlass: () => void;
  onRemoveWaterGlass: () => void;
  onResetWater: () => void;
  waterSecondsLeft: number;
  totalWaterInterval: number;
  onResetWaterTimer: () => void;
  onSnoozeWaterTimer: (mins: number) => void;
  onWaterIntervalChange: (mins: number) => void;
  autoWaterAlert: boolean;
  onToggleAutoWaterAlert: () => void;
  initialTab?: 'stretch' | 'water';
}

export const HealthWidget: React.FC<HealthWidgetProps> = ({
  stretchSecondsLeft,
  totalStretchInterval,
  onResetStretch,
  onSnoozeStretch,
  onStretchIntervalChange,
  autoStretchAlert,
  onToggleAutoStretchAlert,

  waterGlasses,
  onAddWaterGlass,
  onRemoveWaterGlass,
  onResetWater,
  waterSecondsLeft,
  totalWaterInterval,
  onResetWaterTimer,
  onSnoozeWaterTimer,
  onWaterIntervalChange,
  autoWaterAlert,
  onToggleAutoWaterAlert,
  initialTab = 'stretch',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'stretch' | 'water'>(initialTab);

  // Guided stretch states
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [stepSecondsLeft, setStepSecondsLeft] = useState(15);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Guided stretch timer
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
              setIsSessionActive(false);
              setActiveStepIndex(null);
              onResetStretch();
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
  }, [isSessionActive, activeStepIndex, onResetStretch]);

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

  // Stretch formatting
  const stretchMins = Math.floor(stretchSecondsLeft / 60).toString().padStart(2, '0');
  const stretchSecs = (stretchSecondsLeft % 60).toString().padStart(2, '0');
  const isStretchTimeUp = stretchSecondsLeft === 0;
  const totalStretchSecs = totalStretchInterval * 60;
  const stretchProgressPercent = totalStretchSecs > 0
    ? Math.min(100, Math.max(0, ((totalStretchSecs - stretchSecondsLeft) / totalStretchSecs) * 100))
    : 100;

  // Water formatting
  const waterMins = Math.floor(waterSecondsLeft / 60).toString().padStart(2, '0');
  const waterSecs = (waterSecondsLeft % 60).toString().padStart(2, '0');
  const isWaterTimeUp = waterSecondsLeft === 0;
  const totalWaterSecs = totalWaterInterval * 60;
  const waterProgressPercent = totalWaterSecs > 0
    ? Math.min(100, Math.max(0, ((totalWaterSecs - waterSecondsLeft) / totalWaterSecs) * 100))
    : 100;

  const waterTotalMl = waterGlasses * 250;
  const waterGoalPercent = Math.min(100, (waterGlasses / 8) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full select-none"
    >
      {/* Top Segmented Sub-Tab Switcher */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-0.5">
          <button
            onClick={() => {
              sound.playClick();
              setActiveSubTab('stretch');
            }}
            className={`relative flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
              activeSubTab === 'stretch' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {activeSubTab === 'stretch' && (
              <motion.div
                layoutId="active-health-tab"
                className="absolute inset-0 bg-zinc-800 rounded-full border border-zinc-700/60 shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center space-x-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-medium text-[11px]">Peregangan</span>
              {isStretchTimeUp && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />}
            </span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setActiveSubTab('water');
            }}
            className={`relative flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
              activeSubTab === 'water' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {activeSubTab === 'water' && (
              <motion.div
                layoutId="active-health-tab"
                className="absolute inset-0 bg-zinc-800 rounded-full border border-zinc-700/60 shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center space-x-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-medium text-[11px]">Minum Air</span>
              {isWaterTimeUp && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />}
            </span>
          </button>
        </div>

        {/* Current Active Timer Counter badge */}
        <div className="flex items-center space-x-1.5 text-xs">
          {activeSubTab === 'stretch' ? (
            <span className="text-[11px] font-mono text-zinc-300">
              {isStretchTimeUp ? (
                <span className="text-rose-400 font-bold animate-pulse">Waktunya Regang!</span>
              ) : (
                `⏳ ${stretchMins}:${stretchSecs}`
              )}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-zinc-300">
              {isWaterTimeUp ? (
                <span className="text-sky-400 font-bold animate-pulse">Waktunya Minum!</span>
              ) : (
                `💧 ${waterMins}:${waterSecs}`
              )}
            </span>
          )}
        </div>
      </div>

      {/* Main Content View */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-2 pr-0.5">
        <AnimatePresence mode="wait">
          {activeSubTab === 'stretch' ? (
            /* ================= PEREGANGAN VIEW ================= */
            <motion.div
              key="stretch-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col space-y-1.5"
            >
              {/* Presets & Controls */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-zinc-400">Interval:</span>
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
                    {[20, 30, 45, 60].map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          sound.playClick();
                          onStretchIntervalChange(m);
                        }}
                        className={`px-1.5 py-0.5 rounded-md font-mono transition-all ${
                          totalStretchInterval === m
                            ? 'bg-zinc-700 text-white font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      sound.playClick();
                      onToggleAutoStretchAlert();
                    }}
                    className={`p-1 rounded-lg border text-xs transition-colors ${
                      autoStretchAlert
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    }`}
                    title={autoStretchAlert ? 'Auto-Alert Regang Aktif' : 'Auto-Alert Nonaktif'}
                  >
                    <Bell className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      sound.playSuccess();
                      onResetStretch();
                    }}
                    className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                    title="Reset Timer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${
                    isStretchTimeUp ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-500 to-rose-400'
                  }`}
                  style={{ width: `${stretchProgressPercent}%` }}
                />
              </div>

              {/* Overdue alert if time is up */}
              {isStretchTimeUp && !isSessionActive && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="font-medium text-[11px]">Sudah {totalStretchInterval} menit duduk! Regangkan badan.</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => onSnoozeStretch(5)}
                      className="px-2 py-0.5 rounded-lg bg-zinc-900/80 text-[10px] text-zinc-300 font-mono"
                    >
                      Tunda 5m
                    </button>
                    <button
                      onClick={startGuidedSession}
                      className="px-2 py-0.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-black font-semibold text-[10px]"
                    >
                      Mulai
                    </button>
                  </div>
                </div>
              )}

              {/* Guided Step or 4-Step Infographic */}
              {isSessionActive && activeStepIndex !== null ? (
                <div className="flex flex-col items-center justify-between h-[155px] p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-center">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">
                      Langkah {activeStepIndex + 1} dari 4 ({STRETCH_STEPS[activeStepIndex].target})
                    </span>
                    <span className="text-sm font-mono font-bold text-amber-400">
                      {stepSecondsLeft}s
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-2xl mb-1">{STRETCH_STEPS[activeStepIndex].icon}</span>
                    <h4 className="text-xs font-semibold text-white">
                      {STRETCH_STEPS[activeStepIndex].title}
                    </h4>
                    <p className="text-[11px] text-zinc-300 mt-0.5 max-w-[340px]">
                      {STRETCH_STEPS[activeStepIndex].instruction}
                    </p>
                  </div>
                  <button
                    onClick={cancelSession}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                  >
                    Hentikan Sesi
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STRETCH_STEPS.map((step) => (
                      <div
                        key={step.id}
                        className="flex items-start space-x-2 p-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80"
                      >
                        <span className="text-lg shrink-0 mt-0.5">{step.icon}</span>
                        <div className="flex flex-col overflow-hidden">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-zinc-100 truncate">
                              {step.title}
                            </span>
                            <span className="text-[9px] font-mono text-zinc-400 shrink-0 ml-1">
                              {step.badge}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-400 line-clamp-1 leading-tight">
                            {step.instruction}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>1 menit untuk hilangkan rasa pegal</span>
                    </div>
                    <button
                      onClick={startGuidedSession}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-semibold text-xs shadow-md transition-all active:scale-95"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Mulai 1 Menit</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            /* ================= MINUM AIR PUTIH VIEW ================= */
            <motion.div
              key="water-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col space-y-2"
            >
              {/* Water Timer Bar & Presets */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-zinc-400">Ingatkan Tiap:</span>
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
                    {[30, 45, 60, 90].map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          sound.playClick();
                          onWaterIntervalChange(m);
                        }}
                        className={`px-1.5 py-0.5 rounded-md font-mono transition-all ${
                          totalWaterInterval === m
                            ? 'bg-sky-500 text-black font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      sound.playClick();
                      onToggleAutoWaterAlert();
                    }}
                    className={`p-1 rounded-lg border text-xs transition-colors ${
                      autoWaterAlert
                        ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    }`}
                    title={autoWaterAlert ? 'Auto-Alert Minum Aktif' : 'Auto-Alert Nonaktif'}
                  >
                    <Bell className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      sound.playSuccess();
                      onResetWaterTimer();
                    }}
                    className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                    title="Reset Timer Minum"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Progress bar to next water break */}
              <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${
                    isWaterTimeUp ? 'bg-sky-400 animate-pulse' : 'bg-gradient-to-r from-sky-500 to-cyan-400'
                  }`}
                  style={{ width: `${waterProgressPercent}%` }}
                />
              </div>

              {/* Overdue alert if water time is up */}
              {isWaterTimeUp && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <Droplets className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="font-medium text-[11px]">Waktunya hidrasi tubuh! Minum 1 gelas air.</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => onSnoozeWaterTimer(10)}
                      className="px-2 py-0.5 rounded-lg bg-zinc-900/80 text-[10px] text-zinc-300 font-mono"
                    >
                      Tunda 10m
                    </button>
                    <button
                      onClick={() => {
                        sound.playWaterDrop();
                        onAddWaterGlass();
                        onResetWaterTimer();
                      }}
                      className="px-2.5 py-0.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-semibold text-[10px]"
                    >
                      + Minum Sekarang
                    </button>
                  </div>
                </div>
              )}

              {/* 8 Glasses Interactive Tracker Box */}
              <div className="flex flex-col p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-zinc-200 font-semibold">Target Harian:</span>
                    <span className="font-mono text-sky-400 font-bold">{waterGlasses} / 8 Gelas</span>
                    <span className="text-[10px] text-zinc-400 font-mono">({waterTotalMl} / 2.000 ml)</span>
                  </div>

                  <button
                    onClick={() => {
                      sound.playPop();
                      onResetWater();
                    }}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 underline"
                  >
                    Reset Hari Ini
                  </button>
                </div>

                {/* Daily Goal Visual Progress Bar */}
                <div className="w-full h-1 bg-zinc-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${waterGoalPercent}%` }}
                  />
                </div>

                {/* 8 Interactive Glass Icons */}
                <div className="grid grid-cols-8 gap-1.5 py-1">
                  {Array.from({ length: 8 }).map((_, idx) => {
                    const isFilled = idx < waterGlasses;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          if (isFilled && idx === waterGlasses - 1) {
                            sound.playPop();
                            onRemoveWaterGlass();
                          } else {
                            sound.playWaterDrop();
                            onAddWaterGlass();
                            onResetWaterTimer();
                          }
                        }}
                        className={`flex flex-col items-center justify-center py-1.5 rounded-xl border transition-all ${
                          isFilled
                            ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 shadow-sm scale-105'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                        }`}
                        title={`Gelas ke-${idx + 1} (250ml)`}
                      >
                        <Droplets className={`w-4 h-4 ${isFilled ? 'fill-sky-400 text-sky-400' : ''}`} />
                        <span className="text-[9px] font-mono mt-0.5">{idx + 1}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Add / Minus Action Footer */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        sound.playPop();
                        onRemoveWaterGlass();
                      }}
                      disabled={waterGlasses === 0}
                      className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 transition-colors"
                      title="Kurangi 1 gelas"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-[11px] text-zinc-400 font-mono px-1">250ml / gelas</span>
                  </div>

                  <button
                    onClick={() => {
                      sound.playWaterDrop();
                      onAddWaterGlass();
                      onResetWaterTimer();
                      if (waterGlasses + 1 === 8) {
                        sound.playSuccess();
                        try {
                          confetti({ particleCount: 50, spread: 60, origin: { y: 0.2 } });
                        } catch {
                          // fallback
                        }
                      }
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>+ Minum 1 Gelas</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
