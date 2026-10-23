import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  Calculator,
  FileText,
  Activity,
  Settings,
  Music,
  Globe,
  Plus,
  Trash2,
  ExternalLink,
  Compass,
  Search,
  ArrowLeft,
  FolderOpen,
  Briefcase,
  Building2,
  Clock,
  CheckCircle2,
  Pin,
} from 'lucide-react';
import { sound } from '../utils/sound';
import type { ProjectInfo } from '../types/electron';

export const VscodeIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4 text-white',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 0 8.012v7.976a1 1 0 0 0 .327.751l1.322 1.202a1 1 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.94-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zM18 17.683L9.54 12 18 6.317v11.366z" />
  </svg>
);

export interface ShortcutItem {
  id: string;
  name: string;
  target: string;
  isCustom?: boolean;
  type: 'system' | 'url' | 'app';
  iconType: string;
  color: string;
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'antigravity',
    name: 'Antigravity',
    target: 'antigravity-picker',
    type: 'app',
    iconType: 'vscode',
    color: 'from-sky-500 via-blue-600 to-indigo-600',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    target: 'explorer',
    type: 'system',
    iconType: 'folder',
    color: 'from-amber-500 to-yellow-600',
  },
  {
    id: 'calc',
    name: 'Kalkulator',
    target: 'calc',
    type: 'system',
    iconType: 'calc',
    color: 'from-orange-500 to-amber-600',
  },
  {
    id: 'notepad',
    name: 'Catatan',
    target: 'notepad',
    type: 'system',
    iconType: 'text',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'taskmgr',
    name: 'Task Mgr',
    target: 'taskmgr',
    type: 'system',
    iconType: 'activity',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'settings',
    name: 'Pengaturan',
    target: 'ms-settings:',
    type: 'system',
    iconType: 'settings',
    color: 'from-zinc-500 to-zinc-700',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    target: 'spotify:',
    type: 'app',
    iconType: 'music',
    color: 'from-green-500 to-emerald-700',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    target: 'https://chatgpt.com',
    type: 'url',
    iconType: 'globe',
    color: 'from-teal-500 to-cyan-600',
  },
];

