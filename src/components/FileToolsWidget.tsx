import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Image as ImageIcon,
  Layers,
  Upload,
  CheckCircle2,
  FolderOpen,
  ExternalLink,
  Trash2,
  Sliders,
  Sparkles,
  Loader2,
  FileArchive,
  RefreshCw,
  Zap,
  X,
  ArrowRight,
} from 'lucide-react';
import {
  compressImage,
  formatBytes,
  type CompressOptions,
  type CompressedImageResult,
} from '../utils/imageCompressor';
import { mergeImagesToPdf, type ImageToMerge } from '../utils/pdfMerger';

type ToolSubTab = 'compress-image' | 'compress-pdf' | 'doc-to-pdf' | 'convert-format' | 'images-to-pdf';

interface SelectedFileItem {
  id: string;
  name: string;
  path?: string;
  size: number;
  file?: File;
  previewUrl?: string;
  category: 'image' | 'pdf' | 'office' | 'other';
}

export const FileToolsWidget: React.FC<{
  initialFiles?: File[];
  initialPaths?: string[];
  onInitialFilesHandled?: () => void;
}> = ({ initialFiles, initialPaths, onInitialFilesHandled }) => {
  const [subTab, setSubTab] = useState<ToolSubTab>('compress-image');

  // Smart Action Hub state when user drops a file
  const [activeDroppedItem, setActiveDroppedItem] = useState<SelectedFileItem | null>(null);

  // Office Engine Status
  const [officeStatus, setOfficeStatus] = useState<{
    word: boolean;
    excel: boolean;
    powerpoint: boolean;
    available: boolean;
  }>({ word: false, excel: false, powerpoint: false, available: false });

  useEffect(() => {
    if (window.electronAPI?.checkOfficeInstalled) {
      window.electronAPI.checkOfficeInstalled().then(setOfficeStatus).catch(() => {});
    }
  }, []);

  // -------------------------------------------------------------
  // 1. STATE: KOMPRES FOTO
  // -------------------------------------------------------------
  const [compressFiles, setCompressFiles] = useState<SelectedFileItem[]>([]);
  const [compressionQuality, setCompressionQuality] = useState<number>(80);
  const [targetFormat, setTargetFormat] = useState<'original' | 'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressProgress, setCompressProgress] = useState<string>('');
  const [compressedResults, setCompressedResults] = useState<{
    [id: string]: {
      result: CompressedImageResult;
      savedPath?: string;
      savedName?: string;
    };
  }>({});

  // -------------------------------------------------------------
  // 2. STATE: KOMPRES PDF (NEW!)
  // -------------------------------------------------------------
  const [pdfFiles, setPdfFiles] = useState<SelectedFileItem[]>([]);
  const [isCompressingPdf, setIsCompressingPdf] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<string>('');
  const [pdfResults, setPdfResults] = useState<{
    [id: string]: {
      success: boolean;
      pdfPath?: string;
      pdfName?: string;
      originalSize?: number;
      compressedSize?: number;
      savingsPercent?: number;
      error?: string;
    };
  }>({});

  // -------------------------------------------------------------
  // 3. STATE: DOKUMEN KE PDF
  // -------------------------------------------------------------
  const [docFiles, setDocFiles] = useState<SelectedFileItem[]>([]);
  const [isConvertingDoc, setIsConvertingDoc] = useState<boolean>(false);
  const [docProgress, setDocProgress] = useState<string>('');
  const [docResults, setDocResults] = useState<{
    [id: string]: {
      success: boolean;
      pdfPath?: string;
      pdfName?: string;
      error?: string;
    };
  }>({});

  // -------------------------------------------------------------
  // 4. STATE: KONVERSI FORMAT GAMBAR
  // -------------------------------------------------------------
  const [formatFiles, setFormatFiles] = useState<SelectedFileItem[]>([]);
  const [formatTarget, setFormatTarget] = useState<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  const [isConvertingFormat, setIsConvertingFormat] = useState<boolean>(false);
  const [formatResults, setFormatResults] = useState<{
    [id: string]: {
      savedPath?: string;
      savedName?: string;
      newSize?: number;
    };
  }>({});

  // -------------------------------------------------------------
  // 5. STATE: GABUNG FOTO KE PDF
  // -------------------------------------------------------------
  const [mergeImages, setMergeImages] = useState<SelectedFileItem[]>([]);
  const [mergePageSize, setMergePageSize] = useState<'a4' | 'fit'>('a4');
  const [isMergingPdf, setIsMergingPdf] = useState<boolean>(false);
  const [mergePdfResult, setMergePdfResult] = useState<{
    savedPath?: string;
    savedName?: string;
  } | null>(null);

  // Helper to categorize files
  const categorizeFile = (filename: string): 'image' | 'pdf' | 'office' | 'other' => {
    const lower = filename.toLowerCase();
    if (/\.(png|jpg|jpeg|webp|svg|bmp|gif)$/i.test(lower)) return 'image';
    if (/\.pdf$/i.test(lower)) return 'pdf';
    if (/\.(docx|doc|xlsx|xls|pptx|ppt|txt|md)$/i.test(lower)) return 'office';
    return 'other';
  };

  const revokeItemPreview = (item?: SelectedFileItem) => {
    if (item?.previewUrl && item.previewUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(item.previewUrl);
      } catch {}
    }
  };

  const compressFilesRef = React.useRef(compressFiles);
  const formatFilesRef = React.useRef(formatFiles);
  const mergeImagesRef = React.useRef(mergeImages);
  const compressedResultsRef = React.useRef(compressedResults);

  useEffect(() => {
    compressFilesRef.current = compressFiles;
    formatFilesRef.current = formatFiles;
    mergeImagesRef.current = mergeImages;
    compressedResultsRef.current = compressedResults;
  });

  useEffect(() => {
    return () => {
      compressFilesRef.current.forEach(revokeItemPreview);
      formatFilesRef.current.forEach(revokeItemPreview);
      mergeImagesRef.current.forEach(revokeItemPreview);
      Object.values(compressedResultsRef.current).forEach((item) => {
        if (item?.result?.previewUrl && item.result.previewUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(item.result.previewUrl);
          } catch {}
        }
      });
      window.electronAPI?.trimMemory?.();
    };
  }, []);

  const handleNewItemsArrived = React.useCallback((items: SelectedFileItem[]) => {
    if (items.length === 0) return;

    // Set the first item as active dropped item to show Smart Action Hub
    const first = items[0];
    setActiveDroppedItem(first);

    // Prepopulate relevant tabs
    if (first.category === 'image') {
      setCompressFiles((prev) => [...prev, ...items]);
      setFormatFiles((prev) => [...prev, ...items]);
      setSubTab('compress-image');
    } else if (first.category === 'pdf') {
      setPdfFiles((prev) => [...prev, ...items]);
      setSubTab('compress-pdf');
    } else if (first.category === 'office') {
      setDocFiles((prev) => [...prev, ...items]);
      setSubTab('doc-to-pdf');
    }
  }, []);

  // Process dropped native paths from Windows Explorer
  useEffect(() => {
    if (initialPaths && initialPaths.length > 0) {
      const items: SelectedFileItem[] = initialPaths.map((p) => {
        const name = p.split(/[/\\]/).pop() || p;
        return {
          id: Math.random().toString(36).substring(2, 9),
          name,
          path: p,
          size: 0,
          category: categorizeFile(name),
        };
      });

      handleNewItemsArrived(items);
      if (onInitialFilesHandled) onInitialFilesHandled();
    }
  }, [initialPaths, handleNewItemsArrived, onInitialFilesHandled]);

  // Process dropped HTML5 File objects
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      const items: SelectedFileItem[] = initialFiles.map((f) => ({
        id: Math.random().toString(36).substring(2, 9),
        name: f.name,
        path: (f as any).path || undefined,
        size: f.size,
        file: f,
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        category: categorizeFile(f.name),
      }));

      handleNewItemsArrived(items);
      if (onInitialFilesHandled) onInitialFilesHandled();
    }
  }, [initialFiles, handleNewItemsArrived, onInitialFilesHandled]);

  // -------------------------------------------------------------
  // HANDLERS FOR FILE PICKERS
  // -------------------------------------------------------------
  const handlePickCompressFiles = async () => {
    if (window.electronAPI?.pickFilesDialog) {
      const picked = await window.electronAPI.pickFilesDialog('images');
      if (picked && picked.length > 0) {
        const items: SelectedFileItem[] = picked.map((p) => ({
          id: Math.random().toString(36).substring(2, 9),
          name: p.name,
          path: p.path,
          size: p.size,
          category: 'image',
        }));
        setCompressFiles((prev) => [...prev, ...items]);
      }
    }
  };

  const handlePickPdfFiles = async () => {
    if (window.electronAPI?.pickFilesDialog) {
      const picked = await window.electronAPI.pickFilesDialog('all');
      if (picked && picked.length > 0) {
        const items: SelectedFileItem[] = picked
          .filter((p) => p.extension === 'pdf')
          .map((p) => ({
            id: Math.random().toString(36).substring(2, 9),
            name: p.name,
            path: p.path,
            size: p.size,
            category: 'pdf',
          }));
        setPdfFiles((prev) => [...prev, ...items]);
      }
    }
  };

  const handlePickDocFiles = async () => {
    if (window.electronAPI?.pickFilesDialog) {
      const picked = await window.electronAPI.pickFilesDialog('docs');
      if (picked && picked.length > 0) {
        const items: SelectedFileItem[] = picked.map((p) => ({
          id: Math.random().toString(36).substring(2, 9),
          name: p.name,
          path: p.path,
          size: p.size,
          category: 'office',
        }));
        setDocFiles((prev) => [...prev, ...items]);
      }
    }
  };

  const handlePickFormatFiles = async () => {
    if (window.electronAPI?.pickFilesDialog) {
      const picked = await window.electronAPI.pickFilesDialog('images');
      if (picked && picked.length > 0) {
        const items: SelectedFileItem[] = picked.map((p) => ({
          id: Math.random().toString(36).substring(2, 9),
          name: p.name,
          path: p.path,
          size: p.size,
          category: 'image',
        }));
        setFormatFiles((prev) => [...prev, ...items]);
      }
    }
  };

  const handlePickMergeImages = async () => {
    if (window.electronAPI?.pickFilesDialog) {
      const picked = await window.electronAPI.pickFilesDialog('images');
      if (picked && picked.length > 0) {
        const items: SelectedFileItem[] = picked.map((p) => ({
          id: Math.random().toString(36).substring(2, 9),
          name: p.name,
          path: p.path,
          size: p.size,
          category: 'image',
        }));
        setMergeImages((prev) => [...prev, ...items]);
      }
    }
  };

  // -------------------------------------------------------------
  // EXECUTE: KOMPRES FOTO & SIMPAN OTOMATIS
  // -------------------------------------------------------------
  const handleExecuteCompress = async () => {
    if (compressFiles.length === 0 || isCompressing) return;
    setIsCompressing(true);
    setCompressProgress('Memulai kompresi...');

    const options: CompressOptions = {
      quality: compressionQuality / 100,
      maxWidth: compressionQuality < 60 ? 1600 : compressionQuality < 85 ? 1920 : undefined,
      format: targetFormat,
    };

    const newResults = { ...compressedResults };

    try {
      for (let i = 0; i < compressFiles.length; i++) {
        const item = compressFiles[i];
        setCompressProgress(`Mengompres ${i + 1}/${compressFiles.length}: ${item.name}`);

        const result = await compressImage(
          {
            file: item.file,
            path: item.path,
            name: item.name,
            size: item.size,
          },
          options
        );

        let savedPath: string | undefined = undefined;
        let savedName: string | undefined = undefined;

        if (window.electronAPI?.saveFileInSameFolder) {
          const suffix = `_compressed`;
          const saveRes = await window.electronAPI.saveFileInSameFolder({
            sourcePath: item.path || item.name,
            suffix,
            targetExt: result.ext,
            base64Data: result.base64,
          });

          if (saveRes && saveRes.success) {
            savedPath = saveRes.filePath;
            savedName = saveRes.fileName;
          }
        }

        newResults[item.id] = {
          result,
          savedPath,
          savedName,
        };
      }

      setCompressedResults(newResults);
      setCompressProgress('Selesai! Berkas disimpan di folder asal.');
    } catch (err: any) {
      setCompressProgress(`Gagal: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsCompressing(false);
      window.electronAPI?.trimMemory?.();
    }
  };

  // -------------------------------------------------------------
  // EXECUTE: KOMPRES PDF (NEW!)
  // -------------------------------------------------------------
  const handleExecuteCompressPdf = async () => {
    if (pdfFiles.length === 0 || isCompressingPdf) return;
    setIsCompressingPdf(true);
    setPdfProgress('Memulai kompresi PDF...');

    const newResults = { ...pdfResults };

    try {
      for (let i = 0; i < pdfFiles.length; i++) {
        const item = pdfFiles[i];
        setPdfProgress(`Mengompres ${i + 1}/${pdfFiles.length}: ${item.name}`);

        if (item.path && window.electronAPI?.compressPdfFile) {
          try {
            const res = await window.electronAPI.compressPdfFile(item.path);
            if (res && res.success) {
              newResults[item.id] = {
                success: true,
                pdfPath: res.filePath,
                pdfName: res.fileName,
                originalSize: res.originalSize,
                compressedSize: res.compressedSize,
                savingsPercent: res.savingsPercent,
              };
            }
          } catch (err: any) {
            newResults[item.id] = {
              success: false,
              error: err.message || 'Gagal kompresi PDF',
            };
          }
        } else {
          newResults[item.id] = {
            success: false,
            error: 'Jalur file tidak tersedia untuk kompresi native',
          };
        }
      }

      setPdfResults(newResults);
      setPdfProgress('Selesai! Berkas PDF terkompresi tersimpan di folder asal.');
    } catch (err: any) {
      setPdfProgress(`Gagal: ${err.message}`);
    } finally {
      setIsCompressingPdf(false);
      window.electronAPI?.trimMemory?.();
    }
  };

  // -------------------------------------------------------------
  // EXECUTE: DOKUMEN KE PDF VIA NATIVE OFFICE COM
  // -------------------------------------------------------------
  const handleExecuteDocToPdf = async () => {
    if (docFiles.length === 0 || isConvertingDoc) return;
    setIsConvertingDoc(true);
    setDocProgress('Memulai konversi dokumen...');

    const newResults = { ...docResults };

    try {
      for (let i = 0; i < docFiles.length; i++) {
        const item = docFiles[i];
        setDocProgress(`Mengonversi ${i + 1}/${docFiles.length}: ${item.name}`);

        if (item.path && window.electronAPI?.convertOfficeToPdf) {
          try {
            const res = await window.electronAPI.convertOfficeToPdf(item.path);
            if (res && res.success) {
              newResults[item.id] = {
                success: true,
                pdfPath: res.filePath,
                pdfName: res.fileName,
              };
            }
          } catch (err: any) {
            newResults[item.id] = {
              success: false,
              error: err.message || 'Gagal konversi via Office COM',
            };
          }
        } else {
          newResults[item.id] = {
            success: false,
            error: 'Jalur file tidak tersedia untuk konversi native',
          };
        }
      }

      setDocResults(newResults);
      setDocProgress('Selesai! Berkas PDF tersimpan di folder asal.');
    } catch (err: any) {
      setDocProgress(`Gagal: ${err.message}`);
    } finally {
      setIsConvertingDoc(false);
      window.electronAPI?.trimMemory?.();
    }
  };

  // -------------------------------------------------------------
  // EXECUTE: KONVERSI FORMAT GAMBAR
  // -------------------------------------------------------------
  const handleExecuteFormatConvert = async () => {
    if (formatFiles.length === 0 || isConvertingFormat) return;
    setIsConvertingFormat(true);

    const newResults = { ...formatResults };

    try {
      for (const item of formatFiles) {
        const res = await compressImage(
          {
            file: item.file,
            path: item.path,
            name: item.name,
            size: item.size,
          },
          {
            format: formatTarget,
            quality: 0.9,
          }
        );

        if (window.electronAPI?.saveFileInSameFolder) {
          const saveRes = await window.electronAPI.saveFileInSameFolder({
            sourcePath: item.path || item.name,
            suffix: '_converted',
            targetExt: res.ext,
            base64Data: res.base64,
          });

          if (saveRes && saveRes.success) {
            newResults[item.id] = {
              savedPath: saveRes.filePath,
              savedName: saveRes.fileName,
              newSize: res.compressedSize,
            };
          }
        }
      }
      setFormatResults(newResults);
    } catch (err: any) {
      alert(`Gagal konversi format: ${err.message}`);
    } finally {
      setIsConvertingFormat(false);
      window.electronAPI?.trimMemory?.();
    }
  };

  // -------------------------------------------------------------
  // EXECUTE: GABUNG FOTO KE PDF
  // -------------------------------------------------------------
  const handleExecuteMergePdf = async () => {
    if (mergeImages.length === 0 || isMergingPdf) return;
    setIsMergingPdf(true);

    try {
      const itemsToMerge: ImageToMerge[] = mergeImages.map((m) => ({
        id: m.id,
        name: m.name,
        file: m.file,
        path: m.path,
        dataUrl: m.previewUrl,
      }));

      const { base64 } = await mergeImagesToPdf(itemsToMerge, {
        pageSize: mergePageSize,
        marginPt: 20,
      });

      const firstItem = mergeImages[0];
      const sourcePath = firstItem.path || 'dokumen.pdf';

      if (window.electronAPI?.saveFileInSameFolder) {
        const saveRes = await window.electronAPI.saveFileInSameFolder({
          sourcePath,
          suffix: '',
          targetExt: 'pdf',
          base64Data: `data:application/pdf;base64,${base64}`,
        });

        if (saveRes && saveRes.success) {
          setMergePdfResult({
            savedPath: saveRes.filePath,
            savedName: saveRes.fileName,
          });
        }
      }
    } catch (err: any) {
      alert(`Gagal membuat PDF: ${err.message}`);
    } finally {
      setIsMergingPdf(false);
      window.electronAPI?.trimMemory?.();
    }
  };

  const moveMergeItem = (index: number, direction: 'up' | 'down') => {
    const next = [...mergeImages];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setMergeImages(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 text-white select-none overflow-hidden"
    >
      {/* SMART ACTION HUB BANNER WHEN A FILE WAS DROPPED */}
      {activeDroppedItem && (
        <div className="mb-2 p-2 rounded-xl bg-gradient-to-r from-cyan-950/70 via-purple-950/70 to-zinc-900 border border-cyan-500/40 shadow-lg flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-zinc-100 truncate">
                Berkas Terdeteksi: <span className="text-cyan-300">{activeDroppedItem.name}</span>
              </p>
              <p className="text-[9.5px] text-zinc-400">
                Pilih tindakan yang ingin Anda lakukan untuk berkas ini:
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            {activeDroppedItem.category === 'image' && (
              <>
                <button
                  onClick={() => {
                    setSubTab('compress-image');
                    setActiveDroppedItem(null);
                  }}
                  className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-[10px] text-cyan-200 font-medium flex items-center gap-1"
                >
                  <Zap className="w-2.5 h-2.5 text-cyan-400" />
                  <span>Kompres</span>
                </button>
                <button
                  onClick={() => {
                    setSubTab('convert-format');
                    setActiveDroppedItem(null);
                  }}
                  className="px-2 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-[10px] text-purple-200 font-medium flex items-center gap-1"
                >
                  <RefreshCw className="w-2.5 h-2.5 text-purple-400" />
                  <span>Ubah Format</span>
                </button>
              </>
            )}

            {activeDroppedItem.category === 'pdf' && (
              <button
                onClick={() => {
                  setSubTab('compress-pdf');
                  setActiveDroppedItem(null);
                }}
                className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-[10px] text-rose-200 font-medium flex items-center gap-1"
              >
                <Zap className="w-2.5 h-2.5 text-rose-400" />
                <span>Kompres PDF</span>
              </button>
            )}

            {activeDroppedItem.category === 'office' && (
              <button
                onClick={() => {
                  setSubTab('doc-to-pdf');
                  setActiveDroppedItem(null);
                }}
                className="px-2 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-[10px] text-purple-200 font-medium flex items-center gap-1"
              >
                <FileText className="w-2.5 h-2.5 text-purple-400" />
                <span>Jadikan PDF</span>
              </button>
            )}

            <button
              onClick={() => setActiveDroppedItem(null)}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Tutup Saran"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Sub Tabs Navigation (Compact 5 Tabs) */}
      <div
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY * 0.8;
          }
        }}
        className="flex items-center gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800/80 mb-2.5 shrink-0 overflow-x-auto custom-scrollbar"
      >
        <button
          onClick={() => setSubTab('compress-image')}
          className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-medium transition-all flex items-center justify-center gap-1 shrink-0 ${
            subTab === 'compress-image'
              ? 'bg-zinc-800 text-cyan-300 shadow-sm border border-cyan-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <ImageIcon className="w-3 h-3" />
          <span>Kompres Foto</span>
        </button>

        <button
          onClick={() => setSubTab('compress-pdf')}
          className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-medium transition-all flex items-center justify-center gap-1 shrink-0 ${
            subTab === 'compress-pdf'
              ? 'bg-zinc-800 text-rose-300 shadow-sm border border-rose-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileArchive className="w-3 h-3" />
          <span>Kompres PDF</span>
        </button>

        <button
          onClick={() => setSubTab('convert-format')}
          className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-medium transition-all flex items-center justify-center gap-1 shrink-0 ${
            subTab === 'convert-format'
              ? 'bg-zinc-800 text-amber-300 shadow-sm border border-amber-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          <span>Ubah Format</span>
        </button>

        <button
          onClick={() => setSubTab('doc-to-pdf')}
          className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-medium transition-all flex items-center justify-center gap-1 shrink-0 ${
            subTab === 'doc-to-pdf'
              ? 'bg-zinc-800 text-purple-300 shadow-sm border border-purple-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-3 h-3" />
          <span>Word ke PDF</span>
        </button>

        <button
          onClick={() => setSubTab('images-to-pdf')}
          className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-medium transition-all flex items-center justify-center gap-1 shrink-0 ${
            subTab === 'images-to-pdf'
              ? 'bg-zinc-800 text-emerald-300 shadow-sm border border-emerald-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Foto ke PDF</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 1: KOMPRES FOTO */}
      {/* ------------------------------------------------------------- */}
      {subTab === 'compress-image' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar text-[12px] pb-2">
          {/* File Picker / Drop Zone */}
          <div
            onClick={handlePickCompressFiles}
            className="border-2 border-dashed border-zinc-700/70 hover:border-cyan-500/50 bg-zinc-900/50 hover:bg-zinc-900/90 rounded-2xl p-2.5 text-center cursor-pointer transition-all group"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="w-7 h-7 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <Upload className="w-3.5 h-3.5" />
              </div>
              <p className="font-medium text-zinc-200 text-[11px]">
                Klik atau jatuhkan foto (PNG, JPG, WebP) ke sini
              </p>
              <p className="text-[9.5px] text-zinc-400">
                Pilih beberapa foto sekaligus. Otomatis disimpan di folder yang sama.
              </p>
            </div>
          </div>

          {/* Selected Files List */}
          {compressFiles.length > 0 && (
            <div className="bg-zinc-900/60 rounded-xl p-2.5 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span>Daftar Foto ({compressFiles.length})</span>
                <button
                  onClick={() => {
                    setCompressFiles([]);
                    setCompressedResults({});
                  }}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  Hapus Semua
                </button>
              </div>

              <div className="max-h-32 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {compressFiles.map((item) => {
                  const res = compressedResults[item.id];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ImageIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-200">{item.name}</p>
                          <p className="text-[10px] text-zinc-400 flex items-center flex-wrap gap-1">
                            <span>{formatBytes(item.size)}</span>
                            {res && (
                              <span className="text-emerald-400 font-mono font-semibold inline-flex items-center gap-0.5">
                                <ArrowRight className="w-2.5 h-2.5" />
                                <span>{formatBytes(res.result.compressedSize)} (-{res.result.savingsPercent}%)</span>
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {res?.savedPath ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => window.electronAPI?.openFile?.(res.savedPath!)}
                              title="Buka Berkas"
                              className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-[10px] text-zinc-200 flex items-center gap-1"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Lihat</span>
                            </button>
                            <button
                              onClick={() => window.electronAPI?.showInFolder?.(res.savedPath!)}
                              title="Buka di Folder"
                              className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                            >
                              <FolderOpen className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setCompressFiles((prev) => prev.filter((f) => f.id !== item.id))
                            }
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SLIDER TINGKAT KOMPRESI */}
          <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200 text-[11px] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Kualitas Kompresi:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400">
                  {compressionQuality <= 35
                    ? 'Hemat Ekstrem (Ukuran Sangat Kecil)'
                    : compressionQuality <= 65
                    ? 'Hemat Tinggi (~75% Lebih Ringan)'
                    : compressionQuality <= 85
                    ? 'Seimbang / Rekomendasi (Jernih)'
                    : 'Kualitas Tinggi (Minimal Kompresi)'}
                </span>
                <span className="text-[11px] font-bold text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/30">
                  {compressionQuality}%
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <input
                type="range"
                min={10}
                max={95}
                step={1}
                value={compressionQuality}
                onChange={(e) => setCompressionQuality(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
              <div className="flex justify-between text-[9px] text-zinc-500 px-0.5">
                <span>10% (Paling Kecil)</span>
                <span>50% (Hemat)</span>
                <span>80% (Seimbang)</span>
                <span>95% (Maksimal)</span>
              </div>
            </div>

            {/* Target Output Format */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px]">
              <span className="text-zinc-400">Format Hasil:</span>
              <div className="flex items-center gap-1">
                {(['image/webp', 'image/jpeg', 'image/png'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setTargetFormat(fmt)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                      targetFormat === fmt
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {fmt === 'image/webp' ? 'WebP (Hemat)' : fmt === 'image/jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleExecuteCompress}
            disabled={compressFiles.length === 0 || isCompressing}
            className={`w-full py-2.5 rounded-xl font-semibold text-[11.5px] flex items-center justify-center gap-2 transition-all ${
              compressFiles.length === 0 || isCompressing
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-lg shadow-cyan-500/20 active:scale-[0.99]'
            }`}
          >
            {isCompressing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                <span>{compressProgress || 'Mengompres...'}</span>
              </>
            ) : (
              <span>Mulai Kompres & Simpan Semua</span>
            )}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 2: KOMPRES PDF (NEW!) */}
      {/* ------------------------------------------------------------- */}
      {subTab === 'compress-pdf' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar text-[12px] pb-2">
          <div
            onClick={handlePickPdfFiles}
            className="border-2 border-dashed border-zinc-700/70 hover:border-rose-500/50 bg-zinc-900/50 hover:bg-zinc-900/90 rounded-2xl p-2.5 text-center cursor-pointer transition-all group"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="w-7 h-7 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
                <FileArchive className="w-3.5 h-3.5" />
              </div>
              <p className="font-medium text-zinc-200 text-[11px]">
                Pilih Berkas PDF untuk Dikompresi
              </p>
              <p className="text-[9.5px] text-zinc-400">
                Mengompres aliran stream & menghapus data tak terpakai tanpa merusak teks/dokumen.
              </p>
            </div>
          </div>

          {pdfFiles.length > 0 && (
            <div className="bg-zinc-900/60 rounded-xl p-2.5 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span>Daftar PDF ({pdfFiles.length})</span>
                <button
                  onClick={() => {
                    setPdfFiles([]);
                    setPdfResults({});
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  Hapus Semua
                </button>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {pdfFiles.map((item) => {
                  const res = pdfResults[item.id];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileArchive className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-200">{item.name}</p>
                          <p className="text-[10px] text-zinc-400 flex items-center flex-wrap gap-1">
                            <span>{item.size > 0 ? formatBytes(item.size) : 'PDF Document'}</span>
                            {res?.success && res.compressedSize !== undefined && (
                              <span className="text-emerald-400 font-mono font-semibold inline-flex items-center gap-0.5">
                                <ArrowRight className="w-2.5 h-2.5" />
                                <span>{formatBytes(res.compressedSize)} (-{res.savingsPercent}%)</span>
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {res?.success && res.pdfPath ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => window.electronAPI?.openFile?.(res.pdfPath!)}
                              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-[10px] text-white flex items-center gap-1"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Lihat</span>
                            </button>
                            <button
                              onClick={() => window.electronAPI?.showInFolder?.(res.pdfPath!)}
                              className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                              title="Buka di Folder"
                            >
                              <FolderOpen className="w-3 h-3" />
                            </button>
                          </div>
                        ) : res?.error ? (
                          <span className="text-red-400 text-[10px]">{res.error}</span>
                        ) : (
                          <button
                            onClick={() =>
                              setPdfFiles((prev) => prev.filter((f) => f.id !== item.id))
                            }
                            className="p-1 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[10px] text-zinc-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Hasil kompresi otomatis dinamai <strong>_compressed.pdf</strong> di folder yang sama.</span>
          </div>

          <button
            onClick={handleExecuteCompressPdf}
            disabled={pdfFiles.length === 0 || isCompressingPdf}
            className={`w-full py-2.5 rounded-xl font-semibold text-[11.5px] flex items-center justify-center gap-2 transition-all ${
              pdfFiles.length === 0 || isCompressingPdf
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white shadow-lg shadow-rose-500/20 active:scale-[0.99]'
            }`}
          >
            {isCompressingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>{pdfProgress || 'Mengompres PDF...'}</span>
              </>
            ) : (
              <span>Mulai Kompres PDF & Simpan</span>
            )}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 3: UBAH FORMAT GAMBAR */}
      {/* ------------------------------------------------------------- */}
      {subTab === 'convert-format' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar text-[12px] pb-2">
          <div
            onClick={handlePickFormatFiles}
            className="border-2 border-dashed border-zinc-700/70 hover:border-amber-500/50 bg-zinc-900/50 hover:bg-zinc-900/90 rounded-2xl p-2.5 text-center cursor-pointer transition-all group"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <RefreshCw className="w-3.5 h-3.5" />
              </div>
              <p className="font-medium text-zinc-200 text-[11px]">
                Pilih Foto untuk Diubah Format
              </p>
              <p className="text-[9.5px] text-zinc-400">
                Ubah antara PNG, JPG, WebP. Otomatis disimpan di folder yang sama.
              </p>
            </div>
          </div>

          {formatFiles.length > 0 && (
            <div className="bg-zinc-900/60 rounded-xl p-2.5 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span>Daftar Foto ({formatFiles.length})</span>
                <button
                  onClick={() => {
                    setFormatFiles([]);
                    setFormatResults({});
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  Hapus Semua
                </button>
              </div>

              <div className="max-h-32 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {formatFiles.map((item) => {
                  const res = formatResults[item.id];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-200">{item.name}</p>
                          {res && (
                            <p className="text-[10px] text-emerald-400 inline-flex items-center gap-1">
                              <ArrowRight className="w-2.5 h-2.5" />
                              <span>{res.savedName}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {res?.savedPath ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => window.electronAPI?.openFile?.(res.savedPath!)}
                              className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-[10px] text-zinc-200"
                            >
                              Lihat
                            </button>
                            <button
                              onClick={() => window.electronAPI?.showInFolder?.(res.savedPath!)}
                              className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                            >
                              <FolderOpen className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setFormatFiles((prev) => prev.filter((f) => f.id !== item.id))
                            }
                            className="p-1 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target Format Selector */}
          <div className="bg-zinc-900/60 rounded-xl p-2.5 border border-zinc-800/80 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-medium">Ubah Menjadi Format:</span>
              <div className="flex items-center gap-1">
                {(['image/webp', 'image/jpeg', 'image/png'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFormatTarget(fmt)}
                    className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                      formatTarget === fmt
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {fmt === 'image/webp' ? 'WebP (Hemat)' : fmt === 'image/jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleExecuteFormatConvert}
            disabled={formatFiles.length === 0 || isConvertingFormat}
            className={`w-full py-2.5 rounded-xl font-semibold text-[11.5px] flex items-center justify-center gap-2 transition-all ${
              formatFiles.length === 0 || isConvertingFormat
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black shadow-lg shadow-amber-500/20 active:scale-[0.99]'
            }`}
          >
            {isConvertingFormat ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                <span>Mengonversi Format...</span>
              </>
            ) : (
              <span>Konversi Format & Simpan</span>
            )}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 4: DOKUMEN KE PDF */}
      {/* ------------------------------------------------------------- */}
      {subTab === 'doc-to-pdf' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar text-[12px] pb-2">
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-[11px]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-zinc-200 font-medium">
                {officeStatus.available
                  ? `${officeStatus.word ? 'Word ' : ''}${officeStatus.excel ? 'Excel ' : ''}${officeStatus.powerpoint ? 'PPT ' : ''}Native Engine`
                  : 'Microsoft Office Engine'}
              </span>
            </div>
            <span className="text-emerald-400 font-mono text-[10px]">Presisi Asli 100%</span>
          </div>

          <div
            onClick={handlePickDocFiles}
            className="border-2 border-dashed border-zinc-700/70 hover:border-purple-500/50 bg-zinc-900/50 hover:bg-zinc-900/90 rounded-2xl p-2.5 text-center cursor-pointer transition-all group"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <p className="font-medium text-zinc-200 text-[11px]">
                Pilih Berkas Word, Excel, atau PowerPoint
              </p>
              <p className="text-[9.5px] text-zinc-400">
                Mendukung .docx, .doc, .xlsx, .xls, .pptx, .ppt. Otomatis jadi .pdf di folder asal.
              </p>
            </div>
          </div>

          {docFiles.length > 0 && (
            <div className="bg-zinc-900/60 rounded-xl p-2.5 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span>Daftar Dokumen ({docFiles.length})</span>
                <button
                  onClick={() => {
                    setDocFiles([]);
                    setDocResults({});
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  Hapus Semua
                </button>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {docFiles.map((item) => {
                  const res = docResults[item.id];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-200">{item.name}</p>
                          <p className="text-[10px] text-zinc-400 truncate">{item.path || 'Local File'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {res?.success && res.pdfPath ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => window.electronAPI?.openFile?.(res.pdfPath!)}
                              className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-[10px] text-white flex items-center gap-1"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Buka PDF</span>
                            </button>
                            <button
                              onClick={() => window.electronAPI?.showInFolder?.(res.pdfPath!)}
                              className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                              title="Buka Folder"
                            >
                              <FolderOpen className="w-3 h-3" />
                            </button>
                          </div>
                        ) : res?.error ? (
                          <span className="text-red-400 text-[10px]">{res.error}</span>
                        ) : (
                          <button
                            onClick={() =>
                              setDocFiles((prev) => prev.filter((f) => f.id !== item.id))
                            }
                            className="p-1 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={handleExecuteDocToPdf}
            disabled={docFiles.length === 0 || isConvertingDoc}
            className={`w-full py-2.5 rounded-xl font-semibold text-[11.5px] flex items-center justify-center gap-2 transition-all ${
              docFiles.length === 0 || isConvertingDoc
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20 active:scale-[0.99]'
            }`}
          >
            {isConvertingDoc ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>{docProgress || 'Mengonversi...'}</span>
              </>
            ) : (
              <span>Konversi ke PDF Sekarang</span>
            )}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 5: FOTO KE PDF (MERGE IMAGES) */}
      {/* ------------------------------------------------------------- */}
      {subTab === 'images-to-pdf' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar text-[12px] pb-2">
          <div
            onClick={handlePickMergeImages}
            className="border-2 border-dashed border-zinc-700/70 hover:border-emerald-500/50 bg-zinc-900/50 hover:bg-zinc-900/90 rounded-2xl p-2.5 text-center cursor-pointer transition-all group"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <p className="font-medium text-zinc-200 text-[11px]">
                Pilih Foto / Scan untuk Digabung ke PDF
              </p>
              <p className="text-[9.5px] text-zinc-400">
                KTP, kwitansi, struk, dokumen scan. Urutan halaman dapat diatur naik/turun.
              </p>
            </div>
          </div>

          {mergeImages.length > 0 && (
            <div className="bg-zinc-900/60 rounded-xl p-2.5 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span>Urutan Halaman ({mergeImages.length} Halaman)</span>
                <button
                  onClick={() => {
                    setMergeImages([]);
                    setMergePdfResult(null);
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  Hapus Semua
                </button>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {mergeImages.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-[9px] flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <p className="truncate font-medium text-zinc-200">{item.name}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => moveMergeItem(index, 'up')}
                        disabled={index === 0}
                        className={`p-1 rounded ${
                          index === 0 ? 'text-zinc-600' : 'text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveMergeItem(index, 'down')}
                        disabled={index === mergeImages.length - 1}
                        className={`p-1 rounded ${
                          index === mergeImages.length - 1
                            ? 'text-zinc-600'
                            : 'text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        ▼
                      </button>
                      <button
                        onClick={() =>
                          setMergeImages((prev) => prev.filter((_, idx) => idx !== index))
                        }
                        className="p-1 text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Merge Options */}
          <div className="bg-zinc-900/60 rounded-xl p-2 border border-zinc-800/80 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Ukuran Halaman:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMergePageSize('a4')}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                    mergePageSize === 'a4'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Standar A4
                </button>
                <button
                  onClick={() => setMergePageSize('fit')}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                    mergePageSize === 'fit'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Pas Gambar (Fit)
                </button>
              </div>
            </div>
          </div>

          {mergePdfResult?.savedPath && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-emerald-400 font-semibold text-[11px]">PDF Berhasil Dibuat!</p>
                <p className="text-zinc-400 text-[10px] truncate">{mergePdfResult.savedName}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  onClick={() => window.electronAPI?.openFile?.(mergePdfResult.savedPath!)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[10px] flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Buka PDF</span>
                </button>
                <button
                  onClick={() => window.electronAPI?.showInFolder?.(mergePdfResult.savedPath!)}
                  className="p-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                  title="Buka di Folder"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleExecuteMergePdf}
            disabled={mergeImages.length === 0 || isMergingPdf}
            className={`w-full py-2.5 rounded-xl font-semibold text-[11.5px] flex items-center justify-center gap-2 transition-all ${
              mergeImages.length === 0 || isMergingPdf
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black shadow-lg shadow-emerald-500/20 active:scale-[0.99]'
            }`}
          >
            {isMergingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                <span>Menggabungkan PDF...</span>
              </>
            ) : (
              <span>Gabungkan Menjadi 1 File PDF</span>
            )}
          </button>
        </div>
      )}
    </motion.div>
  );
};
