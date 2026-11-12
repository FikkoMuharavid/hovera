import React from 'react';
import type { AnnivReminder } from '../utils/anniversary';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  CheckCircle2,
  Timer as TimerIcon,
  HeartPulse,
  Droplets,
  Heart,
  Sparkles,
  Download,
} from 'lucide-react';

interface CompactViewProps {
  currentTime: string;
  currentDate: string;
  activeTasksCount: number;
  timerActive: boolean;
  timerRemaining: string;
  stopwatchActive?: boolean;
  stopwatchTime?: string;
  isRecording?: boolean;
  recordingSeconds?: number;
  isStretchAlert?: boolean;
  isWaterAlert?: boolean;
  annivReminder?: AnnivReminder | null;
  isDraggingOver?: boolean;
  mediaPlaying?: boolean;
  mediaTitle?: string;
  mediaArtist?: string;
  mediaPeak?: number;
  showLyrics?: boolean;
  currentLyric?: string;
  isDownloading?: boolean;
  downloadProgress?: number;
  updateAvailable?: boolean;
  updateVersion?: string;
  onUpdateClick?: () => void;
  onClick: () => void;
}

export const CompactView = React.memo<CompactViewProps>(({
  currentTime,
  currentDate,
  activeTasksCount,
  timerActive,
  timerRemaining,
  stopwatchActive = false,
  stopwatchTime = '',
  isRecording = false,
  recordingSeconds = 0,
  isStretchAlert = false,
  isWaterAlert = false,
  annivReminder = null,
  isDraggingOver = false,
  mediaPlaying = false,
  mediaTitle = '',
  mediaArtist = '',
  mediaPeak = 0,
  showLyrics = true,
  currentLyric = '',
  isDownloading = false,
  downloadProgress = 0,
  updateAvailable = false,
  updateVersion = '',
  onUpdateClick,
  onClick,
}) => {
  if (isDraggingOver) {
    return (
      <div
        onClick={onClick}
        className="w-full h-full flex items-center justify-center gap-2 px-3 text-cyan-300 font-semibold text-[11px] animate-pulse cursor-pointer select-none"
      >
        <Sparkles className="w-4 h-4 text-cyan-400" />
        <span>Lepaskan untuk Olah Berkas</span>
      </div>
    );
  }

  if (isDownloading) {
    return (
      <div
        onClick={onClick}
        className="w-full h-full flex items-center justify-center gap-2 px-3 text-cyan-300 font-semibold text-[11px] cursor-pointer select-none whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
        <span className="font-mono text-[11px] tracking-tight">{downloadProgress}% Mengunduh</span>
      </div>
    );
  }

  // Mode musik hanya aktif jika terdeteksi lagu/media beridentitas judul resmi
  const hasValidMediaTrack = Boolean(mediaTitle && mediaTitle.trim().length > 0);
  const isMediaActive = hasValidMediaTrack && (mediaPlaying || (mediaPeak !== undefined && mediaPeak > 0.012));

  const hasMedia = isMediaActive;
  const hasRecording = isRecording;
  const hasWater = isWaterAlert;
  const hasStretch = isStretchAlert;
  const hasTimer = timerActive;
  const hasStopwatch = stopwatchActive;
  const hasTasks = activeTasksCount > 0;
  const hasAnnivReminder = annivReminder !== null;

  const hasAnyReminder =
    hasRecording ||
    hasMedia ||
    hasWater ||
    hasStretch ||
    hasTimer ||
    hasStopwatch ||
    hasTasks ||
    hasAnnivReminder;

  const pill =
    'inline-flex items-center gap-1 h-[18px] px-1.5 rounded-full text-[10px] font-medium leading-none tabular-nums shrink-0';
  const recLabel = `${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;

  // Badge pengingat: satu gaya untuk semua (tinggi, huruf & jarak sama), warna hanya penanda jenis.
  const badges = (
    <>
      {annivReminder && (
        <span
          className={`${pill} ${annivReminder.isToday ? 'bg-rose-500/20 text-rose-200' : 'bg-white/[0.06] text-zinc-300'}`}
        >
          <Heart className="w-2.5 h-2.5 fill-current text-rose-400" />
          {annivReminder.label}
        </span>
      )}
      {hasRecording && (
        <span className={`${pill} bg-red-500/20 text-red-300`}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Rec {recLabel}
        </span>
      )}
      {hasWater && (
        <span className={`${pill} bg-sky-500/15 text-sky-300`}>
          <Droplets className="w-2.5 h-2.5" />
          Minum
        </span>
      )}
      {hasStretch && (
        <span className={`${pill} bg-rose-500/15 text-rose-300`}>
          <HeartPulse className="w-2.5 h-2.5" />
          Regang
        </span>
      )}
      {hasTimer && (
        <span className={`${pill} bg-amber-500/15 text-amber-300`}>
          <TimerIcon className="w-2.5 h-2.5" />
          {timerRemaining}
        </span>
      )}
      {hasStopwatch && (
        <span className={`${pill} bg-emerald-500/15 text-emerald-300`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {stopwatchTime}
        </span>
      )}
      {hasTasks && (
        <span className={`${pill} bg-white/[0.06] text-zinc-300`} title={`${activeTasksCount} tugas aktif`}>
          <CheckCircle2 className="w-2.5 h-2.5 text-sky-400" />
          {activeTasksCount}
        </span>
      )}
    </>
  );

  // Jika sedang memutar musik:
  if (hasMedia) {
    const displayLyric =
      showLyrics && currentLyric && currentLyric.trim().length > 0
        ? currentLyric.trim()
        : null;

    // Jika lirik aktif dan ada baris lirik yang sedang dinyanyikan: tampilkan 2 baris (Atas: Judul & Bar, Bawah: Lirik)
    if (displayLyric) {
      return (
        <motion.div
          onClick={onClick}
          className="flex flex-col items-center justify-center w-full h-full cursor-pointer select-none whitespace-nowrap px-3 py-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
        >
          {/* Baris Atas: Jam + Judul Musik & Bar Equalizer */}
          <div className="flex items-center justify-center gap-1.5 w-full leading-none shrink-0 pt-0.5">
            {/* Jam */}
            <span className="text-[11px] font-semibold text-white tracking-tight tabular-nums leading-none">
              {currentTime}
            </span>

            <span className="text-zinc-600 text-[9px] leading-none select-none">·</span>

            {/* Equalizer Bars */}
            <div className="flex items-end gap-[2px] h-3 w-3 pb-0.5 shrink-0">
              <span
                className={`w-[2px] h-full rounded-full bg-emerald-400 origin-bottom ${
                  mediaPlaying ? 'animate-eq-1' : 'scale-y-[0.3]'
                }`}
              />
              <span
                className={`w-[2px] h-full rounded-full bg-cyan-400 origin-bottom ${
                  mediaPlaying ? 'animate-eq-2' : 'scale-y-[0.4]'
                }`}
              />
              <span
                className={`w-[2px] h-full rounded-full bg-emerald-300 origin-bottom ${
                  mediaPlaying ? 'animate-eq-3' : 'scale-y-[0.3]'
                }`}
              />
              <span
                className={`w-[2px] h-full rounded-full bg-cyan-300 origin-bottom ${
                  mediaPlaying ? 'animate-eq-4' : 'scale-y-[0.2]'
                }`}
              />
            </div>

            {/* Judul Musik */}
            <span
              className="text-[10.5px] font-medium text-zinc-300 max-w-[125px] truncate tracking-tight"
              title={mediaTitle ? `${mediaTitle}${mediaArtist ? ' · ' + mediaArtist : ''}` : 'Musik'}
            >
              {mediaTitle || 'Musik'}
            </span>

            {/* Badge Tugas jika ada */}
            {hasTasks && (
              <div
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-zinc-800/90 border border-zinc-700/60 text-[9px] text-zinc-300 tabular-nums leading-none shrink-0"
                title={`${activeTasksCount} tugas aktif`}
              >
                <CheckCircle2 className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                <span>{activeTasksCount}</span>
              </div>
            )}
          </div>

          {/* Baris Bawah: Lirik Berjalan */}
          <div className="flex items-center justify-center w-full mt-1 leading-none overflow-hidden pb-0.5">
            <AnimatePresence mode="wait">
              <motion.div
                key={displayLyric}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.18 }}
                className="text-[11px] font-medium text-emerald-300 max-w-[215px] truncate tracking-tight drop-shadow-sm text-center"
                title={`Lirik: "${displayLyric}"`}
              >
                {displayLyric}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      );
    }

    // Jika lirik dinonaktifkan atau belum bernyanyi: 1 baris ramping
    return (
      <motion.div
        onClick={onClick}
        className="flex items-center justify-center gap-2 w-full h-full cursor-pointer select-none whitespace-nowrap px-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
      >
        {/* Jam */}
        <span className="text-xs font-semibold text-white tracking-tight tabular-nums leading-none">
          {currentTime}
        </span>

        <span className="text-zinc-600 text-[10px] leading-none select-none">·</span>

        {/* Dynamic Equalizer + Judul Musik */}
        <div
          className="inline-flex items-center space-x-1.5 text-zinc-200 leading-none select-none"
          title={
            mediaTitle
              ? `${mediaTitle}${mediaArtist ? ' · ' + mediaArtist : ''}`
              : 'Musik Web Sedang Berputar'
          }
        >
          {/* 4 Dynamic Equalizer Bars */}
          <div className="flex items-end gap-[2px] h-3.5 w-3.5 pb-0.5 shrink-0">
            <span
              className={`w-[2px] h-full rounded-full bg-emerald-400 origin-bottom ${
                mediaPlaying ? 'animate-eq-1' : 'scale-y-[0.3]'
              }`}
            />
            <span
              className={`w-[2px] h-full rounded-full bg-cyan-400 origin-bottom ${
                mediaPlaying ? 'animate-eq-2' : 'scale-y-[0.4]'
              }`}
            />
            <span
              className={`w-[2px] h-full rounded-full bg-emerald-300 origin-bottom ${
                mediaPlaying ? 'animate-eq-3' : 'scale-y-[0.3]'
              }`}
            />
            <span
              className={`w-[2px] h-full rounded-full bg-cyan-300 origin-bottom ${
                mediaPlaying ? 'animate-eq-4' : 'scale-y-[0.2]'
              }`}
            />
          </div>

          {mediaTitle ? (
            <span className="text-[11px] font-medium text-zinc-200 max-w-[95px] truncate tracking-tight">
              {mediaTitle}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-zinc-400">Musik</span>
          )}
        </div>

        {badges}
      </motion.div>
    );
  }

  return (
    <motion.div
      onClick={onClick}
      className="flex items-center justify-center gap-2 w-full h-full px-3 cursor-pointer select-none whitespace-nowrap"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      <div className="inline-flex items-center gap-1.5 shrink-0 leading-none">
        <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-[11.5px] font-medium text-zinc-300 tracking-tight">{currentDate}</span>
        <span className="text-zinc-600 text-[10px] select-none">·</span>
        <span className="text-xs font-semibold text-white tracking-tight tabular-nums">{currentTime}</span>
      </div>

      {(hasAnyReminder || updateAvailable) && (
        <div className="inline-flex items-center gap-1.5 shrink-0 leading-none">
          {badges}
          {updateAvailable && (
            <span
              onClick={(e) => {
                if (onUpdateClick) {
                  e.stopPropagation();
                  onUpdateClick();
                }
              }}
              className={`${pill} bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 cursor-pointer`}
              title={`Pembaruan v${updateVersion || 'baru'} tersedia. Klik untuk buka Setelan`}
            >
              <Sparkles className="w-2.5 h-2.5" />
              Update{updateVersion ? ` v${updateVersion}` : ''}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
});
