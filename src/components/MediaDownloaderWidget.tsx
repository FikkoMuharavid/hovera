import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DownloadCloud,
  Clipboard,
  X,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  FileVideo,
  Music,
  ExternalLink,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import {
  detectMediaPlatform,
  fetchMediaInfo,
  type MediaInfo,
  type MediaPlatform,
} from '../utils/mediaDownloaderService';

interface MediaDownloaderWidgetProps {
  onDownloadStatusChange?: (isDownloading: boolean, progress: number) => void;
}

export const MediaDownloaderWidget: React.FC<MediaDownloaderWidgetProps> = ({
  onDownloadStatusChange,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<MediaPlatform>('unknown');
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Carousel navigation
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [thumbError, setThumbError] = useState(false);

  // Download states
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatusText, setDownloadStatusText] = useState('');
  const [downloadResult, setDownloadResult] = useState<{
    filePath: string;
    fileName: string;
    folderPath: string;
  } | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (activeIntervalRef.current) {
        clearInterval(activeIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onDownloadStatusChange?.(isDownloading, downloadProgress);
  }, [isDownloading, downloadProgress, onDownloadStatusChange]);

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    setErrorMsg(null);
    setDownloadResult(null);
    setActiveSlideIdx(0);
    setThumbError(false);

    const platform = detectMediaPlatform(value);
    setDetectedPlatform(platform);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (platform !== 'unknown' && value.trim().length > 10) {
      debounceTimerRef.current = setTimeout(() => {
        loadMediaDetails(value.trim());
      }, 350);
    } else {
      setMediaInfo(null);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        handleUrlChange(text.trim());
      } else {
        setErrorMsg('Teks di clipboard bukan tautan web yang valid');
      }
    } catch {
      setErrorMsg('Gagal membaca clipboard');
    }
  };

  const loadMediaDetails = async (url: string) => {
    if (!navigator.onLine) {
      setErrorMsg('Tidak ada koneksi internet. Pastikan perangkat Anda terhubung ke jaringan.');
      return;
    }
    setIsLoadingInfo(true);
    setErrorMsg(null);
    setActiveSlideIdx(0);
    setThumbError(false);
    try {
      const info = await fetchMediaInfo(url);
      if (info) {
        setMediaInfo(info);
      } else {
        setErrorMsg('Tidak dapat memproses tautan media ini');
      }
    } catch {
      setErrorMsg(
        !navigator.onLine
          ? 'Koneksi internet terputus. Periksa jaringan Anda.'
          : 'Terjadi kesalahan saat memeriksa tautan'
      );
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const startSingleDownload = async (
    targetUrl: string,
    format: 'video' | 'audio' | 'photo',
    customFilename?: string
  ) => {
    if (!targetUrl) return;

    setIsDownloading(true);
    setDownloadProgress(20);
    const statusLabel =
      format === 'video'
        ? 'Mengunduh video MP4...'
        : format === 'audio'
        ? 'Mengekstrak audio MP3...'
        : 'Mengunduh foto JPG kualitas tinggi...';
    setDownloadStatusText(statusLabel);
    setErrorMsg(null);
    setDownloadResult(null);

    const progressInterval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev < 88) return prev + Math.floor(Math.random() * 8) + 4;
        return prev;
      });
    }, 300);
    activeIntervalRef.current = progressInterval;

    let willFallback = false;
    try {
      const ext = format === 'video' ? 'mp4' : format === 'audio' ? 'mp3' : 'jpg';
      const cleanTitle = (customFilename || mediaInfo?.title || 'media_berkas')
        .slice(0, 45)
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanTitle}.${ext}`;

      const result = await window.electronAPI?.downloadMediaUrl?.({
        url: targetUrl,
        filename,
      });

      clearInterval(progressInterval);
      activeIntervalRef.current = null;
      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai!');

      if (result && result.success) {
        setDownloadResult(result);
      } else {
        throw new Error('Gagal menyimpan berkas');
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      activeIntervalRef.current = null;
      if (format === 'video' && urlInput.trim()) {
        willFallback = true;
        setDownloadStatusText('Mengunduh video via engine cadangan...');
        startYtdlpDownload('video');
        return;
      }
      if (format === 'audio' && urlInput.trim()) {
        willFallback = true;
        setDownloadStatusText('Mengekstrak audio via engine cadangan...');
        startYtdlpDownload('audio');
        return;
      }
      setErrorMsg(
        !navigator.onLine
          ? 'Koneksi internet terputus. Periksa jaringan Anda.'
          : err?.message || 'Gagal mengunduh berkas'
      );
    } finally {
      if (!willFallback) {
        setIsDownloading(false);
      }
    }
  };

  const startBatchDownload = async (onlyPhotos: boolean) => {
    if (!mediaInfo || !mediaInfo.slides || mediaInfo.slides.length === 0) return;

    setIsDownloading(true);
    setDownloadProgress(20);
    setErrorMsg(null);
    setDownloadResult(null);

    const targetSlides = onlyPhotos
      ? mediaInfo.slides.filter((s) => !s.isVideo)
      : mediaInfo.slides;

    setDownloadStatusText(
      onlyPhotos
        ? `Mengunduh ${targetSlides.length} foto ke folder...`
        : `Mengunduh ${targetSlides.length} berkas ke folder...`
    );

    const progressInterval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev < 90) return prev + Math.floor(Math.random() * 6) + 3;
        return prev;
      });
    }, 300);
    activeIntervalRef.current = progressInterval;

    try {
      const folderName = `Instagram_${(mediaInfo.author || 'Post').replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`;
      const items = targetSlides.map((s, idx) => {
        const isVid = s.isVideo && s.videoUrl;
        const dlUrl = isVid ? s.videoUrl! : s.displayUrl;
        const ext = isVid ? 'mp4' : 'jpg';
        return {
          url: dlUrl,
          filename: `slide_${idx + 1}_${s.shortcode || 'item'}.${ext}`,
        };
      });

      const res = await window.electronAPI?.downloadBatchMedia?.({
        items,
        folderName,
      });

      clearInterval(progressInterval);
      activeIntervalRef.current = null;
      setDownloadProgress(100);
      setDownloadStatusText('Semua berkas berhasil diunduh!');

      if (res && res.success) {
        setDownloadResult({
          filePath: res.folderPath,
          fileName: `${res.totalCount} berkas tersimpan`,
          folderPath: res.folderPath,
        });
      } else {
        throw new Error('Gagal mengunduh beberapa berkas');
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      activeIntervalRef.current = null;
      setErrorMsg(
        !navigator.onLine
          ? 'Koneksi internet terputus. Periksa jaringan Anda.'
          : err?.message || 'Gagal mengunduh berkas'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const startYtdlpDownload = async (formatType: 'video' | 'audio') => {
    if (!urlInput.trim()) return;

    setIsDownloading(true);
    setDownloadProgress(15);
    setDownloadStatusText(
      formatType === 'audio'
        ? 'Mengekstrak audio kualitas tinggi...'
        : 'Mengunduh video MP4 kualitas terbaik...'
    );
    setErrorMsg(null);
    setDownloadResult(null);

    const progressInterval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev < 85) return prev + Math.floor(Math.random() * 8) + 4;
        return prev;
      });
    }, 400);
    activeIntervalRef.current = progressInterval;

    try {
      const result = await window.electronAPI?.downloadViaYtdlp?.({
        url: urlInput.trim(),
        formatType,
      });

      clearInterval(progressInterval);
      activeIntervalRef.current = null;
      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai!');

      if (result && result.success) {
        setDownloadResult(result);
      } else {
        throw new Error('Gagal menyimpan berkas');
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      activeIntervalRef.current = null;
      setErrorMsg(
        !navigator.onLine
          ? 'Koneksi internet terputus. Periksa jaringan Anda.'
          : err?.message || 'Gagal mengunduh berkas'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenFile = () => {
    if (downloadResult?.filePath) {
      window.electronAPI?.openFile?.(downloadResult.filePath);
    }
  };

  const handleOpenFolder = () => {
    if (downloadResult?.folderPath) {
      window.electronAPI?.showInFolder?.(downloadResult.filePath || downloadResult.folderPath);
    }
  };

  const platformBadgeColor = {
    tiktok: 'bg-cyan-950/70 text-cyan-300 border-cyan-800/60',
    youtube: 'bg-red-950/70 text-red-300 border-red-800/60',
    instagram: 'bg-pink-950/70 text-pink-300 border-pink-800/60',
    direct: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60',
    unknown: 'bg-zinc-800 text-zinc-400 border-zinc-700/60',
  }[detectedPlatform];

  const platformLabel = {
    tiktok: 'TikTok (Tanpa Watermark)',
    youtube: 'YouTube (Video / Audio)',
    instagram: 'Instagram (Foto / Reel / Carousel)',
    direct: 'Tautan Berkas Langsung',
    unknown: 'Media Web',
  }[detectedPlatform];

  const currentSlide = mediaInfo?.slides && mediaInfo.slides.length > 0
    ? mediaInfo.slides[activeSlideIdx]
    : null;

  return (
    <div className="flex flex-col h-full w-full px-2 py-1 select-none overflow-y-auto no-scrollbar">
      {/* Header Badge Row */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-cyan-400">
            <DownloadCloud className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white tracking-tight leading-none">
              Pengunduh Media
            </h3>
            <p className="text-[10px] text-zinc-400 leading-none mt-0.5">
              Instagram Foto & Video, YouTube, TikTok, Berkas Langsung
            </p>
          </div>
        </div>

        {detectedPlatform !== 'unknown' && (
          <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-medium border ${platformBadgeColor}`}>
            {platformLabel}
          </span>
        )}
      </div>

      {/* URL Input Form */}
      <div className="relative flex items-center mb-2.5">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="Tempel tautan Instagram, YouTube, TikTok..."
          disabled={isDownloading}
          className="w-full bg-zinc-900/90 border border-zinc-700/60 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 pr-20 focus:outline-none focus:border-cyan-500/80 transition-colors"
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {urlInput ? (
            <button
              onClick={() => handleUrlChange('')}
              disabled={isDownloading}
              className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              title="Bersihkan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handlePasteClipboard}
              disabled={isDownloading}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800/50 rounded-lg transition-colors shadow-sm"
              title="Tempel dari Clipboard"
            >
              <Clipboard className="w-3 h-3" />
              <span>Tempel</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoadingInfo && (
        <div className="flex items-center justify-center gap-2 py-6 text-zinc-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Memeriksa dan mengambil informasi media...</span>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-2.5 mb-2 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Media Preview Card */}
      <AnimatePresence>
        {mediaInfo && !isLoadingInfo && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-col p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 shadow-md mb-2"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail / Carousel Slide Preview */}
              <div className="relative w-18 h-18 rounded-xl overflow-hidden shrink-0 border border-zinc-700/60 bg-zinc-950 flex items-center justify-center">
                {(currentSlide?.displayUrl || mediaInfo.thumbnail) && !thumbError ? (
                  <img
                    src={currentSlide?.displayUrl || mediaInfo.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      setThumbError(true);
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : null}
                {(!((currentSlide?.displayUrl || mediaInfo.thumbnail)) || thumbError) && (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-900/90 text-zinc-500">
                    {mediaInfo.platform === 'tiktok' ? (
                      <Music className="w-7 h-7 text-cyan-400" />
                    ) : mediaInfo.mediaType === 'photo' ? (
                      <ImageIcon className="w-7 h-7 text-amber-400" />
                    ) : (
                      <FileVideo className="w-7 h-7 text-zinc-400" />
                    )}
                  </div>
                )}

                {/* Video duration or type tag */}
                {currentSlide?.isVideo ? (
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8.5px] font-mono text-cyan-300">
                    Video
                  </span>
                ) : mediaInfo.duration ? (
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8.5px] font-mono text-white">
                    {mediaInfo.duration}
                  </span>
                ) : null}
              </div>

              {/* Info Details */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-zinc-100 truncate tracking-tight leading-snug">
                  {mediaInfo.title}
                </h4>
                {mediaInfo.author && (
                  <p className="text-[10.5px] text-zinc-400 truncate mt-0.5">
                    {mediaInfo.author}
                  </p>
                )}

                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium border ${platformBadgeColor}`}>
                    {mediaInfo.platform.toUpperCase()}
                  </span>

                  {mediaInfo.mediaType === 'carousel' && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-950/70 text-purple-300 border border-purple-800/60">
                      <Layers className="w-2.5 h-2.5" />
                      <span>{mediaInfo.slides?.length || 0} Slide</span>
                    </span>
                  )}

                  {mediaInfo.photoCount !== undefined && mediaInfo.photoCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
                      {mediaInfo.photoCount} Foto
                    </span>
                  )}

                  {mediaInfo.videoCount !== undefined && mediaInfo.videoCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-sky-950/60 text-sky-300 border border-sky-800/50">
                      {mediaInfo.videoCount} Video
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Carousel Slide Navigator (if multiple slides) */}
            {mediaInfo.slides && mediaInfo.slides.length > 1 && (
              <div className="flex items-center justify-between mt-2.5 px-2 py-1.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs">
                <button
                  onClick={() => {
                    setThumbError(false);
                    setActiveSlideIdx((prev) => Math.max(0, prev - 1));
                  }}
                  disabled={activeSlideIdx === 0 || isDownloading}
                  className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-zinc-800 transition-colors"
                  title="Slide sebelumnya"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-300">
                  <span>Slide {activeSlideIdx + 1} dari {mediaInfo.slides.length}</span>
                  <span className="text-zinc-500">•</span>
                  <span className={currentSlide?.isVideo ? 'text-sky-400' : 'text-amber-400'}>
                    {currentSlide?.isVideo ? 'Video' : 'Foto'}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setThumbError(false);
                    setActiveSlideIdx((prev) => Math.min((mediaInfo.slides?.length || 1) - 1, prev + 1));
                  }}
                  disabled={activeSlideIdx === (mediaInfo.slides.length - 1) || isDownloading}
                  className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-zinc-800 transition-colors"
                  title="Slide berikutnya"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Dynamic Download Action Buttons */}
            <div className="flex flex-col gap-1.5 mt-3 pt-2.5 border-t border-zinc-800/60">
              {/* CAROUSEL ACTIONS */}
              {mediaInfo.mediaType === 'carousel' && currentSlide && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Button 1: Download currently selected slide */}
                    {currentSlide.isVideo && currentSlide.videoUrl ? (
                      <button
                        onClick={() =>
                          startSingleDownload(
                            currentSlide.videoUrl!,
                            'video',
                            `Instagram_Video_Slide_${activeSlideIdx + 1}`
                          )
                        }
                        disabled={isDownloading}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white text-xs font-medium transition-all shadow-sm disabled:opacity-50"
                      >
                        <FileVideo className="w-3.5 h-3.5" />
                        <span>Unduh Video Ini (MP4)</span>
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          startSingleDownload(
                            currentSlide.displayUrl,
                            'photo',
                            `Instagram_Foto_Slide_${activeSlideIdx + 1}`
                          )
                        }
                        disabled={isDownloading}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white text-xs font-medium transition-all shadow-sm disabled:opacity-50"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Unduh Foto Ini (JPG)</span>
                      </button>
                    )}

                    {/* Button 2: Download all photos if multiple */}
                    {(mediaInfo.photoCount || 0) > 1 ? (
                      <button
                        onClick={() => startBatchDownload(true)}
                        disabled={isDownloading}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-amber-300 text-xs font-medium transition-all border border-amber-900/40 disabled:opacity-50"
                      >
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Unduh Semua Foto ({mediaInfo.photoCount})</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => startBatchDownload(false)}
                        disabled={isDownloading}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-200 text-xs font-medium transition-all border border-zinc-700/60 disabled:opacity-50"
                      >
                        <DownloadCloud className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Unduh Semua Slide ({mediaInfo.slides?.length})</span>
                      </button>
                    )}
                  </div>

                  {/* If both photos and videos present, offer download all slides */}
                  {(mediaInfo.photoCount || 0) > 0 && (mediaInfo.videoCount || 0) > 0 && (
                    <button
                      onClick={() => startBatchDownload(false)}
                      disabled={isDownloading}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-200 text-xs font-medium transition-all border border-zinc-700/60 disabled:opacity-50"
                    >
                      <DownloadCloud className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Unduh Semua Slide ({mediaInfo.slides?.length} Media)</span>
                    </button>
                  )}
                </>
              )}

              {/* SINGLE PHOTO ACTION */}
              {mediaInfo.mediaType === 'photo' && (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => {
                      const photoUrl = mediaInfo.slides?.[0]?.displayUrl || mediaInfo.thumbnail;
                      if (!photoUrl || !photoUrl.startsWith('http') || photoUrl.includes('instagram.com/p/')) {
                        setErrorMsg('Tautan gambar langsung tidak ditemukan');
                        return;
                      }
                      startSingleDownload(
                        photoUrl,
                        'photo',
                        'Instagram_Foto'
                      );
                    }}
                    disabled={isDownloading}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white text-xs font-medium transition-all shadow-sm disabled:opacity-50"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Unduh Foto (JPG Kualitas Tinggi)</span>
                  </button>
                </div>
              )}

              {/* VIDEO ACTIONS (YOUTUBE, TIKTOK, INSTAGRAM REEL) */}
              {mediaInfo.mediaType === 'video' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (mediaInfo.platform === 'tiktok' && mediaInfo.videoUrl) {
                        startSingleDownload(mediaInfo.videoUrl, 'video', 'TikTok_Video');
                      } else if (mediaInfo.platform === 'instagram' && mediaInfo.videoUrl) {
                        startSingleDownload(mediaInfo.videoUrl, 'video', 'Instagram_Video');
                      } else if (mediaInfo.platform === 'direct') {
                        startSingleDownload(mediaInfo.url, 'video', mediaInfo.title);
                      } else {
                        startYtdlpDownload('video');
                      }
                    }}
                    disabled={isDownloading}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white text-xs font-medium transition-all shadow-sm disabled:opacity-50"
                  >
                    <FileVideo className="w-3.5 h-3.5" />
                    <span>Unduh Video (MP4)</span>
                  </button>

                  <button
                    onClick={() => {
                      startYtdlpDownload('audio');
                    }}
                    disabled={isDownloading}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-200 text-xs font-medium transition-all border border-zinc-700/60 disabled:opacity-50"
                  >
                    <Music className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ekstrak Audio (M4A/MP3)</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Download In Progress Bar */}
      {isDownloading && (
        <div className="flex flex-col p-3 rounded-2xl bg-zinc-900/90 border border-cyan-800/40 mb-2">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-zinc-300 font-medium">{downloadStatusText}</span>
            <span className="text-cyan-400 font-mono font-bold tabular-nums">
              {downloadProgress}%
            </span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${downloadProgress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </div>
      )}

      {/* Download Completed Card */}
      {downloadResult && !isDownloading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col p-3 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 mb-2"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-emerald-300 block truncate">
                Berkas Berhasil Diunduh
              </span>
              <span className="text-[10px] text-zinc-400 block truncate">
                Tersimpan di: {downloadResult.folderPath}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-emerald-900/40">
            <button
              onClick={handleOpenFile}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka Berkas</span>
            </button>

            <button
              onClick={handleOpenFolder}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Buka Folder</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Quick Guide when idle */}
      {!mediaInfo && !isLoadingInfo && !errorMsg && !downloadResult && !isDownloading && (
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center rounded-2xl border border-dashed border-zinc-800 text-zinc-500 mt-1">
          <Sparkles className="w-6 h-6 text-cyan-400/80 mb-2" />
          <p className="text-xs font-medium text-zinc-300">
            Tempel Tautan Konten Media
          </p>
          <p className="text-[11px] text-zinc-500 max-w-xs mt-1">
            Salin tautan Instagram (foto/carousel/video), YouTube, atau TikTok, lalu tekan tombol Tempel di atas untuk memulai.
          </p>
        </div>
      )}
    </div>
  );
};
