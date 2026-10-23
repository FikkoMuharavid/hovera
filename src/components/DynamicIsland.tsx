import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock as ClockIcon,
  CheckSquare,
  LayoutGrid,
  Timer as TimerIcon,
  Settings as SettingsIcon,
  ChevronUp,
} from 'lucide-react';
import { CompactView } from './CompactView';
import { ClockWidget } from './ClockWidget';
import { TodoWidget } from './TodoWidget';
import { ShortcutsWidget } from './ShortcutsWidget';
import { TimerWidget } from './TimerWidget';
import { SettingsWidget } from './SettingsWidget';
import { sound } from '../utils/sound';

type ActiveTab = 'clock' | 'todo' | 'shortcuts' | 'timer' | 'settings';

export const DynamicIsland: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('clock');
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState('25:00');

  // Preferences
  const [expandOnHover, setExpandOnHover] = useState(() => {
    return localStorage.getItem('di_expand_hover') === 'true';
  });
  const [yOffset, setYOffset] = useState(() => {
    const val = localStorage.getItem('di_y_offset');
    return val ? Number(val) : 6;
  });

  const islandRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update clock & date string every second
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(
        `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
      );
      const formatted = new Intl.DateTimeFormat('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(d);
      setCurrentDate(formatted);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Save preferences
  useEffect(() => {
    localStorage.setItem('di_expand_hover', String(expandOnHover));
  }, [expandOnHover]);

  const handleYOffsetChange = (val: number) => {
    setYOffset(val);
    localStorage.setItem('di_y_offset', String(val));
    if (window.electronAPI) {
      window.electronAPI.adjustYOffset(val);
    }
  };

  // Mouse Enter/Leave Handling for Window Click-Through
  const handleMouseEnter = () => {
    if (window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
    if (expandOnHover && !isExpanded) {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        sound.playPop();
        setIsExpanded(true);
      }, 120);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    if (expandOnHover && isExpanded) {
      sound.playPop();
      setIsExpanded(false);
    }

    if (window.electronAPI) {
      // When cursor leaves the island container, pass-through all clicks
      window.electronAPI.setIgnoreMouseEvents(true);
    }
  };

  const toggleExpand = () => {
    sound.playPop();
    setIsExpanded(!isExpanded);
  };

  const handleTabSelect = (tab: ActiveTab) => {
    sound.playClick();
    setActiveTab(tab);
  };

  const tabs = [
    { id: 'clock', label: 'Waktu', icon: ClockIcon },
    { id: 'todo', label: 'Tugas', icon: CheckSquare, badge: activeTasksCount },
    { id: 'shortcuts', label: 'Pintasan', icon: LayoutGrid },
    { id: 'timer', label: 'Timer', icon: TimerIcon, activeIndicator: timerActive },
    { id: 'settings', label: 'Setelan', icon: SettingsIcon },
  ];

  return (
    <div
      className="relative flex flex-col items-center select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        ref={islandRef}
        animate={{
          width: isExpanded ? 500 : 220,
          height: isExpanded ? 285 : 36,
          borderRadius: isExpanded ? 32 : 18,
        }}
        transition={{
          type: 'spring',
          stiffness: 380,
          damping: 30,
          mass: 0.8,
        }}
        style={{
          boxShadow: isExpanded
            ? '0 10px 30px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.18)'
            : '0 4px 14px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
        }}
        className="relative overflow-hidden bg-black text-white border border-white/15 cursor-default select-none"
      >
        <AnimatePresence>
          {!isExpanded && (
            <motion.div
              key="compact"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, delay: 0.06 }}
              className="w-full h-full flex items-center justify-center"
            >
              <CompactView
                currentTime={currentTime}
                currentDate={currentDate}
                activeTasksCount={activeTasksCount}
                timerActive={timerActive}
                timerRemaining={timerRemaining}
                onClick={toggleExpand}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 p-4 flex flex-col justify-between"
            >
              {/* Top Navigation Bar */}
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/60">
                <div className="flex items-center space-x-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabSelect(tab.id as ActiveTab)}
                        className={`relative flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
                          isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="active-tab-bubble"
                            className="absolute inset-0 bg-zinc-800 rounded-full border border-zinc-700/60"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center space-x-1">
                          <Icon className="w-3.5 h-3.5" />
                          <span className="font-medium text-[11px]">{tab.label}</span>
                          {tab.badge !== undefined && tab.badge > 0 && (
                            <span className="px-1 py-0.2 rounded-full bg-sky-500 text-[9px] font-mono font-bold text-black">
                              {tab.badge}
                            </span>
                          )}
                          {tab.activeIndicator && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Collapse button */}
                <button
                  onClick={toggleExpand}
                  className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
                  title="Tutup Kapsul"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 overflow-hidden pt-2">
                <AnimatePresence mode="wait">
                  {activeTab === 'clock' && <ClockWidget key="clock" />}
                  {activeTab === 'todo' && (
                    <TodoWidget key="todo" onTasksUpdate={setActiveTasksCount} />
                  )}
                  {activeTab === 'shortcuts' && <ShortcutsWidget key="shortcuts" />}
                  {activeTab === 'timer' && (
                    <TimerWidget
                      key="timer"
                      onTimerStateChange={(active, remaining) => {
                        setTimerActive(active);
                        setTimerRemaining(remaining);
                      }}
                    />
                  )}
                  {activeTab === 'settings' && (
                    <SettingsWidget
                      key="settings"
                      expandOnHover={expandOnHover}
                      onToggleExpandOnHover={setExpandOnHover}
                      yOffset={yOffset}
                      onYOffsetChange={handleYOffsetChange}
                    />
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
