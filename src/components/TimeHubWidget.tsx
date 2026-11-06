import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Clock, Timer as TimerIcon, Heart, Hourglass } from 'lucide-react';
import { ClockWidget } from './ClockWidget';
import { TimerWidget } from './TimerWidget';
import { StopwatchWidget, type LapRecord } from './StopwatchWidget';
import { AnniversaryWidget } from './AnniversaryWidget';
import { getAnniversaryCalculations } from '../utils/anniversary';
import { sound } from '../utils/sound';

export type TimeSubTab = 'clock' | 'timer' | 'stopwatch' | 'anniv';

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

  // Stopwatch props
  stopwatchMs: number;
  isStopwatchRunning: boolean;
  stopwatchLaps: LapRecord[];
  onToggleStopwatch: () => void;
  onResetStopwatch: () => void;
  onLapStopwatch: () => void;

  // Anniversary props
  annivEnabled?: boolean;
  onToggleAnnivEnabled?: (val?: boolean) => void;
  startYear?: number;
  startMonth?: number;
  startDay?: number;
  onAnnivDateChange?: (day: number, month: number, year: number) => void;
  showAlwaysInCompact?: boolean;
  onToggleShowAlways?: () => void;
}

export const TimeHubWidget = React.memo<TimeHubWidgetProps>(({
  initialSubTab = 'clock',
  totalSeconds,
  secondsLeft,
  isTimerRunning,
  onToggleTimer,
  onResetTimer,
  onSetPreset,
  formattedTimerTime,
  stopwatchMs,
  isStopwatchRunning,
  stopwatchLaps,
  onToggleStopwatch,
  onResetStopwatch,
  onLapStopwatch,
  annivEnabled = false,
  onToggleAnnivEnabled,
  startYear = 2024,
  startMonth = 1,
  startDay = 14,
  onAnnivDateChange,
  showAlwaysInCompact = false,
  onToggleShowAlways,
}) => {
  const [subTab, setSubTab] = useState<TimeSubTab>(initialSubTab);

  const annivCalc = getAnniversaryCalculations(startYear, startMonth, startDay);

  const handleSubTabChange = (tab: TimeSubTab) => {
    sound.playClick();
    setSubTab(tab);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full select-none">
      {/* Sub-tab segmented pill switcher */}
      <div className="flex items-center justify-center pb-1.5 shrink-0">
        <div className="inline-flex items-center p-0.5 rounded-full bg-zinc-900 border border-zinc-800/90 shadow-sm">
          <button
            onClick={() => handleSubTabChange('clock')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all ${
              subTab === 'clock'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Jam</span>
          </button>

          <button
            onClick={() => handleSubTabChange('timer')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all ${
              subTab === 'timer'
                ? 'bg-zinc-800 text-amber-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TimerIcon className="w-3 h-3 text-amber-400" />
            <span>Timer</span>
            {isTimerRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => handleSubTabChange('stopwatch')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all ${
              subTab === 'stopwatch'
                ? 'bg-zinc-800 text-emerald-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Hourglass className="w-3 h-3 text-emerald-400" />
            <span>Stopwatch</span>
            {isStopwatchRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => handleSubTabChange('anniv')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all ${
              subTab === 'anniv'
                ? 'bg-zinc-800 text-pink-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Heart className="w-3 h-3 fill-current text-pink-400" />
            <span>Anniv</span>
            {annivEnabled &&
              (annivCalc.isAnnivToday ||
                annivCalc.isMensiveToday ||
                annivCalc.isMensiveApproaching) && (
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
              )}
          </button>
        </div>
      </div>

      {/* Content Area - Hanya satu yang tampil pada satu waktu */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-0.5">
        <AnimatePresence mode="wait">
          {subTab === 'clock' && (
            <ClockWidget
              key="clock"
              onNavigateToAnniv={() => handleSubTabChange('anniv')}
              annivEnabled={annivEnabled}
              startYear={startYear}
              startMonth={startMonth}
              startDay={startDay}
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

          {subTab === 'stopwatch' && (
            <StopwatchWidget
              key="stopwatch"
              timeMs={stopwatchMs}
              isRunning={isStopwatchRunning}
              laps={stopwatchLaps}
              onToggleRun={onToggleStopwatch}
              onReset={onResetStopwatch}
              onLap={onLapStopwatch}
            />
          )}

          {subTab === 'anniv' && (
            <AnniversaryWidget
              key="anniv"
              annivEnabled={annivEnabled}
              onToggleAnnivEnabled={onToggleAnnivEnabled}
              startYear={startYear}
              startMonth={startMonth}
              startDay={startDay}
              onDateChange={onAnnivDateChange}
              showAlwaysInCompact={showAlwaysInCompact}
              onToggleShowAlways={onToggleShowAlways}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
