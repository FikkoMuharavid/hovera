import React from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Flag, Clock } from 'lucide-react';

export interface LapRecord {
  id: number;
  timeMs: number;
  splitMs: number;
}

interface StopwatchWidgetProps {
  timeMs: number;
  isRunning: boolean;
  laps: LapRecord[];
  onToggleRun: () => void;
  onReset: () => void;
  onLap: () => void;
}

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({
  timeMs,
  isRunning,
  laps,
  onToggleRun,
  onReset,
  onLap,
}) => {
  const formatParts = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);

    return {
      min: String(minutes).padStart(2, '0'),
      sec: String(seconds).padStart(2, '0'),
      cs: String(centiseconds).padStart(2, '0'),
    };
  };

  const formatLapTime = (ms: number) => {
    const parts = formatParts(ms);
    return `${parts.min}:${parts.sec}.${parts.cs}`;
  };

  const current = formatParts(timeMs);

  // Cari lap tercepat & terlambat jika ada >= 2 lap
  let minSplit = Infinity;
  let maxSplit = -Infinity;
  if (laps.length >= 2) {
    laps.forEach((l) => {
      if (l.splitMs < minSplit) minSplit = l.splitMs;
      if (l.splitMs > maxSplit) maxSplit = l.splitMs;
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full select-none justify-between py-0.5"
    >
      {/* Header Info */}
      <div className="flex items-center justify-between pb-1 border-b border-zinc-800/80 w-full text-xs">
        <div className="flex items-center space-x-1.5 text-zinc-300 font-medium">
          <Clock className="w-3.5 h-3.5 text-emerald-400" />
          <span>Stopwatch Presisi</span>
        </div>

        <div className="flex items-center space-x-2 text-[10px]">
          {laps.length > 0 && (
            <span className="text-zinc-400 font-mono">
              Total {laps.length} Lap
            </span>
          )}
          <span
            className={`px-1.5 py-0.2 rounded-full font-medium ${
              isRunning
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                : timeMs > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {isRunning ? 'Berjalan' : timeMs > 0 ? 'Jeda' : 'Siap'}
          </span>
        </div>
      </div>

      {/* Main Counter Display */}
      <div className="flex flex-col items-center justify-center my-1.5">
        <div className="flex items-baseline space-x-1 font-mono tracking-tight text-white select-all">
          <span className="text-3xl font-bold tabular-nums drop-shadow">
            {current.min}:{current.sec}
          </span>
          <span className="text-xl font-semibold text-emerald-400 tabular-nums">
            .{current.cs}
          </span>
        </div>
        <span className="text-[9.5px] text-zinc-500 uppercase tracking-widest font-mono mt-0.5">
          Menit : Detik . Milidetik
        </span>
      </div>

      {/* Lap List / Split Records (Jika ada lap) */}
      <div className="flex-1 overflow-y-auto no-scrollbar max-h-[64px] my-1 pr-0.5">
        {laps.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[10.5px] text-zinc-600 italic">
            Klik tombol &quot;Putaran&quot; saat berjalan untuk mencatat waktu lap
          </div>
        ) : (
          <div className="space-y-1">
            {laps.map((lap) => {
              const isFastest = laps.length >= 2 && lap.splitMs === minSplit;
              const isSlowest = laps.length >= 2 && lap.splitMs === maxSplit;
              return (
                <div
                  key={lap.id}
                  className={`flex items-center justify-between px-2.5 py-0.5 rounded-lg text-[10.5px] font-mono border ${
                    isFastest
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : isSlowest
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300'
                  }`}
                >
                  <span className="font-semibold text-zinc-400">
                    Lap {lap.id}
                    {isFastest && <span className="ml-1 text-[9px] text-emerald-400 font-sans">★ Tercepat</span>}
                    {isSlowest && <span className="ml-1 text-[9px] text-rose-400 font-sans">Terlambat</span>}
                  </span>
                  <div className="flex items-center space-x-3">
                    <span className="text-zinc-500 text-[10px]">
                      +{formatLapTime(lap.splitMs)}
                    </span>
                    <span className="font-medium text-white">
                      {formatLapTime(lap.timeMs)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Controls Bar */}
      <div className="flex items-center justify-center space-x-2.5 pt-1 border-t border-zinc-800/60">
        {/* Reset button */}
        <button
          onClick={onReset}
          disabled={timeMs === 0}
          className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            timeMs > 0
              ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800'
              : 'bg-zinc-900/40 text-zinc-600 border border-zinc-900 cursor-not-allowed'
          }`}
          title="Reset Stopwatch"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>

        {/* Lap Button */}
        <button
          onClick={onLap}
          disabled={!isRunning}
          className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            isRunning
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
              : 'bg-zinc-900/40 text-zinc-600 border border-zinc-900 cursor-not-allowed'
          }`}
          title="Catat Lap"
        >
          <Flag className="w-3 h-3" />
          <span>Putaran (Lap)</span>
        </button>

        {/* Start / Pause button */}
        <button
          onClick={onToggleRun}
          className={`flex items-center space-x-1.5 px-4 py-1 rounded-full text-xs font-semibold shadow-md transition-all ${
            isRunning
              ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
              : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
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
              <span>{timeMs > 0 ? 'Lanjut' : 'Mulai'}</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
};
