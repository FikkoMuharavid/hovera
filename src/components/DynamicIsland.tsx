import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock as ClockIcon,
  CheckSquare,
  LayoutGrid,
  HeartPulse,
  Settings as SettingsIcon,
  ChevronUp,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CompactView } from './CompactView';
import { TimeHubWidget } from './TimeHubWidget';
import { TodoWidget } from './TodoWidget';
import { ShortcutsWidget } from './ShortcutsWidget';
import { HealthWidget } from './HealthWidget';
import { SettingsWidget } from './SettingsWidget';
import { sound } from '../utils/sound';
import { getAnniversaryCalculations } from '../utils/anniversary';

type ActiveTab = 'clock' | 'todo' | 'shortcuts' | 'health' | 'settings';

export const DynamicIsland: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('clock');
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [activeTasksCount, setActiveTasksCount] = useState(() => {
    try {
      const saved = localStorage.getItem('di_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.filter((t: any) => !t.completed).length;
      }
    } catch {
      // fallback
    }
    return 0;
  });

  // ================= FOCUS TIMER =================
  const [timerTotalSeconds, setTimerTotalSeconds] = useState(25 * 60);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning && timerSecondsLeft > 0) {
      interval = setInterval(() => {
        setTimerSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
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
  }, [isTimerRunning, timerSecondsLeft]);

  const timerMins = Math.floor(timerSecondsLeft / 60).toString().padStart(2, '0');
  const timerSecs = (timerSecondsLeft % 60).toString().padStart(2, '0');
  const timerRemaining = `${timerMins}:${timerSecs}`;

  const handleToggleTimer = () => {
    sound.playClick();
    if (timerSecondsLeft === 0) {
      setTimerSecondsLeft(timerTotalSeconds);
      setIsTimerRunning(true);
    } else {
      setIsTimerRunning(!isTimerRunning);
    }
  };

  const handleResetTimer = () => {
    sound.playPop();
    setIsTimerRunning(false);
    setTimerSecondsLeft(timerTotalSeconds);
  };

  const handleSetTimerPreset = (minutes: number) => {
    sound.playClick();
    setIsTimerRunning(false);
    setTimerTotalSeconds(minutes * 60);
    setTimerSecondsLeft(minutes * 60);
  };

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

  // ================= ANNIVERSARY & MENSIVE =================
  const [startYear, setStartYear] = useState(() => {
    const val = localStorage.getItem('di_anniv_year');
    return val ? Number(val) : 2024;
  });
  const [showAlwaysAnniv, setShowAlwaysAnniv] = useState(() => {
    return localStorage.getItem('di_anniv_show_always') === 'true';
  });

  const handleStartYearChange = (year: number) => {
    setStartYear(year);
    localStorage.setItem('di_anniv_year', String(year));
  };

  const handleToggleShowAlwaysAnniv = () => {
    const nextVal = !showAlwaysAnniv;
    setShowAlwaysAnniv(nextVal);
    localStorage.setItem('di_anniv_show_always', String(nextVal));
  };

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

  // Drag Mode & Window Positioning
  const [isDragModeEnabled, setIsDragModeEnabled] = useState<boolean>(() => {
    return localStorage.getItem('di_drag_mode') === 'true';
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isCustomPosition, setIsCustomPosition] = useState<boolean>(false);

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);

  useEffect(() => {
    localStorage.setItem('di_drag_mode', String(isDragModeEnabled));
  }, [isDragModeEnabled]);

  useEffect(() => {
    if (window.electronAPI?.getWindowPosition) {
      window.electronAPI.getWindowPosition().then((pos) => {
        if (pos?.isCustom) {
          setIsCustomPosition(true);
        }
      });
    }

    if (window.electronAPI?.onPositionReset) {
      const cleanup = window.electronAPI.onPositionReset(() => {
        setIsCustomPosition(false);
      });
      return cleanup;
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragModeEnabled) return;

    // Jika di expanded view dan user mengklik elemen kontrol interaktif, jangan drag
    const target = e.target as HTMLElement;
    if (isExpanded && target.closest('button, input, textarea, a, select')) {
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // fallback
    }

    pointerStartRef.current = { x: e.screenX, y: e.screenY };
    hasDraggedRef.current = false;
    setIsDragging(true);

    if (window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragModeEnabled || !isDragging || !pointerStartRef.current) return;

    const deltaX = e.screenX - pointerStartRef.current.x;
    const deltaY = e.screenY - pointerStartRef.current.y;

    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      hasDraggedRef.current = true;
      setIsCustomPosition(true);
    }

    if (deltaX !== 0 || deltaY !== 0) {
      if (window.electronAPI?.moveWindow) {
        window.electronAPI.moveWindow(deltaX, deltaY);
      }
      pointerStartRef.current = { x: e.screenX, y: e.screenY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    pointerStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // fallback
    }
  };

  const handleResetPosition = async () => {
    sound.playPop();
    if (window.electronAPI?.resetWindowPosition) {
      await window.electronAPI.resetWindowPosition();
      setIsCustomPosition(false);
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
    if (isDragging) return;
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
    if (isDragModeEnabled && hasDraggedRef.current) {
      return;
    }
    sound.playPop();
    setIsExpanded(!isExpanded);
  };

  const handleTabSelect = (tab: ActiveTab) => {
    sound.playClick();
    setActiveTab(tab);
  };

  const isStretchAlert = stretchSecondsLeft === 0;
  const isWaterAlert = waterSecondsLeft === 0;

  const annivCalc = getAnniversaryCalculations(startYear, 1, 14);
  const showAnnivBadge =
    annivCalc.isAnnivToday ||
    annivCalc.isMensiveToday ||
    (showAlwaysAnniv ? true : annivCalc.isMensiveApproaching);

  const hasWater = isWaterAlert;
  const hasStretch = isStretchAlert;
  const hasTimer = isTimerRunning;
  const hasTasks = activeTasksCount > 0;
  const hasAnniv = annivCalc.isAnnivToday;
  const hasMensive = !annivCalc.isAnnivToday && annivCalc.isMensiveToday;
  const hasApproachingAnniv =
    !annivCalc.isAnnivToday &&
    !annivCalc.isMensiveToday &&
    showAnnivBadge &&
    (annivCalc.isMensiveApproaching || (annivCalc.daysUntilMensive !== undefined && annivCalc.daysUntilMensive <= 3));

  const notificationCount =
    (hasWater ? 1 : 0) +
    (hasStretch ? 1 : 0) +
    (hasTimer ? 1 : 0) +
    (hasTasks ? 1 : 0) +
    (hasAnniv || hasMensive || hasApproachingAnniv ? 1 : 0);

  const compactWidth = (() => {
    if (notificationCount >= 3) return 310;
    if (notificationCount === 2) return 275;
    if (hasWater || hasStretch) return 240;
    if (hasAnniv || hasMensive || hasApproachingAnniv) return 235;
    if (hasTimer) return 230;
    if (hasTasks) return 215;
    return 168; // Symmetrically centered when no reminders active
  })();

  const tabs = [
    {
      id: 'clock',
      label: 'Waktu',
      icon: ClockIcon,
      activeIndicator:
        isTimerRunning ||
        annivCalc.isAnnivToday ||
        annivCalc.isMensiveToday ||
        annivCalc.isMensiveApproaching,
    },
    { id: 'todo', label: 'Tugas', icon: CheckSquare, badge: activeTasksCount },
    { id: 'shortcuts', label: 'Pintasan', icon: LayoutGrid },
    {
      id: 'health',
      label: 'Sehat',
      icon: HeartPulse,
      activeIndicator: isStretchAlert || isWaterAlert,
    },
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        animate={{
          width: isExpanded ? 510 : compactWidth,
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
        className={`relative overflow-hidden bg-black text-white border border-white/15 select-none ${
          isDragModeEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        }`}
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
                timerActive={isTimerRunning}
                timerRemaining={timerRemaining}
                isStretchAlert={isStretchAlert}
                isWaterAlert={isWaterAlert}
                isAnnivToday={annivCalc.isAnnivToday}
                isMensiveToday={annivCalc.isMensiveToday}
                isMensiveApproaching={annivCalc.isMensiveApproaching}
                daysUntilMensive={annivCalc.daysUntilMensive}
                showAnnivBadge={showAnnivBadge}
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
              {/* Top Navigation Bar with 5 Clean Tabs */}
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/60">
                <div className="flex items-center space-x-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabSelect(tab.id as ActiveTab)}
                        className={`relative inline-flex items-center justify-center px-3 py-1 rounded-full transition-colors select-none ${
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
                  {activeTab === 'clock' && (
                    <TimeHubWidget
                      key="time-hub"
                      totalSeconds={timerTotalSeconds}
                      secondsLeft={timerSecondsLeft}
                      isTimerRunning={isTimerRunning}
                      onToggleTimer={handleToggleTimer}
                      onResetTimer={handleResetTimer}
                      onSetPreset={handleSetTimerPreset}
                      formattedTimerTime={timerRemaining}
                      startYear={startYear}
                      onStartYearChange={handleStartYearChange}
                      showAlwaysInCompact={showAlwaysAnniv}
                      onToggleShowAlways={handleToggleShowAlwaysAnniv}
                    />
                  )}
                  {activeTab === 'todo' && (
                    <TodoWidget key="todo" onTasksUpdate={setActiveTasksCount} />
                  )}
                  {activeTab === 'shortcuts' && <ShortcutsWidget key="shortcuts" />}
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
                      isDragMode={isDragModeEnabled}
                      onToggleDragMode={setIsDragModeEnabled}
                      onResetPosition={handleResetPosition}
                      isCustomPosition={isCustomPosition}
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
