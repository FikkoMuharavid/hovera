import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  Square,
  Plus,
  Search,
  FileText,
  Download,
  Copy,
  Trash2,
  Calendar,
  Clock,
  ArrowLeft,
  Check,
  Globe,
  Sparkles,
} from 'lucide-react';
import { sound } from '../utils/sound';

export interface MeetingNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  durationSeconds?: number;
  language?: string;
}

interface NotesWidgetProps {
  notes: MeetingNote[];
  onSaveNote: (note: MeetingNote) => void;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (note: MeetingNote) => void;

  // Recording props
  isRecording: boolean;
  recordingSeconds: number;
  liveTranscript: string;
  speechLanguage: 'id-ID' | 'en-US';
  onToggleSpeechLanguage: (lang: 'id-ID' | 'en-US') => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClearLiveTranscript: () => void;
  speechError: string | null;
  isTranscribing?: boolean;
}

export const NotesWidget: React.FC<NotesWidgetProps> = ({
  notes,
  onSaveNote,
  onDeleteNote,
  onUpdateNote,
  isRecording,
  recordingSeconds,
  liveTranscript,
  speechLanguage,
  onToggleSpeechLanguage,
  onStartRecording,
  onStopRecording,
  onClearLiveTranscript,
  speechError,
  isTranscribing = false,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Note editor local state
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // Find active note if editing
  const selectedNote = useMemo(() => {
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  const handleOpenNote = (note: MeetingNote) => {
    sound.playClick();
    setSelectedNoteId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const handleCreateNewManualNote = () => {
    sound.playClick();
    const newNote: MeetingNote = {
      id: Date.now().toString(),
      title: `Catatan ${new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onSaveNote(newNote);
    setSelectedNoteId(newNote.id);
    setEditTitle(newNote.title);
    setEditContent('');
  };

  const handleSaveEdit = () => {
    if (!selectedNote) return;
    sound.playSuccess();
    onUpdateNote({
      ...selectedNote,
      title: editTitle.trim() || 'Catatan Tanpa Judul',
      content: editContent,
      updatedAt: Date.now(),
    });
  };

  const handleCopyText = async (text: string, id: string) => {
    sound.playPop();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // fallback
    }
  };

  const handleExportNote = async (note: MeetingNote, format: 'txt' | 'md') => {
    sound.playClick();
    let fileContent = note.content;

    if (format === 'md') {
      const dateStr = new Date(note.createdAt).toLocaleString('id-ID');
      const durStr = note.durationSeconds
        ? `${Math.floor(note.durationSeconds / 60)}m ${note.durationSeconds % 60}s`
        : 'Manual';
      fileContent = `# ${note.title}\n\n- **Tanggal**: ${dateStr}\n- **Durasi Rapat**: ${durStr}\n- **Bahasa**: ${
        note.language === 'en-US' ? 'English (US)' : 'Bahasa Indonesia'
      }\n\n---\n\n## Transkrip & Catatan\n\n${note.content}\n`;
    }

    if (window.electronAPI?.saveNoteFile) {
      const res = await window.electronAPI.saveNoteFile({
        title: note.title,
        content: fileContent,
        format,
      });
      if (res.success) {
        sound.playSuccess();
        setExportSuccessMsg(`Berhasil diexport ke ${format.toUpperCase()}`);
        setTimeout(() => setExportSuccessMsg(null), 2500);
      }
    } else {
      // Browser fallback: download as blob
      const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title || 'catatan'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportSuccessMsg(`Berhasil diunduh (.${format})`);
      setTimeout(() => setExportSuccessMsg(null), 2500);
    }
  };

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  const formatRecDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col h-full w-full select-none justify-between overflow-hidden">
      {/* ================= VIEW: NOTE DETAIL / EDITOR ================= */}
      {selectedNote ? (
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          className="flex flex-col h-full w-full justify-between"
        >
          {/* Editor Header */}
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
            <div className="flex items-center space-x-2 flex-1 mr-2">
              <button
                onClick={() => {
                  handleSaveEdit();
                  setSelectedNoteId(null);
                }}
                className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                title="Kembali ke Daftar Catatan"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveEdit}
                placeholder="Judul Catatan / Meeting..."
                className="bg-transparent text-xs font-semibold text-white focus:outline-none focus:border-b focus:border-sky-500 w-full truncate"
              />
            </div>

            {/* Editor Actions */}
            <div className="flex items-center space-x-1 shrink-0">
              <button
                onClick={() => handleCopyText(editContent, selectedNote.id)}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[10px] transition-colors"
                title="Salin semua teks ke clipboard"
              >
                {copiedId === selectedNote.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Salin</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleExportNote({ ...selectedNote, content: editContent, title: editTitle }, 'txt')}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[10px] transition-colors"
                title="Export sebagai file TXT"
              >
                <Download className="w-3 h-3 text-sky-400" />
                <span>.txt</span>
              </button>

              <button
                onClick={() => handleExportNote({ ...selectedNote, content: editContent, title: editTitle }, 'md')}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[10px] transition-colors"
                title="Export sebagai file Markdown (.md)"
              >
                <Download className="w-3 h-3 text-purple-400" />
                <span>.md</span>
              </button>

              <button
                onClick={() => {
                  sound.playPop();
                  onDeleteNote(selectedNote.id);
                  setSelectedNoteId(null);
                }}
                className="p-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors ml-1"
                title="Hapus Catatan"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Toast info */}
          {exportSuccessMsg && (
            <div className="py-0.5 px-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] rounded-md my-1 text-center font-medium animate-pulse">
              {exportSuccessMsg}
            </div>
          )}

          {/* Note Metadata info */}
          <div className="flex items-center space-x-3 text-[9.5px] text-zinc-500 py-1 border-b border-zinc-900">
            <span className="flex items-center space-x-1">
              <Calendar className="w-2.5 h-2.5" />
              <span>{new Date(selectedNote.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </span>
            {selectedNote.durationSeconds ? (
              <span className="flex items-center space-x-1">
                <Clock className="w-2.5 h-2.5" />
                <span>Durasi: {Math.floor(selectedNote.durationSeconds / 60)}m {selectedNote.durationSeconds % 60}s</span>
              </span>
            ) : null}
            <span>{editContent.trim() ? editContent.trim().split(/\s+/).length : 0} kata</span>
            <span>{editContent.length} karakter</span>
          </div>

          {/* Textarea Editor */}
          <div className="flex-1 mt-1 overflow-hidden">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onBlur={handleSaveEdit}
              placeholder="Ketik atau edit catatan rapat di sini..."
              className="w-full h-full bg-zinc-950/70 border border-zinc-900 rounded-xl p-2.5 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none font-sans leading-relaxed selection:bg-sky-500/30"
              autoFocus
            />
          </div>
        </motion.div>
      ) : (
        /* ================= VIEW: MAIN NOTES & SPEECH TO TEXT RECORDER ================= */
        <div className="flex flex-col h-full w-full justify-between">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
            <div className="flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs text-zinc-200 font-semibold">Catatan & Transkrip Rapat</span>
            </div>

            <div className="flex items-center space-x-1.5">
              {/* Language Selector */}
              <button
                onClick={() => onToggleSpeechLanguage(speechLanguage === 'id-ID' ? 'en-US' : 'id-ID')}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 transition-colors"
                title="Ganti Bahasa Speech-to-Text"
              >
                <Globe className="w-2.5 h-2.5 text-sky-400" />
                <span>{speechLanguage === 'id-ID' ? '🇮🇩 ID' : '🇺🇸 EN'}</span>
              </button>

              {/* Manual Note Button */}
              <button
                onClick={handleCreateNewManualNote}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[10px] transition-colors"
                title="Tulis Catatan Manual Baru"
              >
                <Plus className="w-3 h-3 text-emerald-400" />
                <span>Catatan Baru</span>
              </button>
            </div>
          </div>

          {/* ================= RECORDING / SPEECH-TO-TEXT BAR ================= */}
          <div className="my-1.5 p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-sm flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isRecording
                      ? 'bg-rose-500 text-white animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-semibold text-white">
                      {isRecording ? 'Merekam Suara Rapat...' : 'Transkripsi Suara (Speech to Text)'}
                    </span>
                    {isRecording && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500/25 border border-rose-500/40 text-[9px] font-mono text-rose-300 animate-pulse">
                        LIVE {formatRecDuration(recordingSeconds)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {isRecording
                      ? 'Dengarkan pembicaraan meeting online/offline secara otomatis'
                      : 'Nyalakan saat rapat offline/online untuk mencatat ucapan jadi teks'}
                  </span>
                </div>
              </div>

              {/* Record Action Buttons */}
              <div className="flex items-center space-x-1.5 shrink-0">
                {isRecording ? (
                  <button
                    onClick={onStopRecording}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold shadow-md transition-all animate-bounce"
                    title="Hentikan & Simpan ke Catatan"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Selesai & Simpan</span>
                  </button>
                ) : (
                  <button
                    onClick={onStartRecording}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold shadow-md transition-all"
                    title="Mulai Mendengarkan & Merekam Suara Rapat"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Mulai Rekam</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live Streaming Transcript Preview (Saat recording aktif) */}
            {isRecording && (
              <div className="mt-1 p-2 rounded-lg bg-black/60 border border-zinc-800/80 text-[10.5px] text-zinc-200 max-h-16 overflow-y-auto no-scrollbar font-sans">
                {liveTranscript.trim() ? (
                  <div className="flex items-start justify-between gap-2">
                    <span className="leading-relaxed flex-1">{liveTranscript}</span>
                    <button
                      onClick={onClearLiveTranscript}
                      className="text-[9px] text-zinc-500 hover:text-red-400 shrink-0 px-1 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60"
                      title="Kosongkan transkrip live"
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <span className="text-zinc-500 italic flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                    <span>Mendengarkan ucapan... Bicara sekarang untuk melihat teks langsung</span>
                  </span>
                )}
              </div>
            )}

            {isTranscribing && (
              <div className="flex items-center space-x-2 py-1 px-2.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] animate-pulse">
                <Sparkles className="w-3 h-3 text-sky-400 shrink-0 animate-spin" />
                <span>Memproses transkrip suara dengan Whisper AI... Harap tunggu sebentar</span>
              </div>
            )}

            {speechError && (
              <div className="text-[9.5px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                ⚠️ {speechError}
              </div>
            )}
          </div>

          {/* ================= NOTES LIST ================= */}
          <div className="flex items-center justify-between pb-1">
            <div className="relative flex-1 mr-2">
              <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari catatan meeting..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-6 pr-2 py-0.5 text-[10.5px] text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <span className="text-[10px] text-zinc-500">{filteredNotes.length} catatan</span>
          </div>

          {/* Notes Cards Scroll View */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pr-0.5 max-h-[110px]">
            {filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-zinc-500 text-xs">
                <FileText className="w-6 h-6 mb-1 opacity-30" />
                <span>Belum ada catatan rapat tersimpan.</span>
                <span className="text-[10px] text-zinc-600 mt-0.5">
                  Klik &quot;Mulai Rekam&quot; saat meeting atau buat &quot;Catatan Baru&quot;.
                </span>
              </div>
            ) : (
              filteredNotes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleOpenNote(n)}
                  className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-zinc-700/80 cursor-pointer transition-all group shadow-sm"
                >
                  <div className="flex items-center space-x-2.5 overflow-hidden flex-1 mr-2">
                    <div className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                      <FileText className="w-3 h-3" />
                    </div>
                    <div className="overflow-hidden flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-semibold text-zinc-200 group-hover:text-white truncate">
                          {n.title}
                        </span>
                        {n.durationSeconds ? (
                          <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[8.5px] font-mono shrink-0">
                            {Math.floor(n.durationSeconds / 60)}m {n.durationSeconds % 60}s
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-zinc-500 truncate block">
                        {n.content ? n.content.replace(/\n+/g, ' ') : 'Catatan kosong'}
                      </span>
                    </div>
                  </div>

                  {/* Actions on Card */}
                  <div
                    className="flex items-center space-x-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleCopyText(n.content, n.id)}
                      className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      title="Salin teks"
                    >
                      {copiedId === n.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      onClick={() => handleExportNote(n, 'txt')}
                      className="p-1 rounded-md text-zinc-500 hover:text-sky-300 hover:bg-zinc-800 transition-colors"
                      title="Export .txt"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        sound.playPop();
                        onDeleteNote(n.id);
                      }}
                      className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
