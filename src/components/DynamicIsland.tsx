import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock as ClockIcon,
  CheckSquare,
  FileText,
  LayoutGrid,
  HeartPulse,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Mic2,
  Music,
  DownloadCloud,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CompactView } from './CompactView';
import { TimeHubWidget } from './TimeHubWidget';
import { TodoWidget } from './TodoWidget';
import { NotesWidget, type MeetingNote } from './NotesWidget';
import { ShortcutsWidget } from './ShortcutsWidget';
import { HealthWidget } from './HealthWidget';
import { SettingsWidget } from './SettingsWidget';
import { FileToolsWidget } from './FileToolsWidget';
import { MediaDownloaderWidget } from './MediaDownloaderWidget';
import { sound } from '../utils/sound';
import { getAnniversaryCalculations } from '../utils/anniversary';
import { MeetingAudioRecorder } from '../utils/audioRecorder';
import { fetchLyrics, getActiveLyric, type LyricLine } from '../utils/lyricsService';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { MediaState } from '../types/electron';

type ActiveTab = 'clock' | 'todo' | 'notes' | 'shortcuts' | 'tools' | 'health' | 'settings' | 'downloader';
export type DisplayStyle = 'floating' | 'top-notch';

export const DynamicIsland: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('clock');
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [isDraggingOverCapsule, setIsDraggingOverCapsule] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [droppedNativePaths, setDroppedNativePaths] = useState<string[]>([]);
  const [isEditingNote, setIsEditingNote] = useState(false);

  // Display Style: 'floating' (Dynamic Island Melayang) vs 'top-notch' (Dynamic Notch Menempel Atas)
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>(() => {
    try {
      const saved = localStorage.getItem('di_display_style');
      return saved === 'top-notch' || saved === 'floating' ? saved : 'floating';
    } catch {
      return 'floating';
    }
  });

  // Downloader Widget State
  const [isDownloaderActive, setIsDownloaderActive] = useState(false);
  const [downloaderProgress, setDownloaderProgress] = useState(0);

  // Memoized handlers for child widgets to avoid unneeded renders
  const handleInitialFilesHandled = useCallback(() => {
    setDroppedFiles([]);
    setDroppedNativePaths([]);
  }, []);

  const handleDownloadStatusChange = useCallback((downloading: boolean, progress: number) => {
    setIsDownloaderActive(downloading);
    setDownloaderProgress(progress);
  }, []);

  // Mouse Scroll Navigation for Tabs
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(maxScroll > 0 && (maxScroll - scrollLeft) > 6);
  }, []);

  useEffect(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    updateScrollIndicators();
    const onScroll = () => updateScrollIndicators();
    el.addEventListener('scroll', onScroll, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateScrollIndicators();
      });
      observer.observe(el);
    } else {
      window.addEventListener('resize', updateScrollIndicators);
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', updateScrollIndicators);
    };
  }, [isExpanded, updateScrollIndicators]);

  // Non-passive wheel listener converting deltaY to horizontal scrollLeft
  useEffect(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 0.9;
        updateScrollIndicators();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isExpanded, updateScrollIndicators]);

  // Auto-scroll active tab into view when activeTab or expanded changes without affecting ancestor scrolling
  useEffect(() => {
    if (!isExpanded || !tabsContainerRef.current) return;
    const timer = setTimeout(() => {
      const container = tabsContainerRef.current;
      const activeEl = container?.querySelector(`[data-tab-id="${activeTab}"]`);
      if (container && activeEl instanceof HTMLElement) {
        const containerRect = container.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();
        const targetScrollLeft =
          container.scrollLeft +
          (elRect.left - containerRect.left) -
          container.clientWidth / 2 +
          elRect.width / 2;
        container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
      }
      updateScrollIndicators();
    }, 50);

    const settleTimer = setTimeout(() => {
      updateScrollIndicators();
    }, 350);

    return () => {
      clearTimeout(timer);
      clearTimeout(settleTimer);
    };
  }, [activeTab, isExpanded, updateScrollIndicators]);


  // Media / Audio Visualizer State (Spotify Web, YouTube, etc.)
  const [mediaState, setMediaState] = useState<MediaState>({
    isPlaying: false,
    title: '',
    artist: '',
    sourceApp: '',
    audioPeak: 0,
  });

  const isMediaPlaying = Boolean(mediaState.isPlaying ?? (mediaState as any).is_playing);
  const mediaAudioPeak = Number(mediaState.audioPeak ?? (mediaState as any).audio_peak ?? 0);

  // Persistent Settings Shadow Cache & Debounced Write Queue
  const appSettingsCacheRef = useRef<Record<string, any>>({});
  const isSettingsInitializedRef = useRef<boolean>(false);
  const saveQueueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPersistAppSettings = () => {
    if (saveQueueTimeoutRef.current) {
      clearTimeout(saveQueueTimeoutRef.current);
      saveQueueTimeoutRef.current = null;
    }
    try {
      if (window.electronAPI?.saveAppSettings && Object.keys(appSettingsCacheRef.current).length > 0) {
        window.electronAPI.saveAppSettings({ ...appSettingsCacheRef.current });
      }
    } catch {}
  };

  const persistAppSetting = (partial: Record<string, any>) => {
    Object.assign(appSettingsCacheRef.current, partial);
    if (!window.electronAPI?.saveAppSettings) return;

    if (saveQueueTimeoutRef.current) {
      clearTimeout(saveQueueTimeoutRef.current);
    }
    saveQueueTimeoutRef.current = setTimeout(() => {
      try {
        window.electronAPI?.saveAppSettings?.({ ...appSettingsCacheRef.current });
      } catch {}
    }, 120);
  };

  // Sound preference state synced across app
  const [soundEnabled, setSoundEnabled] = useState(() => sound.enabled);
  const handleToggleSound = useCallback((val?: boolean) => {
    setSoundEnabled((prev) => {
      const nextVal = typeof val === 'boolean' ? val : !prev;
      sound.setEnabled(nextVal);
      if (nextVal) sound.playPop();
      persistAppSetting({ soundEnabled: nextVal });
      return nextVal;
    });
  }, []);

  // Synced Lyrics Options & State
  const [showLyrics, setShowLyrics] = useState(() => {
    try {
      const saved = localStorage.getItem('di_show_lyrics');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleShowLyrics = useCallback((val?: boolean) => {
    setShowLyrics((prev) => {
      const nextVal = typeof val === 'boolean' ? val : !prev;
      sound.playClick();
      try {
        localStorage.setItem('di_show_lyrics', String(nextVal));
      } catch {}
      persistAppSetting({ showLyrics: nextVal });
      return nextVal;
    });
  }, []);

  // Silent auto-update check state
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        if (window.electronAPI?.checkForUpdates) {
          const res = await window.electronAPI.checkForUpdates();
          if (isMounted && res && res.hasUpdate && res.version) {
            setUpdateAvailable(true);
            setUpdateVersion(res.version);
          }
        }
      } catch {
        // silent background check error ignored
      }
    }, 6000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [isFetchingLyrics, setIsFetchingLyrics] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const lastSyncRef = useRef<{ pos: number; time: number }>({ pos: 0, time: 0 });

  // Auto-fetch synced lyrics when track changes with request cancellation & offline resilience
  useEffect(() => {
    if (!mediaState.title) {
      setLyrics((prev) => (prev !== null ? null : prev));
      setIsFetchingLyrics(false);
      return;
    }

    const abortController = new AbortController();
    setIsFetchingLyrics(true);

    fetchLyrics(mediaState.title, mediaState.artist, mediaState.durationSecs, abortController.signal)
      .then((res) => {
        if (!abortController.signal.aborted) {
          setLyrics(res?.lines || null);
          setIsFetchingLyrics(false);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setLyrics(null);
          setIsFetchingLyrics(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [mediaState.title, mediaState.artist, mediaState.durationSecs]);

  // Synchronize playback timeline position from OS
  useEffect(() => {
    if (mediaState.positionSecs !== undefined && mediaState.positionSecs >= 0) {
      lastSyncRef.current = {
        pos: mediaState.positionSecs,
        time: performance.now(),
      };
      setPlaybackTime((curr) => (curr !== mediaState.positionSecs ? mediaState.positionSecs! : curr));
    }
  }, [mediaState.positionSecs, mediaState.title]);

  // Smooth local timeline ticker (200ms) during active playback
  useEffect(() => {
    if (!isMediaPlaying) return;

    if (lastSyncRef.current.time === 0) {
      lastSyncRef.current.time = performance.now();
    }

    const interval = setInterval(() => {
      const baseTime = lastSyncRef.current.time || performance.now();
      const elapsed = (performance.now() - baseTime) / 1000;
      const estimated = Math.max(0, lastSyncRef.current.pos + elapsed);
      setPlaybackTime(estimated);
    }, 200);

    return () => clearInterval(interval);
  }, [isMediaPlaying]);

  // Active lyric line calculation via binary search with latency lookahead compensation (+0.35s)
  const activeLyricData = useMemo(() => {
    if (!lyrics || lyrics.length === 0) {
      return { current: null, next: null, prev: null, index: -1 };
    }
    // +0.35s offset compensates for audio buffer latency and eye-reading reaction time
    return getActiveLyric(lyrics, playbackTime + 0.35);
  }, [lyrics, playbackTime]);

  const currentLyricText = activeLyricData.current?.text || '';

  useEffect(() => {
    const unlisten = window.electronAPI?.onMediaStateChanged?.((state) => {
      setMediaState(state);
    });
    window.electronAPI?.getMediaState?.().then((st) => {
      if (st) setMediaState(st);
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleMediaTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playClick();
    const nextState = !isMediaPlaying;
    setMediaState((prev) => ({
      ...prev,
      isPlaying: nextState,
      is_playing: nextState,
    } as any));
    window.electronAPI?.mediaTogglePlay?.();
  };

  const handleMediaNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playClick();
    window.electronAPI?.mediaNext?.();
  };

  const handleMediaPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playClick();
    window.electronAPI?.mediaPrev?.();
  };

  // User customizable expanded height (drag downward or toggle presets)
  const [expandedHeight, setExpandedHeight] = useState(() => {
    try {
      const saved = localStorage.getItem('di_expanded_height');
      if (saved) {
        const val = Number(saved);
        if (!isNaN(val) && val >= 280 && val <= 620) return val;
      }
    } catch {
      // fallback
    }
    return 430; // Generous comfortable default height!
  });

  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const isResizingHeightRef = useRef(false);
  const hasResizedHeightRef = useRef(false);
  const startResizeYRef = useRef(0);
  const startHeightRef = useRef(430);
  const currentHeightRef = useRef(430);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isResizingHeightRef.current = true;
    hasResizedHeightRef.current = false;
    setIsResizingHeight(true);
    startResizeYRef.current = e.clientY;
    startHeightRef.current = expandedHeight;
    currentHeightRef.current = expandedHeight;
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizingHeightRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const deltaY = e.clientY - startResizeYRef.current;
    if (Math.abs(deltaY) > 3) {
      hasResizedHeightRef.current = true;
    }
    const newHeight = Math.min(620, Math.max(300, Math.round(startHeightRef.current + deltaY)));
    currentHeightRef.current = newHeight;
    setExpandedHeight(newHeight);
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (!isResizingHeightRef.current) return;
    isResizingHeightRef.current = false;
    setIsResizingHeight(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const finalHeight = currentHeightRef.current;
    try {
      localStorage.setItem('di_expanded_height', String(finalHeight));
    } catch {}
    persistAppSetting({ expandedHeight: finalHeight });
    window.electronAPI?.setWindowExpanded?.(true, finalHeight, 558);
  };

  const [activeTasksCount, setActiveTasksCount] = useState(() => {
    try {
      const saved = localStorage.getItem('di_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((t: any) => t && !t.completed).length;
        }
      }
    } catch {
      // fallback
    }
    return 0;
  });

  // ================= FOCUS TIMER =================
  const [timerTotalSeconds, setTimerTotalSeconds] = useState(() => {
    try {
      const saved = localStorage.getItem('di_timer_total_seconds');
      const num = saved ? Number(saved) : 25 * 60;
      return isNaN(num) || num <= 0 ? 25 * 60 : num;
    } catch {
      return 25 * 60;
    }
  });
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(() => {
    try {
      const saved = localStorage.getItem('di_timer_total_seconds');
      const num = saved ? Number(saved) : 25 * 60;
      return isNaN(num) || num <= 0 ? 25 * 60 : num;
    } catch {
      return 25 * 60;
    }
  });
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning) {
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
  }, [isTimerRunning]);

  const timerMins = Math.floor(timerSecondsLeft / 60).toString().padStart(2, '0');
  const timerSecs = (timerSecondsLeft % 60).toString().padStart(2, '0');
  const timerRemaining = `${timerMins}:${timerSecs}`;

  const handleToggleTimer = useCallback(() => {
    sound.playClick();
    setTimerSecondsLeft((prev) => {
      if (prev === 0) {
        setIsTimerRunning(true);
        return timerTotalSeconds;
      }
      setIsTimerRunning((r) => !r);
      return prev;
    });
  }, [timerTotalSeconds]);

  const handleResetTimer = useCallback(() => {
    sound.playPop();
    setIsTimerRunning(false);
    setTimerSecondsLeft(timerTotalSeconds);
  }, [timerTotalSeconds]);

  const handleSetTimerPreset = useCallback((minutes: number) => {
    sound.playClick();
    setIsTimerRunning(false);
    const secs = minutes * 60;
    setTimerTotalSeconds(secs);
    setTimerSecondsLeft(secs);
    try {
      localStorage.setItem('di_timer_total_seconds', String(secs));
    } catch {}
    persistAppSetting({ timerPresetSeconds: secs });
  }, []);

  // ================= STOPWATCH =================
  const [stopwatchMs, setStopwatchMs] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const [stopwatchLaps, setStopwatchLaps] = useState<Array<{ id: number; timeMs: number; splitMs: number }>>([]);
  const stopwatchStartTimeRef = useRef<number>(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (isStopwatchRunning) {
      intervalId = setInterval(() => {
        setStopwatchMs(Date.now() - stopwatchStartTimeRef.current);
      }, 30);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isStopwatchRunning]);

  const handleToggleStopwatch = useCallback(() => {
    sound.playClick();
    setIsStopwatchRunning((running) => {
      if (!running) {
        stopwatchStartTimeRef.current = Date.now() - stopwatchMs;
        return true;
      }
      return false;
    });
  }, [stopwatchMs]);

  const handleResetStopwatch = useCallback(() => {
    sound.playPop();
    setIsStopwatchRunning(false);
    setStopwatchMs(0);
    setStopwatchLaps([]);
  }, []);

  const handleLapStopwatch = useCallback(() => {
    sound.playPop();
    setStopwatchLaps((prev) => {
      const lastLapTotal = prev.length > 0 ? prev[0].timeMs : 0;
      const split = stopwatchMs - lastLapTotal;
      const newLap = {
        id: prev.length + 1,
        timeMs: stopwatchMs,
        splitMs: split > 0 ? split : stopwatchMs,
      };
      return [newLap, ...prev];
    });
  }, [stopwatchMs]);

  const formatStopwatchCompact = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const compactStopwatchFormatted = formatStopwatchCompact(stopwatchMs);

  // ================= NOTES & SPEECH TO TEXT =================
  const [notes, setNotes] = useState<MeetingNote[]>(() => {
    try {
      const saved = localStorage.getItem('di_meeting_notes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [
      {
        id: 'sample-1',
        title: 'Notula Rapat Tim Proyek',
        content:
          'Pembahasan fitur baru Dynamic Island:\n- Integrasi pintasan aplikasi & website kerja favorit.\n- Fitur stopwatch presisi & pengingat fokus Pomodoro.\n- Fitur Speech to Text untuk transkrip rapat offline maupun online secara langsung.\n- Fitur simpan ke catatan dan ekspor ke file teks (.TXT) maupun Markdown (.MD).',
        createdAt: Date.now() - 3600000 * 2,
        updatedAt: Date.now() - 3600000 * 2,
        durationSeconds: 145,
        language: 'id-ID',
      },
    ];
  });

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [speechLanguage, setSpeechLanguage] = useState<'id-ID' | 'en-US'>('id-ID');
  const [speechError, setSpeechError] = useState<string | null>(null);

  const audioRecorderRef = useRef<MeetingAudioRecorder | null>(null);
  const recordingIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [isRecording]);

  const handleStartRecording = useCallback(async () => {
    sound.playClick();
    setSpeechError(null);
    setLiveTranscript('');

    try {
      const recorder = new MeetingAudioRecorder();
      await recorder.start();
      audioRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
    } catch (err: any) {
      console.error('Failed to start audio recording:', err);
      setSpeechError(
        'Tidak dapat mengakses mikrofon. Pastikan izin mikrofon telah diberikan di Windows.'
      );
      setIsRecording(false);
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    sound.playPop();

    const recorder = audioRecorderRef.current;
    if (recorder) {
      recorder.stop();
    }

    setIsRecording(false);
    setIsTranscribing(true);

    let finalTranscript = '';

    if (recorder && window.electronAPI?.transcribeAudio) {
      // Check Voice Activity Detection: Did the user actually speak?
      if (!recorder.hasVoiceActivity()) {
        setIsTranscribing(false);
        audioRecorderRef.current = null;
        setSpeechError('Tidak ada suara/ucapan terdeteksi (suara terlalu hening).');
        return;
      }

      try {
        const samples = recorder.get16kSamples();
        if (samples && samples.length > 4000) {
          const res = await window.electronAPI.transcribeAudio({
            audioSamples: samples,
            language: speechLanguage,
          });
          if (res.success && res.text) {
            finalTranscript = res.text.trim();
            setLiveTranscript(finalTranscript);
          } else if (res.error) {
            console.warn('Transcription error:', res.error);
          }
        }
      } catch (err: any) {
        console.error('Final transcription failed:', err);
      }
    }

    setIsTranscribing(false);
    audioRecorderRef.current = null;

    if (finalTranscript) {
      const newNote: MeetingNote = {
        id: Date.now().toString(),
        title: `Transkrip Rapat ${new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        content: finalTranscript,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        durationSeconds: recordingSeconds,
        language: speechLanguage,
      };
      setNotes((prev) => {
        const updated = [newNote, ...prev];
        try {
          localStorage.setItem('di_meeting_notes', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      sound.playSuccess();
    } else {
      setSpeechError('Tidak ada kata terdeteksi atau rekaman terlalu singkat.');
    }
  }, [recordingSeconds, speechLanguage]);

  const handleClearLiveTranscript = useCallback(() => {
    sound.playPop();
    setLiveTranscript('');
    setRecordingSeconds(0);
  }, []);

  const handleSaveNote = useCallback((note: MeetingNote) => {
    setNotes((prev) => {
      const updated = [note, ...prev];
      try {
        localStorage.setItem('di_meeting_notes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      try {
        localStorage.setItem('di_meeting_notes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleUpdateNote = useCallback((updatedNote: MeetingNote) => {
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === updatedNote.id ? updatedNote : n));
      try {
        localStorage.setItem('di_meeting_notes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // ================= STRETCH TIMER =================
  const [stretchInterval, setStretchInterval] = useState(() => {
    try {
      const val = localStorage.getItem('di_stretch_interval');
      const num = val ? Number(val) : 45;
      return isNaN(num) || num <= 0 ? 45 : num;
    } catch {
      return 45;
    }
  });
  const [stretchSecondsLeft, setStretchSecondsLeft] = useState(() => {
    try {
      const val = localStorage.getItem('di_stretch_interval');
      const num = val ? Number(val) : 45;
      return (isNaN(num) || num <= 0 ? 45 : num) * 60;
    } catch {
      return 45 * 60;
    }
  });
  const [autoStretchAlert, setAutoStretchAlert] = useState(() => {
    try {
      return localStorage.getItem('di_stretch_auto_alert') !== 'false';
    } catch {
      return true;
    }
  });

  // ================= WATER INTAKE & TIMER =================
  const [waterGlasses, setWaterGlasses] = useState(() => {
    try {
      const savedDate = localStorage.getItem('di_water_date');
      const today = new Date().toDateString();
      if (savedDate !== today) {
        localStorage.setItem('di_water_date', today);
        localStorage.setItem('di_water_glasses', '0');
        return 0;
      }
      const val = localStorage.getItem('di_water_glasses');
      const num = val ? Number(val) : 0;
      return isNaN(num) || num < 0 ? 0 : Math.min(16, num);
    } catch {
      return 0;
    }
  });
  const [waterInterval, setWaterInterval] = useState(() => {
    try {
      const val = localStorage.getItem('di_water_interval');
      const num = val ? Number(val) : 60;
      return isNaN(num) || num <= 0 ? 60 : num;
    } catch {
      return 60;
    }
  });
  const [waterSecondsLeft, setWaterSecondsLeft] = useState(() => {
    try {
      const val = localStorage.getItem('di_water_interval');
      const num = val ? Number(val) : 60;
      return (isNaN(num) || num <= 0 ? 60 : num) * 60;
    } catch {
      return 60 * 60;
    }
  });
  const [autoWaterAlert, setAutoWaterAlert] = useState(() => {
    try {
      return localStorage.getItem('di_water_auto_alert') !== 'false';
    } catch {
      return true;
    }
  });

  // ================= ANNIVERSARY & MENSIVE =================
  const [annivEnabled, setAnnivEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('di_anniv_enabled');
      if (saved !== null) return saved === 'true';
      // For existing local user, keep true if data already exists; for new installs, default to false:
      return localStorage.getItem('di_anniv_year') !== null || localStorage.getItem('di_anniv_notes') !== null;
    } catch {
      return false;
    }
  });

  const [startDay, setStartDay] = useState<number>(() => {
    try {
      const val = localStorage.getItem('di_anniv_day');
      const num = val ? Number(val) : 14;
      return isNaN(num) || num < 1 || num > 31 ? 14 : num;
    } catch {
      return 14;
    }
  });

  const [startMonth, setStartMonth] = useState<number>(() => {
    try {
      const val = localStorage.getItem('di_anniv_month');
      const num = val !== null ? Number(val) : 1; // 1 = Februari (0-indexed)
      return isNaN(num) || num < 0 || num > 11 ? 1 : num;
    } catch {
      return 1;
    }
  });

  const [startYear, setStartYear] = useState(() => {
    try {
      const val = localStorage.getItem('di_anniv_year');
      const num = val ? Number(val) : 2024;
      return isNaN(num) || num < 1970 || num > 2100 ? 2024 : num;
    } catch {
      return 2024;
    }
  });

  const [showAlwaysAnniv, setShowAlwaysAnniv] = useState(() => {
    try {
      return localStorage.getItem('di_anniv_show_always') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleAnnivEnabled = useCallback((enabled?: boolean) => {
    setAnnivEnabled((curr) => {
      const nextVal = enabled !== undefined ? enabled : !curr;
      try {
        localStorage.setItem('di_anniv_enabled', String(nextVal));
      } catch {}
      persistAppSetting({ annivEnabled: nextVal });
      return nextVal;
    });
  }, []);

  const handleAnnivDateChange = useCallback((day: number, month: number, year: number) => {
    setStartDay(day);
    setStartMonth(month);
    setStartYear(year);
    try {
      localStorage.setItem('di_anniv_day', String(day));
      localStorage.setItem('di_anniv_month', String(month));
      localStorage.setItem('di_anniv_year', String(year));
    } catch {}
    persistAppSetting({ startDay: day, startMonth: month, startYear: year });
  }, []);

  const handleToggleShowAlwaysAnniv = useCallback(() => {
    setShowAlwaysAnniv((prev) => {
      const nextVal = !prev;
      try {
        localStorage.setItem('di_anniv_show_always', String(nextVal));
      } catch {}
      persistAppSetting({ showAlwaysAnniv: nextVal });
      return nextVal;
    });
  }, []);

  // Preferences: Default to true or loaded from saved preferences
  const [expandOnHover, setExpandOnHover] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('di_expand_hover');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Drag Mode & Window Positioning: persist user preference across app sessions
  const [isDragModeEnabled, setIsDragModeEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('di_drag_mode');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isCustomPosition, setIsCustomPosition] = useState<boolean>(false);

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const dragEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persistent settings from native app settings on mount
  useEffect(() => {
    let isCancelled = false;

    const loadSettings = async () => {
      if (!window.electronAPI?.getAppSettings) {
        isSettingsInitializedRef.current = true;
        return;
      }

      try {
        const settings = await window.electronAPI.getAppSettings();
        if (isCancelled || !settings) {
          isSettingsInitializedRef.current = true;
          return;
        }

        // Cache initial settings
        appSettingsCacheRef.current = { ...settings };

        if (typeof settings.expandOnHover === 'boolean') {
          setExpandOnHover(settings.expandOnHover);
          try {
            localStorage.setItem('di_expand_hover', String(settings.expandOnHover));
          } catch {}
        }
        if (typeof settings.showLyrics === 'boolean') {
          setShowLyrics(settings.showLyrics);
          try {
            localStorage.setItem('di_show_lyrics', String(settings.showLyrics));
          } catch {}
        }
        if (typeof settings.soundEnabled === 'boolean') {
          sound.setEnabled(settings.soundEnabled);
          setSoundEnabled(settings.soundEnabled);
        }
        if (typeof settings.stretchInterval === 'number' && settings.stretchInterval > 0) {
          setStretchInterval(settings.stretchInterval);
          try {
            localStorage.setItem('di_stretch_interval', String(settings.stretchInterval));
          } catch {}
        }
        if (typeof settings.autoStretchAlert === 'boolean') {
          setAutoStretchAlert(settings.autoStretchAlert);
          try {
            localStorage.setItem('di_stretch_auto_alert', String(settings.autoStretchAlert));
          } catch {}
        }
        if (typeof settings.waterInterval === 'number' && settings.waterInterval > 0) {
          setWaterInterval(settings.waterInterval);
          try {
            localStorage.setItem('di_water_interval', String(settings.waterInterval));
          } catch {}
        }
        if (typeof settings.autoWaterAlert === 'boolean') {
          setAutoWaterAlert(settings.autoWaterAlert);
          try {
            localStorage.setItem('di_water_auto_alert', String(settings.autoWaterAlert));
          } catch {}
        }
        if (typeof settings.waterGlasses === 'number') {
          const today = new Date().toDateString();
          if (settings.waterDate === today) {
            setWaterGlasses(settings.waterGlasses);
          }
        }
        if (typeof settings.annivEnabled === 'boolean') {
          setAnnivEnabled(settings.annivEnabled);
          try {
            localStorage.setItem('di_anniv_enabled', String(settings.annivEnabled));
          } catch {}
        }
        if (typeof settings.startDay === 'number' && settings.startDay >= 1 && settings.startDay <= 31) {
          setStartDay(settings.startDay);
          try {
            localStorage.setItem('di_anniv_day', String(settings.startDay));
          } catch {}
        }
        if (typeof settings.startMonth === 'number' && settings.startMonth >= 0 && settings.startMonth <= 11) {
          setStartMonth(settings.startMonth);
          try {
            localStorage.setItem('di_anniv_month', String(settings.startMonth));
          } catch {}
        }
        if (typeof settings.startYear === 'number' && settings.startYear >= 1970 && settings.startYear <= 2100) {
          setStartYear(settings.startYear);
          try {
            localStorage.setItem('di_anniv_year', String(settings.startYear));
          } catch {}
        }
        if (typeof settings.showAlwaysAnniv === 'boolean') {
          setShowAlwaysAnniv(settings.showAlwaysAnniv);
          try {
            localStorage.setItem('di_anniv_show_always', String(settings.showAlwaysAnniv));
          } catch {}
        }
        if (typeof settings.expandedHeight === 'number' && settings.expandedHeight >= 280 && settings.expandedHeight <= 620) {
          setExpandedHeight(settings.expandedHeight);
          currentHeightRef.current = settings.expandedHeight;
          try {
            localStorage.setItem('di_expanded_height', String(settings.expandedHeight));
          } catch {}
        }
        if (typeof settings.isDragModeEnabled === 'boolean') {
          setIsDragModeEnabled(settings.isDragModeEnabled);
          try {
            localStorage.setItem('di_drag_mode', String(settings.isDragModeEnabled));
          } catch {}
        }
        if (typeof settings.timerPresetSeconds === 'number' && settings.timerPresetSeconds > 0) {
          setTimerTotalSeconds(settings.timerPresetSeconds);
          setTimerSecondsLeft(settings.timerPresetSeconds);
          try {
            localStorage.setItem('di_timer_total_seconds', String(settings.timerPresetSeconds));
          } catch {}
        }
        if (settings.displayStyle === 'top-notch' || settings.displayStyle === 'floating') {
          setDisplayStyle(settings.displayStyle);
          try {
            localStorage.setItem('di_display_style', settings.displayStyle);
          } catch {}
        }

        // Seed full defaults, then merge disk settings, then merge any changes made during boot
        appSettingsCacheRef.current = {
          expandOnHover,
          displayStyle,
          expandedHeight,
          isDragModeEnabled,
          soundEnabled,
          showLyrics,
          stretchInterval,
          autoStretchAlert,
          waterInterval,
          autoWaterAlert,
          waterGlasses,
          waterDate: new Date().toDateString(),
          annivEnabled,
          startDay,
          startMonth,
          startYear,
          showAlwaysAnniv,
          timerPresetSeconds: timerTotalSeconds,
          ...settings,
          ...appSettingsCacheRef.current,
        };

        if (!settings || Object.keys(settings).length === 0) {
          window.electronAPI?.saveAppSettings?.({ ...appSettingsCacheRef.current });
        }
      } catch (err) {
        console.warn('Failed to load native app settings:', err);
      } finally {
        isSettingsInitializedRef.current = true;
      }
    };

    loadSettings();

    return () => {
      isCancelled = true;
    };
  }, []);

  const islandRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseCooldownRef = useRef(0);

  // Master unmount lifecycle cleanup & persistence flush
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPersistAppSettings();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      flushPersistAppSettings();
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      if (dragEndTimeoutRef.current) clearTimeout(dragEndTimeoutRef.current);
      if (audioRecorderRef.current) {
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      }
    };
  }, []);

  // Single coordinated heartbeat timer (Clock, Stretch alert, Water alert)
  useEffect(() => {
    const tick = () => {
      // 1. Clock & Date
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

      // 2. Stretch countdown
      if (autoStretchAlert) {
        setStretchSecondsLeft((prev) => {
          if (prev === 1) {
            sound.playSuccess();
            setIsExpanded(true);
            setActiveTab('health');
            return 0;
          }
          if (prev <= 0) return 0;
          return prev - 1;
        });
      }

      // 3. Water countdown
      if (autoWaterAlert) {
        setWaterSecondsLeft((prev) => {
          if (prev === 1) {
            sound.playWaterDrop();
            setIsExpanded(true);
            setActiveTab('health');
            return 0;
          }
          if (prev <= 0) return 0;
          return prev - 1;
        });
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [autoStretchAlert, autoWaterAlert]);

  // Stretch Handlers
  const handleResetStretch = useCallback(() => {
    sound.playSuccess();
    setStretchSecondsLeft(stretchInterval * 60);
  }, [stretchInterval]);

  const handleSnoozeStretch = useCallback((minutes: number) => {
    sound.playClick();
    setStretchSecondsLeft(minutes * 60);
  }, []);

  const handleStretchIntervalChange = useCallback((mins: number) => {
    setStretchInterval(mins);
    setStretchSecondsLeft(mins * 60);
    try {
      localStorage.setItem('di_stretch_interval', String(mins));
    } catch {}
    persistAppSetting({ stretchInterval: mins });
  }, []);

  const handleToggleAutoStretchAlert = useCallback(() => {
    setAutoStretchAlert((prev) => {
      const nextVal = !prev;
      try {
        localStorage.setItem('di_stretch_auto_alert', String(nextVal));
      } catch {}
      persistAppSetting({ autoStretchAlert: nextVal });
      return nextVal;
    });
  }, []);

  // Water Handlers
  const handleAddWaterGlass = useCallback(() => {
    setWaterGlasses((prev) => {
      const next = Math.min(16, prev + 1);
      const today = new Date().toDateString();
      try {
        localStorage.setItem('di_water_glasses', String(next));
        localStorage.setItem('di_water_date', today);
      } catch {}
      persistAppSetting({ waterGlasses: next, waterDate: today });
      return next;
    });
  }, []);

  const handleRemoveWaterGlass = useCallback(() => {
    setWaterGlasses((prev) => {
      const next = Math.max(0, prev - 1);
      const today = new Date().toDateString();
      try {
        localStorage.setItem('di_water_glasses', String(next));
        localStorage.setItem('di_water_date', today);
      } catch {}
      persistAppSetting({ waterGlasses: next, waterDate: today });
      return next;
    });
  }, []);

  const handleResetWater = useCallback(() => {
    const today = new Date().toDateString();
    setWaterGlasses(0);
    try {
      localStorage.setItem('di_water_glasses', '0');
      localStorage.setItem('di_water_date', today);
    } catch {}
    persistAppSetting({ waterGlasses: 0, waterDate: today });
  }, []);

  const handleResetWaterTimer = useCallback(() => {
    setWaterSecondsLeft(waterInterval * 60);
  }, [waterInterval]);

  const handleSnoozeWaterTimer = useCallback((mins: number) => {
    sound.playClick();
    setWaterSecondsLeft(mins * 60);
  }, []);

  const handleWaterIntervalChange = useCallback((mins: number) => {
    setWaterInterval(mins);
    setWaterSecondsLeft(mins * 60);
    try {
      localStorage.setItem('di_water_interval', String(mins));
    } catch {}
    persistAppSetting({ waterInterval: mins });
  }, []);

  const handleToggleAutoWaterAlert = useCallback(() => {
    setAutoWaterAlert((prev) => {
      const nextVal = !prev;
      try {
        localStorage.setItem('di_water_auto_alert', String(nextVal));
      } catch {}
      persistAppSetting({ autoWaterAlert: nextVal });
      return nextVal;
    });
  }, []);

  // Preferences: Only persist after initial settings boot to prevent overwriting native settings!
  useEffect(() => {
    if (!isSettingsInitializedRef.current) return;
    try {
      localStorage.setItem('di_expand_hover', String(expandOnHover));
    } catch {}
    persistAppSetting({ expandOnHover });
  }, [expandOnHover]);

  useEffect(() => {
    if (!isSettingsInitializedRef.current) return;
    try {
      localStorage.setItem('di_expanded_height', String(expandedHeight));
    } catch {}
    persistAppSetting({ expandedHeight });
  }, [expandedHeight]);

  useEffect(() => {
    if (!isSettingsInitializedRef.current) return;
    try {
      localStorage.setItem('di_drag_mode', String(isDragModeEnabled));
    } catch {}
    persistAppSetting({ isDragModeEnabled });
  }, [isDragModeEnabled]);

  useEffect(() => {
    if (!isSettingsInitializedRef.current) return;
    try {
      localStorage.setItem('di_display_style', displayStyle);
    } catch {}
    persistAppSetting({ displayStyle });
  }, [displayStyle]);

  const handleToggleDisplayStyle = useCallback((style: DisplayStyle) => {
    setDisplayStyle(style);
    sound.playClick();
    try {
      localStorage.setItem('di_display_style', style);
    } catch {}
    persistAppSetting({ displayStyle: style });

    if (window.electronAPI?.getWindowPosition && window.electronAPI?.setWindowPosition) {
      window.electronAPI.getWindowPosition().then((pos) => {
        if (pos) {
          if (style === 'top-notch') {
            window.electronAPI!.setWindowPosition!(pos.x, 0);
          } else {
            window.electronAPI!.setWindowPosition!(pos.x, 6);
          }
        }
      });
    }
  }, []);

  const handleToggleExpandOnHover = useCallback((enabled: boolean) => {
    setExpandOnHover(enabled);
    sound.playClick();
    try {
      localStorage.setItem('di_expand_hover', String(enabled));
    } catch {}
    persistAppSetting({ expandOnHover: enabled });
  }, []);

  const handleToggleDragMode = useCallback((enabled: boolean) => {
    setIsDragModeEnabled(enabled);
    sound.playClick();
    try {
      localStorage.setItem('di_drag_mode', String(enabled));
    } catch {}
    persistAppSetting({ isDragModeEnabled: enabled });
  }, []);

  useEffect(() => {
    if (window.electronAPI?.getWindowPosition) {
      window.electronAPI.getWindowPosition().then((pos) => {
        if (pos) {
          if (displayStyle === 'top-notch' && pos.y !== 0) {
            window.electronAPI?.setWindowPosition?.(pos.x, 0);
          } else if (displayStyle === 'floating' && pos.y === 0) {
            window.electronAPI?.setWindowPosition?.(pos.x, 6);
          }
          if (pos.isCustom) {
            setIsCustomPosition(true);
          }
        }
      });
    }
  }, [displayStyle]);

  // Global window position reset listener (subscribed once on mount)
  useEffect(() => {
    if (window.electronAPI?.onPositionReset) {
      const cleanup = window.electronAPI.onPositionReset(() => {
        setIsCustomPosition(false);
      });
      return cleanup;
    }
  }, []);

  // Listen for native OS drag and drop over the window in Tauri v2
  useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | undefined;
    try {
      const webview = getCurrentWebview();
      if (webview && typeof webview.onDragDropEvent === 'function') {
        webview
          .onDragDropEvent((event) => {
            const type = event.payload.type;
            if (type === 'enter' || type === 'over') {
              setIsDraggingOverCapsule(true);
            } else if (type === 'drop') {
              setIsDraggingOverCapsule(false);
              const paths = (event.payload as any).paths as string[];
              if (paths && paths.length > 0) {
                setDroppedNativePaths(paths);
                setActiveTab('tools');
                sound.playPop();
                setIsExpanded(true);
              }
            } else {
              setIsDraggingOverCapsule(false);
            }
          })
          .then((un) => {
            if (isCancelled) {
              un();
            } else {
              unlisten = un;
            }
          })
          .catch(() => {});
      }
    } catch {
      // not in Tauri
    }
    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Track cursor leave state using ref to avoid re-subscribing IPC listeners on every drag move
  const cursorLeftContextRef = useRef({
    expandOnHover,
    isExpanded,
    isDragging,
    isResizingHeight,
    isEditingNote,
  });
  useEffect(() => {
    cursorLeftContextRef.current = {
      expandOnHover,
      isExpanded,
      isDragging,
      isResizingHeight,
      isEditingNote,
    };
  });

  // Listen for cursor leaving window bounds (auto-close when expanded) - Subscribed once on mount
  useEffect(() => {
    let unlistenBridge: (() => void) | undefined;
    if (window.electronAPI?.onCursorLeft) {
      unlistenBridge = window.electronAPI.onCursorLeft(() => {
        const ctx = cursorLeftContextRef.current;
        if (ctx.expandOnHover && ctx.isExpanded && !ctx.isDragging && !ctx.isResizingHeight && !ctx.isEditingNote) {
          sound.playPop();
          setIsExpanded(false);
        }
      });
    }

    const handleDocumentMouseLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        const ctx = cursorLeftContextRef.current;
        if (ctx.expandOnHover && ctx.isExpanded && !ctx.isDragging && !ctx.isResizingHeight && !ctx.isEditingNote) {
          if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = setTimeout(() => {
            sound.playPop();
            setIsExpanded(false);
          }, 180);
        }
      }
    };

    document.addEventListener('mouseleave', handleDocumentMouseLeave);
    return () => {
      document.removeEventListener('mouseleave', handleDocumentMouseLeave);
      if (unlistenBridge) unlistenBridge();
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragModeEnabled) return;

    // Jika di expanded view dan user mengklik elemen kontrol interaktif, jangan drag
    const target = e.target as HTMLElement;
    if (
      isExpanded &&
      target.closest(
        'button, input, textarea, a, select, [role="button"], .cursor-pointer, [data-interactive]'
      )
    ) {
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
    const deltaY = displayStyle === 'top-notch' ? 0 : (e.screenY - pointerStartRef.current.y);

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
    if (dragEndTimeoutRef.current) clearTimeout(dragEndTimeoutRef.current);
    dragEndTimeoutRef.current = setTimeout(() => {
      hasDraggedRef.current = false;
    }, 50);
  };

  const handleResetPosition = useCallback(async () => {
    sound.playPop();
    if (window.electronAPI?.resetWindowPosition) {
      await window.electronAPI.resetWindowPosition();
      if (displayStyle === 'top-notch') {
        const pos = await window.electronAPI.getWindowPosition?.();
        if (pos) {
          await window.electronAPI.setWindowPosition?.(pos.x, 0);
        }
      }
      setIsCustomPosition(false);
    }
  }, [displayStyle]);

  // Mouse Enter/Leave Handling for Window Click-Through
  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (Date.now() < collapseCooldownRef.current) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    if (expandOnHover && !isExpanded) {
      hoverTimeoutRef.current = setTimeout(() => {
        sound.playPop();
        setIsExpanded(true);
      }, 80);
    }
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (isDragging || isResizingHeight) return;

    // Check if mouse actually left the island bounding box (ignores child unmount anomalies)
    if (islandRef.current) {
      const rect = islandRef.current.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        return; // Mouse cursor is still inside the island
      }
    }

    if (expandOnHover && isExpanded && !isEditingNote) {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = setTimeout(() => {
        sound.playPop();
        setIsExpanded(false);
      }, 180);
    }
  };

  const handleCollapse = useCallback((e?: React.MouseEvent) => {
    // Saat mode edit catatan aktif, kapsul tidak bisa di-minimize / ciutkan
    if (isEditingNote) {
      return;
    }
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    collapseCooldownRef.current = Date.now() + 600;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    sound.playPop();
    setIsExpanded(false);
    hasDraggedRef.current = false;
  }, [isEditingNote]);

  // Keyboard shortcut: Press Escape to collapse expanded island
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded && !isEditingNote) {
        handleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, isEditingNote, handleCollapse]);

  const toggleExpand = () => {
    if (isDragModeEnabled && hasDraggedRef.current) {
      return;
    }
    if (isExpanded && isEditingNote) {
      return;
    }
    sound.playPop();
    if (isExpanded) {
      collapseCooldownRef.current = Date.now() + 600;
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
      }
      setIsExpanded(false);
    } else {
      collapseCooldownRef.current = 0;
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
      }
      setIsExpanded(true);
    }
  };

  const handleTabSelect = (tab: ActiveTab) => {
    sound.playClick();
    setActiveTab(tab);
    setTimeout(() => {
      updateScrollIndicators();
    }, 350);
  };

  const isStretchAlert = stretchSecondsLeft === 0;
  const isWaterAlert = waterSecondsLeft === 0;

  const annivCalc = getAnniversaryCalculations(startYear, startMonth, startDay);
  const showAnnivBadge =
    annivEnabled &&
    (annivCalc.isAnnivToday ||
      annivCalc.isMensiveToday ||
      (showAlwaysAnniv ? true : annivCalc.isMensiveApproaching));

  const hasRecording = isRecording;
  const hasWater = isWaterAlert;
  const hasStretch = isStretchAlert;
  const hasTimer = isTimerRunning;
  const hasStopwatch = isStopwatchRunning;
  const hasTasks = activeTasksCount > 0;
  const hasAnniv = annivEnabled && annivCalc.isAnnivToday;
  const hasMensive = annivEnabled && !annivCalc.isAnnivToday && annivCalc.isMensiveToday;
  const hasApproachingAnniv =
    annivEnabled &&
    !annivCalc.isAnnivToday &&
    !annivCalc.isMensiveToday &&
    showAnnivBadge &&
    (annivCalc.isMensiveApproaching || (annivCalc.daysUntilMensive !== undefined && annivCalc.daysUntilMensive <= 3));

  const hasMedia = isMediaPlaying || (mediaAudioPeak > 0.012);

  const notificationCount =
    (hasMedia ? 1 : 0) +
    (hasRecording ? 1 : 0) +
    (hasWater ? 1 : 0) +
    (hasStretch ? 1 : 0) +
    (hasTimer ? 1 : 0) +
    (hasStopwatch ? 1 : 0) +
    (hasTasks ? 1 : 0) +
    (hasAnniv || hasMensive || hasApproachingAnniv ? 1 : 0);

  const isDisplayingLyric = Boolean(
    hasMedia && showLyrics && currentLyricText && currentLyricText.trim().length > 0
  );
  const compactHeight = isDisplayingLyric ? 48 : 36;
  const compactRadius = isDisplayingLyric ? 20 : 18;

  const compactWidth = (() => {
    if (isDraggingOverCapsule) return 260;
    if (isDownloaderActive) return 215;
    if (hasMedia) {
      const secondaryCount =
        (hasRecording ? 1 : 0) +
        (hasTimer ? 1 : 0) +
        (hasStopwatch ? 1 : 0) +
        (hasTasks ? 1 : 0) +
        (hasWater || hasStretch ? 1 : 0) +
        (hasAnniv || hasMensive || hasApproachingAnniv ? 1 : 0);
      if (isDisplayingLyric) {
        if (secondaryCount >= 2) return 295;
        if (secondaryCount === 1) return 260;
        return 235;
      }
      if (secondaryCount >= 2) return 275;
      if (secondaryCount === 1) return 225;
      return 192;
    }
    if (notificationCount >= 4) return 340;
    if (notificationCount === 3) return 300;
    if (notificationCount === 2) return 260;
    if (hasRecording) return 245;
    if (hasWater || hasStretch) return 235;
    if (hasAnniv || hasMensive || hasApproachingAnniv) return 230;
    if (hasTimer || hasStopwatch) return 225;
    if (hasTasks) return 210;
    return 168; // Symmetrically centered when no reminders active
  })();

  // Sync window size with expanded state and compact dimensions (throttled during height drag)
  useEffect(() => {
    const setExpanded = window.electronAPI?.setWindowExpanded;
    if (!setExpanded) return;
    if (isResizingHeight) return;

    if (isExpanded) {
      setExpanded(true, expandedHeight, 558);
    } else {
      setExpanded(false, compactHeight, compactWidth);
      const timer = setTimeout(() => {
        window.electronAPI?.trimMemory?.();
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, expandedHeight, compactWidth, compactHeight, isResizingHeight]);

  const tabs = useMemo(
    () => [
      {
        id: 'clock',
        label: 'Waktu',
        icon: ClockIcon,
        activeIndicator:
          isTimerRunning ||
          isStopwatchRunning ||
          annivCalc.isAnnivToday ||
          annivCalc.isMensiveToday ||
          annivCalc.isMensiveApproaching,
      },
      { id: 'todo', label: 'Tugas', icon: CheckSquare, badge: activeTasksCount },
      {
        id: 'notes',
        label: 'Catatan',
        icon: FileText,
        badge: notes.length > 0 ? notes.length : undefined,
        activeIndicator: isRecording,
      },
      { id: 'shortcuts', label: 'Pintasan', icon: LayoutGrid },
      { id: 'tools', label: 'Alat', icon: SlidersHorizontal },
      {
        id: 'downloader',
        label: 'Unduh',
        icon: DownloadCloud,
        activeIndicator: isDownloaderActive,
      },
      {
        id: 'health',
        label: 'Sehat',
        icon: HeartPulse,
        activeIndicator: isStretchAlert || isWaterAlert,
      },
      { id: 'settings', label: 'Setelan', icon: SettingsIcon },
    ],
    [
      isTimerRunning,
      isStopwatchRunning,
      annivCalc.isAnnivToday,
      annivCalc.isMensiveToday,
      annivCalc.isMensiveApproaching,
      activeTasksCount,
      notes.length,
      isRecording,
      isDownloaderActive,
      isStretchAlert,
      isWaterAlert,
    ]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOverCapsule) {
      setIsDraggingOverCapsule(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverCapsule(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverCapsule(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setDroppedFiles(files);
      setActiveTab('tools');
      sound.playPop();
      setIsExpanded(true);
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center select-none ${
        displayStyle === 'floating' ? 'pt-2' : 'pt-0'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        ref={islandRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        animate={{
          width: isExpanded ? 558 : compactWidth,
          height: isExpanded ? expandedHeight : compactHeight,
          borderTopLeftRadius: displayStyle === 'top-notch' ? 0 : (isExpanded ? 32 : compactRadius),
          borderTopRightRadius: displayStyle === 'top-notch' ? 0 : (isExpanded ? 32 : compactRadius),
          borderBottomLeftRadius: isExpanded ? 32 : (displayStyle === 'top-notch' ? 20 : compactRadius),
          borderBottomRightRadius: isExpanded ? 32 : (displayStyle === 'top-notch' ? 20 : compactRadius),
        }}
        transition={
          isResizingHeight
            ? { duration: 0 }
            : {
                type: 'spring',
                stiffness: 380,
                damping: 30,
                mass: 0.8,
              }
        }
        style={{
          boxShadow: isDraggingOverCapsule
            ? '0 0 24px rgba(6, 182, 212, 0.75), inset 0 0 12px rgba(6, 182, 212, 0.35)'
            : isExpanded
            ? '0 12px 28px -6px rgba(0, 0, 0, 0.6), 0 4px 12px -2px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
            : displayStyle === 'top-notch'
            ? '0 10px 24px -2px rgba(0, 0, 0, 0.8), 0 3px 8px -1px rgba(0, 0, 0, 0.5)'
            : '0 4px 12px -2px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          borderColor: isDraggingOverCapsule ? 'rgba(6, 182, 212, 0.8)' : undefined,
          borderTopWidth: displayStyle === 'top-notch' ? 0 : undefined,
        }}
        className={`relative bg-black text-white border border-white/15 select-none ${
          displayStyle === 'top-notch' ? 'border-t-0' : ''
        } ${
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
              className="w-full h-full flex items-center justify-center rounded-[inherit] overflow-hidden"
            >
              <CompactView
                currentTime={currentTime}
                currentDate={currentDate}
                activeTasksCount={activeTasksCount}
                timerActive={isTimerRunning}
                timerRemaining={timerRemaining}
                stopwatchActive={isStopwatchRunning}
                stopwatchTime={compactStopwatchFormatted}
                isRecording={isRecording}
                recordingSeconds={recordingSeconds}
                isStretchAlert={isStretchAlert}
                isWaterAlert={isWaterAlert}
                isAnnivToday={annivCalc.isAnnivToday}
                isMensiveToday={annivCalc.isMensiveToday}
                isMensiveApproaching={annivCalc.isMensiveApproaching}
                daysUntilMensive={annivCalc.daysUntilMensive}
                showAnnivBadge={showAnnivBadge}
                isDraggingOver={isDraggingOverCapsule}
                mediaPlaying={isMediaPlaying}
                mediaTitle={mediaState.title}
                mediaArtist={mediaState.artist}
                mediaPeak={mediaAudioPeak}
                showLyrics={showLyrics}
                currentLyric={currentLyricText}
                isDownloading={isDownloaderActive}
                downloadProgress={downloaderProgress}
                updateAvailable={updateAvailable}
                updateVersion={updateVersion}
                onUpdateClick={() => {
                  setIsExpanded(true);
                  setActiveTab('settings');
                }}
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
              className="absolute inset-0 p-4 pb-1.5 flex flex-col min-h-0 rounded-[inherit] overflow-hidden"
            >
              {/* Top Navigation Bar with Horizontal Scroll & Mouse Controls */}
              <div className="relative flex items-center pb-2 border-b border-zinc-800/60 shrink-0 px-1 w-full group/tabs overflow-hidden">
                {/* Left Scroll Chevron with Gradient Mask */}
                <AnimatePresence>
                  {canScrollLeft && (
                    <motion.div
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      className="absolute left-0 top-0 bottom-2 z-20 flex items-center bg-gradient-to-r from-black via-black/85 to-transparent pr-4 pl-0.5 pointer-events-none"
                    >
                      <button
                        onClick={() => {
                          sound.playClick();
                          tabsContainerRef.current?.scrollBy({ left: -140, behavior: 'smooth' });
                        }}
                        className="w-5 h-5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center shadow-md border border-zinc-700/70 transition-all hover:scale-105 active:scale-95 pointer-events-auto cursor-pointer"
                        title="Geser menu ke kiri"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div
                  ref={tabsContainerRef}
                  className="flex items-center gap-1 sm:gap-1.5 w-full overflow-x-auto no-scrollbar pl-1 pr-3 py-0.5"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        data-tab-id={tab.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTabSelect(tab.id as ActiveTab);
                        }}
                        className={`relative shrink-0 inline-flex items-center justify-center px-2.5 py-1 rounded-full transition-colors select-none whitespace-nowrap cursor-pointer z-10 ${
                          isActive
                            ? 'text-white'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 active:scale-95'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="active-tab-bubble"
                            className="absolute inset-0 bg-zinc-800 rounded-full border border-zinc-700/60 shadow-sm pointer-events-none"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center justify-center gap-1.5 leading-none pointer-events-none">
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
                            <span
                              className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                tab.id === 'notes' && isRecording
                                  ? 'bg-red-500'
                                  : 'bg-amber-400'
                              }`}
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Right Scroll Chevron with Gradient Mask */}
                <AnimatePresence>
                  {canScrollRight && (
                    <motion.div
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 6 }}
                      className="absolute right-0 top-0 bottom-2 z-20 flex items-center bg-gradient-to-l from-black via-black/85 to-transparent pl-4 pr-0.5 pointer-events-none"
                    >
                      <button
                        onClick={() => {
                          sound.playClick();
                          tabsContainerRef.current?.scrollBy({ left: 140, behavior: 'smooth' });
                        }}
                        className="w-5 h-5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center shadow-md border border-zinc-700/70 transition-all hover:scale-105 active:scale-95 pointer-events-auto cursor-pointer"
                        title="Geser menu ke kanan"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Now Playing Banner when media is active or has title */}
              {Boolean(mediaState.title && mediaState.title.trim().length > 0 && (isMediaPlaying || mediaAudioPeak > 0.015)) && (
                <div className="flex flex-col px-3 py-1.5 mt-1.5 mb-1 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-md shrink-0 select-none">
                  {/* Top Row: Track info & Controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Real-time Bouncing Equalizer Bars (GPU Transform) */}
                      <div className="flex items-end gap-[2.5px] h-3.5 w-4 pb-0.5 shrink-0">
                        <span
                          className={`w-[2.5px] h-full rounded-full bg-emerald-400 origin-bottom ${
                            isMediaPlaying ? 'animate-eq-1' : 'scale-y-[0.25]'
                          }`}
                        />
                        <span
                          className={`w-[2.5px] h-full rounded-full bg-cyan-400 origin-bottom ${
                            isMediaPlaying ? 'animate-eq-2' : 'scale-y-[0.35]'
                          }`}
                        />
                        <span
                          className={`w-[2.5px] h-full rounded-full bg-emerald-300 origin-bottom ${
                            isMediaPlaying ? 'animate-eq-3' : 'scale-y-[0.25]'
                          }`}
                        />
                        <span
                          className={`w-[2.5px] h-full rounded-full bg-cyan-300 origin-bottom ${
                            isMediaPlaying ? 'animate-eq-4' : 'scale-y-[0.2]'
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-zinc-100 truncate leading-snug">
                          {mediaState.title || 'Musik Web Sedang Berputar'}
                        </p>
                        <p className="text-[9.5px] text-zinc-400 truncate leading-tight">
                          {mediaState.artist || (mediaState.sourceApp ? `${mediaState.sourceApp} Player` : 'Web Audio')}
                          {mediaState.sourceApp && (
                            <span className="ml-1.5 px-1 py-0.2 rounded bg-zinc-800 text-[8.5px] text-zinc-300 font-medium">
                              {mediaState.sourceApp}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Playback & Lyrics Controls */}
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {/* Synced Lyrics Toggle Button */}
                      <button
                        onClick={() => toggleShowLyrics()}
                        title={showLyrics ? 'Sembunyikan Lirik' : 'Tampilkan Lirik Tersinkronisasi'}
                        className={`px-2 py-1 rounded-lg border text-[10.5px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                          showLyrics
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                        }`}
                      >
                        <Mic2 className="w-3.5 h-3.5" />
                        <span>Lirik</span>
                      </button>

                      <button
                        onClick={handleMediaPrev}
                        title="Lagu Sebelumnya"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <SkipBack className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={handleMediaTogglePlay}
                        title={isMediaPlaying ? 'Jeda (Pause)' : 'Putar (Play)'}
                        className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-colors cursor-pointer"
                      >
                        {isMediaPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      <button
                        onClick={handleMediaNext}
                        title="Lagu Berikutnya"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Synced Lyrics Strip (when enabled) */}
                  {showLyrics && (
                    <div className="w-full mt-1.5 pt-1.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                        <div className="min-w-0 flex-1">
                          <AnimatePresence mode="wait">
                            {isFetchingLyrics ? (
                              <motion.span
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-zinc-500 italic text-[10.5px]"
                              >
                                Mencari lirik lagu...
                              </motion.span>
                            ) : currentLyricText ? (
                              <motion.div
                                key={currentLyricText}
                                initial={{ opacity: 0, y: 3 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -3 }}
                                transition={{ duration: 0.15 }}
                                className="truncate font-medium text-emerald-300 drop-shadow-sm"
                              >
                                {currentLyricText}
                              </motion.div>
                            ) : lyrics && lyrics.length > 0 ? (
                              <motion.span
                                key="instrumental"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-zinc-500 italic text-[10.5px] flex items-center"
                              >
                                <Music className="w-3 h-3 inline mr-1 text-emerald-400 opacity-80" />
                                <span>Melodi musik berputar...</span>
                              </motion.span>
                            ) : (
                              <motion.span
                                key="notfound"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-zinc-500 italic text-[10.5px]"
                              >
                                Lirik belum tersedia
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Timeline indicator (e.g. 01:23 / 03:45) */}
                      {mediaState.durationSecs && mediaState.durationSecs > 0 && (
                        <div className="text-[10px] text-zinc-500 font-mono shrink-0 ml-2">
                          {Math.floor(playbackTime / 60)}:
                          {Math.floor(playbackTime % 60).toString().padStart(2, '0')} / {Math.floor(mediaState.durationSecs / 60)}:
                          {Math.floor(mediaState.durationSecs % 60).toString().padStart(2, '0')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2">
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
                      stopwatchMs={stopwatchMs}
                      isStopwatchRunning={isStopwatchRunning}
                      stopwatchLaps={stopwatchLaps}
                      onToggleStopwatch={handleToggleStopwatch}
                      onResetStopwatch={handleResetStopwatch}
                      onLapStopwatch={handleLapStopwatch}
                      startYear={startYear}
                      startMonth={startMonth}
                      startDay={startDay}
                      onAnnivDateChange={handleAnnivDateChange}
                      annivEnabled={annivEnabled}
                      onToggleAnnivEnabled={handleToggleAnnivEnabled}
                      showAlwaysInCompact={showAlwaysAnniv}
                      onToggleShowAlways={handleToggleShowAlwaysAnniv}
                    />
                  )}
                  {activeTab === 'todo' && (
                    <TodoWidget key="todo" onTasksUpdate={setActiveTasksCount} />
                  )}
                  {activeTab === 'notes' && (
                    <NotesWidget
                      key="notes"
                      notes={notes}
                      onSaveNote={handleSaveNote}
                      onDeleteNote={handleDeleteNote}
                      onUpdateNote={handleUpdateNote}
                      onEditingChange={setIsEditingNote}
                      isRecording={isRecording}
                      recordingSeconds={recordingSeconds}
                      liveTranscript={liveTranscript}
                      speechLanguage={speechLanguage}
                      onToggleSpeechLanguage={setSpeechLanguage}
                      onStartRecording={handleStartRecording}
                      onStopRecording={handleStopRecording}
                      onClearLiveTranscript={handleClearLiveTranscript}
                      speechError={speechError}
                      isTranscribing={isTranscribing}
                    />
                  )}
                  {activeTab === 'shortcuts' && <ShortcutsWidget key="shortcuts" />}
                  {activeTab === 'tools' && (
                    <FileToolsWidget
                      key="tools"
                      initialFiles={droppedFiles}
                      initialPaths={droppedNativePaths}
                      onInitialFilesHandled={handleInitialFilesHandled}
                    />
                  )}
                  {activeTab === 'downloader' && (
                    <MediaDownloaderWidget
                      key="downloader"
                      onDownloadStatusChange={handleDownloadStatusChange}
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
                      onToggleExpandOnHover={handleToggleExpandOnHover}
                      isDragMode={isDragModeEnabled}
                      onToggleDragMode={handleToggleDragMode}
                      onResetPosition={handleResetPosition}
                      isCustomPosition={isCustomPosition}
                      displayStyle={displayStyle}
                      onToggleDisplayStyle={handleToggleDisplayStyle}
                      showLyrics={showLyrics}
                      onToggleShowLyrics={toggleShowLyrics}
                      soundEnabled={soundEnabled}
                      onToggleSound={handleToggleSound}
                      initialUpdateInfo={
                        updateAvailable ? { hasUpdate: true, version: updateVersion } : null
                      }
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Sleek Apple Home Indicator / Grab Bar Handle */}
              <div
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
                onClick={() => {
                  if (!hasResizedHeightRef.current && !isEditingNote) {
                    handleCollapse();
                  }
                }}
                className="w-full flex items-center justify-center pt-2.5 pb-1 cursor-ns-resize select-none group shrink-0"
                title="Tarik untuk mengatur tinggi kapsul (atau klik untuk ciutkan)"
              >
                <div className="w-16 h-1 rounded-full bg-zinc-600/70 group-hover:bg-zinc-300 group-active:bg-white group-hover:w-20 transition-all duration-200 shadow-sm" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
