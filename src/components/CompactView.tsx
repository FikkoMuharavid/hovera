import React from 'react';
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
  isAnnivToday?: boolean;
  isMensiveToday?: boolean;
  isMensiveApproaching?: boolean;
  daysUntilMensive?: number;
  showAnnivBadge?: boolean;
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
  isAnnivToday = false,
  isMensiveToday = false,
  isMensiveApproaching = false,
  daysUntilMensive,
  showAnnivBadge = false,
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

  // Hanya aktif jika memang ada badge notifikasi yang akan ditampilkan
  const isMediaActive = mediaPlaying || (mediaPeak !== undefined && mediaPeak > 0.012);

  const hasMedia = isMediaActive;
  const hasRecording = isRecording;
  const hasWater = isWaterAlert;
  const hasStretch = isStretchAlert;
  const hasTimer = timerActive;
  const hasStopwatch = stopwatchActive;
  const hasTasks = activeTasksCount > 0;
  const hasAnniv = isAnnivToday;
  const hasMensive = !isAnnivToday && isMensiveToday;
  const hasApproachingAnniv =
    !isAnnivToday &&
    !isMensiveToday &&
    showAnnivBadge &&
    (isMensiveApproaching || (daysUntilMensive !== undefined && daysUntilMensive <= 3));

  const hasAnyReminder =
    hasRecording ||
    hasMedia ||
    hasWater ||
    hasStretch ||
    hasTimer ||
    hasStopwatch ||
    hasTasks ||
    hasAnniv ||
    hasMensive ||
    hasApproachingAnniv;

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

        {/* Badges pengingat aktif lainnya jika ada (Tugas, Timer, Stopwatch, Anniv, dll) */}
        {hasTasks && (
          <div
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-zinc-800/90 border border-zinc-700/60 text-[10px] text-zinc-300 tabular-nums leading-none shrink-0"
            title={`${activeTasksCount} tugas aktif`}
          >
            <CheckCircle2 className="w-2.5 h-2.5 text-sky-400 shrink-0" />
            <span>{activeTasksCount}</span>
          </div>
        )}

        {hasTimer && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-300 font-medium tabular-nums leading-none shrink-0">
            <TimerIcon
              className="w-2.5 h-2.5 animate-spin text-amber-400 shrink-0"
              style={{ animationDuration: '4s' }}
            />
            <span>{timerRemaining}</span>
          </div>
        )}

        {hasStopwatch && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium tabular-nums leading-none shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>{stopwatchTime}</span>
          </div>
        )}

        {hasAnniv && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-pink-500/30 to-purple-500/30 border border-pink-400/50 text-[9px] text-pink-200 font-medium animate-pulse shadow-sm leading-none shrink-0">
            <Sparkles className="w-2.5 h-2.5 text-pink-300 shrink-0" />
            <span>Anniv!</span>
          </div>
        )}

        {hasMensive && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/50 text-[9px] text-rose-200 font-medium animate-pulse shadow-sm leading-none shrink-0">
            <Heart className="w-2.5 h-2.5 fill-current text-rose-400 shrink-0" />
            <span>Mensive!</span>
          </div>
        )}

        {hasRecording && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[9.5px] text-red-300 font-medium tabular-nums shadow-sm leading-none animate-pulse shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span>
              {Math.floor(recordingSeconds / 60)}:
              {(recordingSeconds % 60).toString().padStart(2, '0')}
            </span>
          </div>
        )}

        {hasWater && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-[9px] text-sky-300 font-medium animate-pulse shadow-sm leading-none shrink-0">
            <Droplets className="w-2.5 h-2.5 fill-current text-sky-400 shrink-0" />
            <span>Minum</span>
          </div>
        )}

        {hasStretch && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-[9px] text-rose-300 font-medium animate-pulse shadow-sm leading-none shrink-0">
            <HeartPulse className="w-2.5 h-2.5 text-rose-400 shrink-0" />
            <span>Regang</span>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      onClick={onClick}
      className={`flex items-center ${
        hasAnyReminder ? 'justify-between px-3.5' : 'justify-center px-3'
      } w-full h-full cursor-pointer select-none whitespace-nowrap`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {/* Sisi Kiri / Tengah: Jika sedang ada musik, sembunyikan tanggal (hanya jam). Jika tidak ada musik, tampilkan tanggal + jam */}
      <div className="inline-flex items-center space-x-1.5 text-zinc-300 shrink-0 leading-none">
        {!hasMedia && (
          <>
            <div className="inline-flex items-center space-x-1 text-zinc-400 leading-none">
              <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="text-[11.5px] font-medium text-zinc-300 tracking-tight leading-none">
                {currentDate}
              </span>
            </div>
            <span className="text-zinc-600 text-[10px] leading-none px-0.5 select-none">·</span>
          </>
        )}
        <span className="text-xs font-semibold text-white tracking-tight tabular-nums leading-none">
          {currentTime}
        </span>
      </div>

      {/* Sisi Kanan: Hanya render jika benar-benar ada notifikasi aktif */}
      {hasAnyReminder && (
        <div className="inline-flex items-center space-x-1.5 justify-end shrink-0 leading-none">
          {/* Animasi Bouncing Equalizer Musik (Tanpa Badge - Borderless Seamless) */}
          {hasMedia && (
            <div
              className="inline-flex items-center space-x-2 text-zinc-200 leading-none select-none pl-1"
              title={mediaTitle ? `${mediaTitle}${mediaArtist ? ' · ' + mediaArtist : ''}` : 'Musik Web Sedang Berputar'}
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
                <span className="text-[11px] font-medium text-zinc-200 max-w-[130px] truncate tracking-tight">
                  {mediaTitle}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-zinc-400">Musik</span>
              )}
            </div>
          )}
          {/* Pengingat Anniversary Tahunan (14 Feb) */}
          {hasAnniv && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-pink-500/30 to-purple-500/30 border border-pink-400/50 text-[9px] text-pink-200 font-medium animate-pulse shadow-sm leading-none">
              <Sparkles className="w-2.5 h-2.5 text-pink-300 shrink-0" />
              <span>Anniv!</span>
            </div>
          )}

          {/* Pengingat Mensive Bulanan (Hari H Tgl 14) */}
          {hasMensive && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/50 text-[9px] text-rose-200 font-medium animate-pulse shadow-sm leading-none">
              <Heart className="w-2.5 h-2.5 fill-current text-rose-400 shrink-0" />
              <span>Mensive!</span>
            </div>
          )}

          {/* Pengingat Mensive Menjelang (H-3/H-2/H-1) */}
          {hasApproachingAnniv && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-400/30 text-[9px] text-rose-300 font-medium leading-none">
              <Heart className="w-2.5 h-2.5 fill-current text-rose-400 shrink-0" />
              <span>
                {daysUntilMensive !== undefined ? `H-${daysUntilMensive} Mensive` : '14 Feb'}
              </span>
            </div>
          )}

          {/* Indikator Perekaman Suara ke Teks (Meeting Recording) */}
          {hasRecording && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[9.5px] text-red-300 font-medium tabular-nums shadow-sm leading-none animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              <span>
                Rec {Math.floor(recordingSeconds / 60)}:
                {(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          {/* Pengingat Minum Air Putih */}
          {hasWater && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-[9px] text-sky-300 font-medium animate-pulse shadow-sm leading-none">
              <Droplets className="w-2.5 h-2.5 fill-current text-sky-400 shrink-0" />
              <span>Minum</span>
            </div>
          )}

          {/* Pengingat Peregangan Duduk */}
          {hasStretch && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-[9px] text-rose-300 font-medium animate-pulse shadow-sm leading-none">
              <HeartPulse className="w-2.5 h-2.5 text-rose-400 shrink-0" />
              <span>Regang</span>
            </div>
          )}

          {/* Timer Fokus Aktif */}
          {hasTimer && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] text-amber-300 font-medium tabular-nums leading-none">
              <TimerIcon
                className="w-2.5 h-2.5 animate-spin text-amber-400 shrink-0"
                style={{ animationDuration: '4s' }}
              />
              <span>{timerRemaining}</span>
            </div>
          )}

          {/* Stopwatch Aktif */}
          {hasStopwatch && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium tabular-nums leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>{stopwatchTime}</span>
            </div>
          )}

          {/* Badge Pengingat Tugas Aktif */}
          {hasTasks && (
            <div
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-zinc-800/90 border border-zinc-700/60 text-[10px] text-zinc-300 tabular-nums leading-none"
              title={`${activeTasksCount} tugas aktif`}
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-sky-400 shrink-0" />
              <span>{activeTasksCount}</span>
            </div>
          )}

          {/* Badge Pembaruan Baru Tersedia */}
          {updateAvailable && (
            <div
              onClick={(e) => {
                if (onUpdateClick) {
                  e.stopPropagation();
                  onUpdateClick();
                }
              }}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-[9.5px] text-cyan-300 font-medium leading-none animate-pulse hover:bg-cyan-500/30 cursor-pointer"
              title={`Pembaruan v${updateVersion || 'baru'} tersedia! Klik untuk buka Setelan`}
            >
              <Sparkles className="w-2.5 h-2.5 text-cyan-300 shrink-0" />
              <span>Update {updateVersion ? `v${updateVersion}` : ''}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
});
