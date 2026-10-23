import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock as ClockIcon,
  CheckSquare,
  LayoutGrid,
  Timer as TimerIcon,
  HeartPulse,
  Settings as SettingsIcon,
  ChevronUp,
} from 'lucide-react';
import { CompactView } from './CompactView';
import { ClockWidget } from './ClockWidget';
import { TodoWidget } from './TodoWidget';
import { ShortcutsWidget } from './ShortcutsWidget';
import { TimerWidget } from './TimerWidget';
import { HealthWidget } from './HealthWidget';
import { SettingsWidget } from './SettingsWidget';
import { sound } from '../utils/sound';

type ActiveTab = 'clock' | 'todo' | 'shortcuts' | 'timer' | 'health' | 'settings';

export const DynamicIsland: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('clock');
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState('25:00');

  // ================= STRETCH TIMER =================
  const [stretchInterval, setStretchInterval] = useState(() => {
    const val = localStorage.getItem('di_stretch_interval');
    return val ? Number(val) : 45;
  });
  const [stretchSecondsLeft, setStretchSecondsLeft] = useState(() => {
    const val = localStorage.getItem('di_stretch_interval');
    return (val ? Number(val) : 45) * 60;
  });
  const [autoStretchAlert, setAutoStretchAlert] = useState(() => {
    return localStorage.getItem('di_stretch_auto_alert') !== 'false';
  });

  // ================= WATER INTAKE & TIMER =================
  const [waterGlasses, setWaterGlasses] = useState(() => {
    const savedDate = localStorage.getItem('di_water_date');
    const today = new Date().toDateString();
    if (savedDate !== today) {
      localStorage.setItem('di_water_date', today);
      localStorage.setItem('di_water_glasses', '0');
      return 0;
    }
    const val = localStorage.getItem('di_water_glasses');
    return val ? Number(val) : 0;
  });
  const [waterInterval, setWaterInterval] = useState(() => {
    const val = localStorage.getItem('di_water_interval');
    return val ? Number(val) : 60;
  });
  const [waterSecondsLeft, setWaterSecondsLeft] = useState(() => {
    const val = localStorage.getItem('di_water_interval');
    return (val ? Number(val) : 60) * 60;
  });
  const [autoWaterAlert, setAutoWaterAlert] = useState(() => {
    return localStorage.getItem('di_water_auto_alert') !== 'false';
  });

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

  // Automatic stretch countdown timer (every 1 second)
  useEffect(() => {
    if (!autoStretchAlert) return;
    const stretchTimer = setInterval(() => {
      setStretchSecondsLeft((prev) => {
        if (prev <= 1) {
          sound.playSuccess();
          setIsExpanded(true);
          setActiveTab('health');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(stretchTimer);
  }, [autoStretchAlert]);

  // Automatic water countdown timer (every 1 second)
  useEffect(() => {
    if (!autoWaterAlert) return;
    const waterTimer = setInterval(() => {
      setWaterSecondsLeft((prev) => {
        if (prev <= 1) {
          sound.playWaterDrop();
          setIsExpanded(true);
          setActiveTab('health');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(waterTimer);
  }, [autoWaterAlert]);

  // Stretch Handlers
  const handleResetStretch = () => {
    sound.playSuccess();
    setStretchSecondsLeft(stretchInterval * 60);
  };

  const handleSnoozeStretch = (minutes: number) => {
    sound.playClick();
    setStretchSecondsLeft(minutes * 60);
  };

  const handleStretchIntervalChange = (mins: number) => {
    setStretchInterval(mins);
    setStretchSecondsLeft(mins * 60);
    localStorage.setItem('di_stretch_interval', String(mins));
  };

  const handleToggleAutoStretchAlert = () => {
    const nextVal = !autoStretchAlert;
    setAutoStretchAlert(nextVal);
    localStorage.setItem('di_stretch_auto_alert', String(nextVal));
  };

  // Water Handlers
  const handleAddWaterGlass = () => {
    setWaterGlasses((prev) => {
      const next = Math.min(16, prev + 1);
      localStorage.setItem('di_water_glasses', String(next));
      localStorage.setItem('di_water_date', new Date().toDateString());
      return next;
    });
  };

  const handleRemoveWaterGlass = () => {
    setWaterGlasses((prev) => {
      const next = Math.max(0, prev - 1);
      localStorage.setItem('di_water_glasses', String(next));
      return next;
    });
  };

  const handleResetWater = () => {
    setWaterGlasses(0);
    localStorage.setItem('di_water_glasses', '0');
  };

  const handleResetWaterTimer = () => {
    setWaterSecondsLeft(waterInterval * 60);
  };

  const handleSnoozeWaterTimer = (mins: number) => {
    sound.playClick();
    setWaterSecondsLeft(mins * 60);
  };

  const handleWaterIntervalChange = (mins: number) => {
    setWaterInterval(mins);
    setWaterSecondsLeft(mins * 60);
    localStorage.setItem('di_water_interval', String(mins));
  };

  const handleToggleAutoWaterAlert = () => {
    const nextVal = !autoWaterAlert;
    setAutoWaterAlert(nextVal);
    localStorage.setItem('di_water_auto_alert', String(nextVal));
  };

  // Preferences
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

  const isStretchAlert = stretchSecondsLeft === 0;
  const isWaterAlert = waterSecondsLeft === 0;

  const tabs = [
    { id: 'clock', label: 'Waktu', icon: ClockIcon },
    { id: 'todo', label: 'Tugas', icon: CheckSquare, badge: activeTasksCount },
    { id: 'shortcuts', label: 'Pintasan', icon: LayoutGrid },
    { id: 'timer', label: 'Timer', icon: TimerIcon, activeIndicator: timerActive },
    { id: 'health', label: 'Sehat', icon: HeartPulse, activeIndicator: isStretchAlert || isWaterAlert },
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
          width: isExpanded ? 510 : 220,
          height: isExpanded ? 295 : 36,
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
                isStretchAlert={isStretchAlert}
                isWaterAlert={isWaterAlert}
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
              {/* Top Navigation Bar with Symmetrical Padding */}
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/60">
                <div className="flex items-center space-x-0.5">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabSelect(tab.id as ActiveTab)}
                        className={`relative inline-flex items-center justify-center px-2.5 py-1 rounded-full transition-colors select-none ${
                          isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="active-tab-bubble"
                            className="absolute inset-0 bg-zinc-800 rounded-full border border-zinc-700/60 shadow-sm"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center justify-center gap-1.5 leading-none">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-medium text-[11px] leading-none pt-0.5">
                            {tab.label}
                          </span>
                          {tab.badge !== undefined && tab.badge > 0 && (
                            <span className="px-1 py-0.2 rounded-full bg-sky-500 text-[9px] font-mono font-bold text-black">
                              {tab.badge}
                            </span>
                          )}
                          {tab.activeIndicator && (
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
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
                  {activeTab === 'health' && (
                    <HealthWidget
                      key="health"
                      stretchSecondsLeft={stretchSecondsLeft}
                      totalStretchInterval={stretchInterval}
                      onResetStretch={handleResetStretch}
                      onSnoozeStretch={handleSnoozeStretch}
                      onStretchIntervalChange={handleStretchIntervalChange}
                      autoStretchAlert={autoStretchAlert}
                      onToggleAutoStretchAlert={handleToggleAutoStretchAlert}
                      waterGlasses={waterGlasses}
                      onAddWaterGlass={handleAddWaterGlass}
                      onRemoveWaterGlass={handleRemoveWaterGlass}
                      onResetWater={handleResetWater}
                      waterSecondsLeft={waterSecondsLeft}
                      totalWaterInterval={waterInterval}
                      onResetWaterTimer={handleResetWaterTimer}
                      onSnoozeWaterTimer={handleSnoozeWaterTimer}
                      onWaterIntervalChange={handleWaterIntervalChange}
                      autoWaterAlert={autoWaterAlert}
                      onToggleAutoWaterAlert={handleToggleAutoWaterAlert}
                      initialTab={isWaterAlert ? 'water' : 'stretch'}
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
