import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Clock, Timer as TimerIcon, Heart } from 'lucide-react';
import { ClockWidget } from './ClockWidget';
import { TimerWidget } from './TimerWidget';
import { AnniversaryWidget } from './AnniversaryWidget';
import { getAnniversaryCalculations } from '../utils/anniversary';
import { sound } from '../utils/sound';

export type TimeSubTab = 'clock' | 'timer' | 'anniv';

interface TimeHubWidgetProps {
  initialSubTab?: TimeSubTab;
  // Timer props
  totalSeconds: number;
  secondsLeft: number;
  isTimerRunning: boolean;
  onToggleTimer: () => void;
  onResetTimer: () => void;
  onSetPreset: (minutes: number) => void;
  formattedTimerTime: string;

  // Anniversary props
  startYear: number;
  onStartYearChange: (year: number) => void;
  showAlwaysInCompact: boolean;
  onToggleShowAlways: () => void;
}

export const TimeHubWidget: React.FC<TimeHubWidgetProps> = ({
  initialSubTab = 'clock',
  totalSeconds,
  secondsLeft,
  isTimerRunning,
  onToggleTimer,
  onResetTimer,
  onSetPreset,
  formattedTimerTime,
  startYear,
  onStartYearChange,
  showAlwaysInCompact,
  onToggleShowAlways,
}) => {
  const [subTab, setSubTab] = useState<TimeSubTab>(initialSubTab);

  const annivCalc = getAnniversaryCalculations(startYear, 1, 14);

  const handleSubTabChange = (tab: TimeSubTab) => {
    sound.playClick();
    setSubTab(tab);
  };

  return (
    <div className="flex flex-col h-full w-full justify-between select-none">
      {/* Sub-tab segmented pill switcher */}
      <div className="flex items-center justify-center pb-1.5">
        <div className="inline-flex items-center p-0.5 rounded-full bg-zinc-900 border border-zinc-800/90 shadow-sm">
          <button
            onClick={() => handleSubTabChange('clock')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
              subTab === 'clock'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Jam & Tgl</span>
          </button>

          <button
            onClick={() => handleSubTabChange('timer')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
              subTab === 'timer'
                ? 'bg-zinc-800 text-amber-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TimerIcon className="w-3.5 h-3.5 text-amber-400" />
            <span>Timer</span>
            {isTimerRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => handleSubTabChange('anniv')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
              subTab === 'anniv'
                ? 'bg-zinc-800 text-pink-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Heart className="w-3.5 h-3.5 fill-current text-pink-400" />
            <span>Anniv & Mensive</span>
            {(annivCalc.isAnnivToday ||
              annivCalc.isMensiveToday ||
              annivCalc.isMensiveApproaching) && (
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Content Area - Hanya satu yang tampil pada satu waktu */}
      <div className="flex-1 overflow-hidden pt-0.5">
        <AnimatePresence mode="wait">
          {subTab === 'clock' && (
            <ClockWidget
              key="clock"
              onNavigateToAnniv={() => handleSubTabChange('anniv')}
              startYear={startYear}
            />
          )}

          {subTab === 'timer' && (
            <TimerWidget
              key="timer"
              totalSeconds={totalSeconds}
              secondsLeft={secondsLeft}
              isRunning={isTimerRunning}
              onToggleRun={onToggleTimer}
              onReset={onResetTimer}
              onSetPreset={onSetPreset}
              formattedTime={formattedTimerTime}
            />
          )}

          {subTab === 'anniv' && (
            <AnniversaryWidget
              key="anniv"
              startYear={startYear}
              onStartYearChange={onStartYearChange}
              showAlwaysInCompact={showAlwaysInCompact}
              onToggleShowAlways={onToggleShowAlways}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