export const ShortcutsWidget: React.FC = () => {
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem('di_shortcuts');
      if (saved) {
        let parsed: ShortcutItem[] = JSON.parse(saved);
        // Hapus vscode jika ada di cache lama
        parsed = parsed.filter((s) => s.id !== 'vscode');

        // Pastikan Antigravity ada di urutan pertama dan menggunakan ikon VS Code serta warna biru
        const antigravityItem: ShortcutItem = {
          id: 'antigravity',
          name: 'Antigravity',
          target: 'antigravity-picker',
          type: 'app',
          iconType: 'vscode',
          color: 'from-sky-500 via-blue-600 to-indigo-600',
        };

        const existingIdx = parsed.findIndex((s) => s.id === 'antigravity');
        if (existingIdx !== -1) {
          parsed[existingIdx] = {
            ...parsed[existingIdx],
            iconType: 'vscode',
            color: 'from-sky-500 via-blue-600 to-indigo-600',
          };
        } else {
          parsed.unshift(antigravityItem);
        }

        localStorage.setItem('di_shortcuts', JSON.stringify(parsed));
        return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_SHORTCUTS;
  });

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');

  // Antigravity Project Picker State
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [recentPaths, setRecentPaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('di_recent_projects');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [];
  });
  const [pinnedPaths, setPinnedPaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('di_pinned_projects');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [];
  });
  const [openedToast, setOpenedToast] = useState<string | null>(null);

  const togglePinProject = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playPop();
    setPinnedPaths((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [path, ...prev];
      localStorage.setItem('di_pinned_projects', JSON.stringify(next));
      return next;
    });
  };

  // Load scanned projects from Electron
  useEffect(() => {
    if (window.electronAPI?.scanProjects) {
      window.electronAPI.scanProjects().then((items) => {
        if (items && items.length > 0) {
          setProjects(items);
        }
      });
    } else {
      // Fallback fallback list
      setProjects([
        {
          name: 'stock-aging-laravel',
          path: 'C:\\Developer\\Program Kantor\\stock-aging-laravel',
          category: 'Program Kantor',
        },
        {
          name: 'dynamic-island',
          path: 'C:\\Developer\\Program Freelance\\dynamic-island',
          category: 'Program Freelance',
        },
        {
          name: 'affiliator-docs-laravel',
          path: 'C:\\Developer\\Program Kantor\\affiliator-docs-laravel',
          category: 'Program Kantor',
        },
        {
          name: 'Company Profile',
          path: 'C:\\Developer\\Program Freelance\\Company Profile',
          category: 'Program Freelance',
        },
      ]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('di_shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  const launchShortcut = (item: ShortcutItem) => {
    sound.playClick();

    if (item.target === 'antigravity-picker' || item.id === 'antigravity') {
      setShowProjectPicker(true);
      return;
    }

    if (window.electronAPI) {
      if (item.type === 'url') {
        window.electronAPI.openExternal(item.target);
      } else {
        window.electronAPI.launchApp(item.target);
      }
    } else {
      if (item.target.startsWith('http://') || item.target.startsWith('https://')) {
        window.open(item.target, '_blank');
      }
    }
  };

  const handleOpenProject = async (projPath: string, projName: string) => {
    sound.playSuccess();
    setOpenedToast(projName);

    // Save to recents
    const updated = [projPath, ...recentPaths.filter((p) => p !== projPath)].slice(0, 8);
    setRecentPaths(updated);
    localStorage.setItem('di_recent_projects', JSON.stringify(updated));

    if (window.electronAPI?.openProjectInAntigravity) {
      await window.electronAPI.openProjectInAntigravity(projPath);
    }

    setTimeout(() => {
      setOpenedToast(null);
      setShowProjectPicker(false);
    }, 900);
  };

  const handleSelectCustomFolder = async () => {
    sound.playClick();
    if (window.electronAPI?.selectFolder) {
      const selected = await window.electronAPI.selectFolder();
      if (selected) {
        const folderName = selected.split(/[\\/]/).pop() || selected;
        handleOpenProject(selected, folderName);
      }
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newTarget.trim()) return;

    sound.playSuccess();
    const isUrl =
      newTarget.startsWith('http://') ||
      newTarget.startsWith('https://') ||
      newTarget.includes('.');
    const item: ShortcutItem = {
      id: Date.now().toString(),
      name: newName.trim(),
      target:
        isUrl && !newTarget.startsWith('http')
          ? `https://${newTarget.trim()}`
          : newTarget.trim(),
      type: isUrl ? 'url' : 'app',
      iconType: isUrl ? 'globe' : 'compass',
      color: 'from-violet-500 to-purple-600',
      isCustom: true,
    };

    setShortcuts((prev) => [...prev, item]);
    setNewName('');
    setNewTarget('');
    setIsAdding(false);
  };

  const deleteShortcut = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playPop();
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  };

  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case 'vscode':
      case 'antigravity':
      case 'code':
        return <VscodeIcon className="w-4 h-4 text-white" />;
      case 'folder':
        return <Folder className="w-4 h-4 text-white" />;
      case 'calc':
        return <Calculator className="w-4 h-4 text-white" />;
      case 'text':
        return <FileText className="w-4 h-4 text-white" />;
      case 'activity':
        return <Activity className="w-4 h-4 text-white" />;
      case 'settings':
        return <Settings className="w-4 h-4 text-white" />;
      case 'music':
        return <Music className="w-4 h-4 text-white" />;
      case 'globe':
        return <Globe className="w-4 h-4 text-white" />;
      default:
        return <Compass className="w-4 h-4 text-white" />;
    }
  };

  // Filter projects
  // Filter projects
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.path.toLowerCase().includes(projectSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedCategory === 'pinned') {
      return pinnedPaths.includes(p.path);
    }
    if (selectedCategory === 'recent') {
      return recentPaths.includes(p.path);
    }
    if (selectedCategory !== 'all') {
      return p.category === selectedCategory;
    }
    return true;
  });

  // Prioritaskan project yang di-pin agar selalu berada di posisi paling atas
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const aPinned = pinnedPaths.includes(a.path);
    const bPinned = pinnedPaths.includes(b.path);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="relative flex flex-col h-full w-full select-none"
    >
      {/* ================= PROJECT PICKER MODAL OVERLAY ================= */}
      <AnimatePresence>
        {showProjectPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 z-30 bg-black/95 backdrop-blur-md rounded-2xl flex flex-col justify-between p-2.5 border border-zinc-800 shadow-2xl"
          >
            {/* Header Picker */}
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    sound.playClick();
                    setShowProjectPicker(false);
                  }}
                  className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  title="Kembali"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center space-x-1.5">
                  <div className="p-1 rounded-md bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                    <VscodeIcon className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-white">
                    Buka Project di Antigravity
                  </span>
                </div>
              </div>

              {/* Browse Folder button */}
              <button
                onClick={handleSelectCustomFolder}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors"
                title="Pilih folder dari disk"
              >
                <FolderOpen className="w-3 h-3 text-sky-400" />
                <span>Pilih Folder...</span>
              </button>
            </div>

            {/* Search Input & Category Filter */}
            <div className="flex items-center gap-1.5 py-1.5">
              <div className="relative flex-1">
                <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari project (misal: stock-aging, dynamic-island)..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg pl-7 pr-2.5 py-1 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  autoFocus
                />
              </div>

              <div className="flex items-center space-x-1 text-[9.5px]">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-zinc-800 text-white border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Semua
                </button>
                {pinnedPaths.length > 0 && (
                  <button
                    onClick={() => setSelectedCategory('pinned')}
                    className={`flex items-center space-x-1 px-2 py-0.5 rounded-md font-medium transition-colors ${
                      selectedCategory === 'pinned'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Pin className="w-2.5 h-2.5 fill-current" />
                    <span>Dipin ({pinnedPaths.length})</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedCategory('Program Kantor')}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-md font-medium transition-colors ${
                    selectedCategory === 'Program Kantor'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Building2 className="w-2.5 h-2.5" />
                  <span>Kantor</span>
                </button>
                <button
                  onClick={() => setSelectedCategory('Program Freelance')}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-md font-medium transition-colors ${
                    selectedCategory === 'Program Freelance'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Briefcase className="w-2.5 h-2.5" />
                  <span>Freelance</span>
                </button>
                {recentPaths.length > 0 && (
                  <button
                    onClick={() => setSelectedCategory('recent')}
                    className={`flex items-center space-x-1 px-2 py-0.5 rounded-md font-medium transition-colors ${
                      selectedCategory === 'recent'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <span>Terakhir</span>
                  </button>
                )}
              </div>
            </div>

            {/* Project List */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pr-0.5">
              {openedToast && (
                <div className="flex items-center justify-center space-x-1.5 p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium animate-pulse">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Membuka {openedToast} di Antigravity IDE...</span>
                </div>
              )}

              {sortedProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-zinc-500 text-xs">
                  <Folder className="w-6 h-6 mb-1 opacity-40" />
                  <span>
                    {selectedCategory === 'pinned'
                      ? 'Belum ada project yang disematkan. Klik ikon jarum 📌 pada project untuk menyematkan.'
                      : 'Tidak ada project yang cocok'}
                  </span>
                </div>
              ) : (
                sortedProjects.map((p) => {
                  const isRecent = recentPaths.includes(p.path);
                  const isPinned = pinnedPaths.includes(p.path);
                  const isKantor = p.category === 'Program Kantor';
                  return (
                    <motion.div
                      key={p.path}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleOpenProject(p.path, p.name)}
                      className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all group shadow-sm ${
                        isPinned
                          ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/35'
                          : 'bg-zinc-900/70 hover:bg-zinc-800/80 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 overflow-hidden">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm ${
                            isPinned
                              ? 'bg-amber-600/80 border border-amber-400/40'
                              : isKantor
                              ? 'bg-blue-600/80 border border-blue-400/30'
                              : 'bg-purple-600/80 border border-purple-400/30'
                          }`}
                        >
                          <VscodeIcon className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="overflow-hidden">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-semibold text-zinc-100 group-hover:text-white truncate">
                              {p.name}
                            </span>
                            {isPinned && (
                              <span className="flex items-center space-x-0.5 px-1.5 py-0.2 rounded-full bg-amber-500/25 text-amber-300 text-[8.5px] font-medium border border-amber-500/40">
                                <Pin className="w-2 h-2 fill-current" />
                                <span>Dipin</span>
                              </span>
                            )}
                            {isRecent && !isPinned && (
                              <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[8.5px] font-mono">
                                Terakhir
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 truncate block">
                            {p.category} · {p.path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        {/* Tombol Pin / Sematkan */}
                        <button
                          onClick={(e) => togglePinProject(p.path, e)}
                          className={`p-1.5 rounded-lg transition-all ${
                            isPinned
                              ? 'text-amber-400 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40'
                              : 'text-zinc-500 hover:text-amber-400 hover:bg-zinc-800'
                          }`}
                          title={isPinned ? 'Lepas sematan (Unpin)' : 'Sematkan ke atas (Pin)'}
                        >
                          <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current rotate-45' : ''}`} />
                        </button>

                        <span className="text-[10px] text-indigo-400 group-hover:text-indigo-300 font-medium px-2 py-1 rounded-md bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors">
                          Buka →
                        </span>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <span className="text-xs text-zinc-300 font-medium">Pintasan Cepat (Shortcuts)</span>
        <button
          onClick={() => {
            sound.playClick();
            setIsAdding(!isAdding);
          }}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all ${
            isAdding
              ? 'bg-zinc-700 text-white'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          <Plus className="w-3 h-3" />
          <span>{isAdding ? 'Batal' : 'Tambah'}</span>
        </button>
      </div>

      {/* Add Shortcut Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddCustom}
            className="flex flex-col gap-1.5 pt-2 pb-1 overflow-hidden"
          >
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nama (e.g. YouTube)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-1/3 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500"
              />
              <input
                type="text"
                placeholder="URL atau Path (e.g. youtube.com)"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Simpan
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Shortcuts Grid */}
      <div className="grid grid-cols-4 gap-2.5 mt-2 overflow-y-auto max-h-[168px] no-scrollbar pr-0.5 pt-0.5">
        {shortcuts.map((sc) => (
          <motion.div
            key={sc.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => launchShortcut(sc)}
            className="group relative flex flex-col items-center justify-center p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-700/80 cursor-pointer transition-colors shadow-sm"
          >
            {/* Custom delete button */}
            {sc.isCustom && (
              <button
                onClick={(e) => deleteShortcut(sc.id, e)}
                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1 rounded-full bg-zinc-950 text-zinc-400 hover:text-red-400 border border-zinc-800 shadow transition-opacity"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}

            {/* Icon Box */}
            <div
              className={`w-8 h-8 rounded-lg bg-gradient-to-br ${sc.color} flex items-center justify-center shadow-md mb-1.5`}
            >
              {renderIcon(sc.iconType)}
            </div>

            {/* Title */}
            <div className="flex items-center space-x-1 max-w-full">
              <span className="text-[11px] text-zinc-300 font-medium truncate">{sc.name}</span>
              {sc.type === 'url' && <ExternalLink className="w-2.5 h-2.5 text-zinc-500 shrink-0" />}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
