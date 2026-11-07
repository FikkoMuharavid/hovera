import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList,
  Search,
  Pin,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  FileText,
  Code2,
  Globe,
  ImageIcon,
  Download,
  Maximize2,
  X,
  Info,
} from 'lucide-react';
import type { ClipboardItem } from '../types/electron';
import { sound } from '../utils/sound';

export const ClipboardWidget: React.FC = () => {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'images' | 'pinned'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedLightboxImage, setSelectedLightboxImage] = useState<string | null>(null);

  // Load initial clipboard history and setup live listener
  useEffect(() => {
    if (window.electronAPI?.getClipboardHistory) {
      window.electronAPI.getClipboardHistory().then((data) => {
        if (Array.isArray(data)) {
          setItems(data);
        }
      });
    }

    if (window.electronAPI?.onClipboardUpdated) {
      const unlisten = window.electronAPI.onClipboardUpdated((updatedItems) => {
        if (Array.isArray(updatedItems)) {
          setItems(updatedItems);
        }
      });
      return () => {
        unlisten();
      };
    }
  }, []);

  const handleCopy = useCallback(async (item: ClipboardItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    sound.playClick();

    if (item.itemType === 'image') {
      if (window.electronAPI?.copyClipboardItem) {
        await window.electronAPI.copyClipboardItem(item.id);
      }
    } else {
      if (window.electronAPI?.copyClipboardItem) {
        await window.electronAPI.copyClipboardItem(item.id);
      } else if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard(item.content);
      } else {
        await navigator.clipboard.writeText(item.content);
      }
    }

    setCopiedId(item.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === item.id ? null : prev));
    }, 2000);
  }, []);

  const handleTogglePin = useCallback(async (item: ClipboardItem, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playPop();

    // Optimistic UI update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isPinned: !i.isPinned } : i))
    );

    if (window.electronAPI?.togglePinClipboardItem) {
      await window.electronAPI.togglePinClipboardItem(item.id);
    }
  }, []);

  const handleDelete = useCallback(async (item: ClipboardItem, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playClick();

    // Optimistic UI update
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    if (window.electronAPI?.deleteClipboardItem) {
      await window.electronAPI.deleteClipboardItem(item.id);
    }
  }, []);

  const handleSaveImage = useCallback(async (item: ClipboardItem, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playClick();
    if (window.electronAPI?.saveClipboardImage) {
      const res = await window.electronAPI.saveClipboardImage(item.id);
      if (res) {
        sound.playSuccess();
      }
    }
  }, []);

  const handleClearHistory = useCallback(async () => {
    sound.playPop();
    // Retain only pinned items
    setItems((prev) => prev.filter((i) => i.isPinned));
    setShowClearConfirm(false);

    if (window.electronAPI?.clearClipboardHistory) {
      await window.electronAPI.clearClipboardHistory();
    }
  }, []);

  const handleOpenLink = useCallback((url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playClick();
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }, []);

  // Format relative timestamp
  const formatTimeAgo = useCallback((timestamp: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - timestamp);

    if (diff < 30) return 'Baru saja';
    if (diff < 60) return `${diff} dtk lalu`;
    if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    const days = Math.floor(diff / 86400);
    if (days === 1) return 'Kemarin';
    if (days < 7) return `${days} hr lalu`;
    return new Date(timestamp * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }, []);

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filtered and searched items
  const filteredItems = useMemo(() => {
    let res = items;
    if (filterType === 'pinned') {
      res = res.filter((item) => item.isPinned);
    } else if (filterType === 'images') {
      res = res.filter((item) => item.itemType === 'image');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      res = res.filter(
        (item) =>
          item.content.toLowerCase().includes(q) ||
          item.preview.toLowerCase().includes(q) ||
          item.itemType.toLowerCase().includes(q) ||
          (item.colorHex && item.colorHex.toLowerCase().includes(q))
      );
    }
    return res;
  }, [items, filterType, searchQuery]);

  const pinnedCount = useMemo(() => items.filter((i) => i.isPinned).length, [items]);
  const imageCount = useMemo(() => items.filter((i) => i.itemType === 'image').length, [items]);

  return (
    <div className="flex flex-col h-full w-full select-none text-zinc-200 relative">
      {/* Top Controls Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80 shrink-0 gap-2">
        {/* Left: Tab Switchers */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => {
              sound.playClick();
              setFilterType('all');
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterType === 'all'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 text-cyan-400" />
            <span>Semua</span>
            <span className="text-[10px] px-1 py-0.2 rounded-full bg-zinc-700/60 font-mono text-zinc-300">
              {items.length}
            </span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setFilterType('images');
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterType === 'images'
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gambar</span>
            {imageCount > 0 && (
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-medium">
                {imageCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setFilterType('pinned');
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterType === 'pinned'
                ? 'bg-amber-950/40 text-amber-300 border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${filterType === 'pinned' ? 'text-amber-400 fill-amber-400' : 'text-zinc-400'}`} />
            <span>Tersimpan</span>
            {pinnedCount > 0 && (
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono font-medium">
                {pinnedCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Clear History */}
        <div className="flex items-center gap-1">
          {items.some((i) => !i.isPinned) && (
            <div>
              {showClearConfirm ? (
                <div className="flex items-center gap-1 bg-red-950/60 border border-red-500/40 rounded-lg px-2 py-0.5 animate-in fade-in">
                  <span className="text-[10.5px] text-red-200">Hapus riwayat?</span>
                  <button
                    onClick={handleClearHistory}
                    className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold transition-colors cursor-pointer"
                  >
                    Ya
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-2 py-1 rounded-lg text-[10.5px] text-zinc-400 hover:text-red-400 hover:bg-red-950/20 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Hapus riwayat unpinned"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Bersihkan</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative mb-2 shrink-0">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari teks, tautan, kode, atau gambar..."
          className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800/80 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Item List / Cards */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 pr-0.5 min-h-0">
        <AnimatePresence initial={false}>
          {filteredItems.map((item) => {
            const isCopied = copiedId === item.id;
            const isLink = item.itemType === 'link';
            const isColor = item.itemType === 'color';
            const isCode = item.itemType === 'code';
            const isImage = item.itemType === 'image';

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                onClick={() => handleCopy(item)}
                className={`group relative flex flex-col p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isCopied
                    ? 'bg-emerald-950/30 border-emerald-500/50 shadow-sm'
                    : item.isPinned
                    ? 'bg-gradient-to-r from-amber-950/20 via-zinc-900/90 to-zinc-900/90 border-amber-500/30 hover:border-amber-400/50'
                    : 'bg-zinc-900/80 hover:bg-zinc-800/80 border-zinc-800/80 hover:border-zinc-700/80'
                }`}
              >
                {/* Header row of card: Type tag & Action buttons */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Item type icon / indicator */}
                    {isImage && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/40 text-[9px] font-mono">
                        <ImageIcon className="w-2.5 h-2.5" />
                        <span>Gambar</span>
                      </span>
                    )}
                    {isColor && (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[9px] text-zinc-300 font-mono font-medium">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0 shadow-xs"
                          style={{ backgroundColor: item.colorHex || item.content }}
                        />
                        <span>{item.colorHex || 'Warna'}</span>
                      </div>
                    )}
                    {isLink && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/50 text-sky-300 border border-sky-800/40 text-[9px] font-mono">
                        <Globe className="w-2.5 h-2.5" />
                        <span>Tautan</span>
                      </span>
                    )}
                    {isCode && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/50 text-purple-300 border border-purple-800/40 text-[9px] font-mono">
                        <Code2 className="w-2.5 h-2.5" />
                        <span>Kode</span>
                      </span>
                    )}
                    {!isImage && !isColor && !isLink && !isCode && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[9px]">
                        <FileText className="w-2.5 h-2.5" />
                        <span>Teks</span>
                      </span>
                    )}

                    <span className="text-[10px] text-zinc-500 font-mono">
                      {formatTimeAgo(item.timestamp)}
                    </span>
                    {!isImage && (
                      <>
                        <span className="text-zinc-600 text-[9px]">·</span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {item.charCount} kar
                        </span>
                      </>
                    )}
                  </div>

                  {/* Actions Row: Pin, Salin, Hapus (directly visible) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Save image to disk */}
                    {isImage && (
                      <button
                        onClick={(e) => handleSaveImage(item, e)}
                        className="p-1 rounded-md bg-zinc-800 hover:bg-emerald-950 hover:text-emerald-300 text-zinc-400 transition-colors cursor-pointer"
                        title="Simpan gambar ke berkas PNG"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    )}

                    {/* Open link button if item is link */}
                    {isLink && (
                      <button
                        onClick={(e) => handleOpenLink(item.content, e)}
                        className="p-1 rounded-md bg-zinc-800 hover:bg-sky-950 hover:text-sky-300 text-zinc-400 transition-colors cursor-pointer"
                        title="Buka tautan di peramban"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}

                    {/* Pin button */}
                    <button
                      onClick={(e) => handleTogglePin(item, e)}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        item.isPinned
                          ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-300'
                      }`}
                      title={item.isPinned ? 'Lepas pin' : 'Sematkan (Pin permanen)'}
                    >
                      <Pin className={`w-3 h-3 ${item.isPinned ? 'fill-amber-400' : ''}`} />
                    </button>

                    {/* Copy feedback button */}
                    <button
                      onClick={(e) => handleCopy(item, e)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                        isCopied
                          ? 'bg-emerald-500 text-black font-semibold shadow-xs'
                          : 'bg-zinc-800 hover:bg-cyan-500 hover:text-black text-zinc-300'
                      }`}
                      title={isImage ? 'Salin gambar ke papan klip' : 'Salin teks ke papan klip'}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-2.5 h-2.5" />
                          <span>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>

                    {/* Delete button: ALWAYS directly visible */}
                    <button
                      onClick={(e) => handleDelete(item, e)}
                      className="p-1 rounded-md bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                      title="Hapus klip ini"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Content preview */}
                {isImage ? (
                  <div className="flex flex-col gap-1 mt-0.5">
                    {item.imageDataUrl ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLightboxImage(item.imageDataUrl || null);
                        }}
                        className="relative group/img overflow-hidden rounded-lg border border-white/10 bg-black/50 max-h-40 flex items-center justify-center cursor-zoom-in"
                      >
                        <img
                          src={item.imageDataUrl}
                          alt={item.preview}
                          className="max-h-40 w-auto object-contain transition-transform duration-200 group-hover/img:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="text-[9.5px] bg-black/80 text-white px-2 py-0.5 rounded-full backdrop-blur-xs flex items-center gap-1 shadow-md">
                            <Maximize2 className="w-2.5 h-2.5" />
                            <span>Lihat Penuh</span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800 text-xs text-zinc-400">
                        <ImageIcon className="w-4 h-4 text-zinc-500" />
                        <span>{item.preview}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[9.5px] text-zinc-400 font-mono">
                      {item.imageWidth && item.imageHeight && (
                        <span>{item.imageWidth} × {item.imageHeight} px</span>
                      )}
                      {item.imageSizeBytes && (
                        <>
                          <span>•</span>
                          <span>{formatFileSize(item.imageSizeBytes)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`text-xs text-zinc-300 line-clamp-3 leading-relaxed break-all select-text font-sans ${
                      isCode ? 'font-mono text-[11px] bg-black/40 p-1.5 rounded-lg border border-white/5' : ''
                    }`}
                  >
                    {item.preview}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty States */}
        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2.5 shadow-sm">
              {searchQuery ? (
                <Search className="w-5 h-5 text-zinc-500" />
              ) : filterType === 'pinned' ? (
                <Pin className="w-5 h-5 text-amber-500/60" />
              ) : filterType === 'images' ? (
                <ImageIcon className="w-5 h-5 text-emerald-500/60" />
              ) : (
                <ClipboardList className="w-5 h-5 text-cyan-500/60" />
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-300 mb-1">
              {searchQuery
                ? 'Tidak ada klip yang cocok'
                : filterType === 'pinned'
                ? 'Belum ada klip yang disematkan'
                : filterType === 'images'
                ? 'Belum ada gambar yang disalin'
                : 'Papan klip masih kosong'}
            </p>
            <p className="text-[11px] text-zinc-500 max-w-[270px] leading-relaxed">
              {searchQuery
                ? `Tidak ditemukan riwayat yang memuat "${searchQuery}". Coba kata kunci lain.`
                : filterType === 'pinned'
                ? 'Klik ikon pin pada item klip apa pun untuk menyimpannya secara permanen melintasi restart.'
                : filterType === 'images'
                ? 'Gunakan Win + Shift + S atau klik kanan Salin Gambar di web / chat. Gambar akan langsung muncul di sini.'
                : 'Salin teks, foto/screenshot, atau tautan apa pun (Ctrl+C). Hovera akan otomatis mencatatnya di sini.'}
            </p>
          </div>
        )}
      </div>

      {/* Subtle Session Policy Footer Note */}
      <div className="pt-1.5 mt-1 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 shrink-0 px-1">
        <span className="flex items-center gap-1">
          <Info className="w-3 h-3 text-zinc-500 shrink-0" />
          <span>Sesi aktif: Otomatis dibersihkan saat Hovera ditutup (item pin tetap aman).</span>
        </span>
      </div>

      {/* Lightbox Image Preview Modal */}
      <AnimatePresence>
        {selectedLightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedLightboxImage(null)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center justify-center"
            >
              <button
                onClick={() => setSelectedLightboxImage(null)}
                className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center border border-zinc-700 shadow-lg cursor-pointer z-10"
                title="Tutup pratinjau"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={selectedLightboxImage}
                alt="Pratinjau Penuh"
                className="max-w-full max-h-[80vh] object-contain rounded-xl border border-white/10 shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
