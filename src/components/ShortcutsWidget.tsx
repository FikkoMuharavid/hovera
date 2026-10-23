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
  Code2,
  Compass,
} from 'lucide-react';
import { sound } from '../utils/sound';

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
  { id: 'explorer', name: 'Explorer', target: 'explorer', type: 'system', iconType: 'folder', color: 'from-amber-500 to-yellow-600' },
  { id: 'calc', name: 'Kalkulator', target: 'calc', type: 'system', iconType: 'calc', color: 'from-orange-500 to-amber-600' },
  { id: 'notepad', name: 'Catatan', target: 'notepad', type: 'system', iconType: 'text', color: 'from-blue-500 to-indigo-600' },
  { id: 'taskmgr', name: 'Task Mgr', target: 'taskmgr', type: 'system', iconType: 'activity', color: 'from-emerald-500 to-teal-600' },
  { id: 'settings', name: 'Pengaturan', target: 'ms-settings:', type: 'system', iconType: 'settings', color: 'from-zinc-500 to-zinc-700' },
  { id: 'spotify', name: 'Spotify', target: 'spotify:', type: 'app', iconType: 'music', color: 'from-green-500 to-emerald-700' },
  { id: 'chatgpt', name: 'ChatGPT', target: 'https://chatgpt.com', type: 'url', iconType: 'globe', color: 'from-teal-500 to-cyan-600' },
  { id: 'vscode', name: 'VS Code', target: 'code', type: 'app', iconType: 'code', color: 'from-sky-500 to-blue-700' },
];

export const ShortcutsWidget: React.FC = () => {
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem('di_shortcuts');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return DEFAULT_SHORTCUTS;
  });

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');

  useEffect(() => {
    localStorage.setItem('di_shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  const launchShortcut = (item: ShortcutItem) => {
    sound.playClick();
    if (window.electronAPI) {
      if (item.type === 'url') {
        window.electronAPI.openExternal(item.target);
      } else {
        window.electronAPI.launchApp(item.target);
      }
    } else {
      // Fallback for browser preview
      if (item.target.startsWith('http://') || item.target.startsWith('https://')) {
        window.open(item.target, '_blank');
      } else {
        console.log('Launching shortcut in browser fallback:', item.target);
      }
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newTarget.trim()) return;

    sound.playSuccess();
    const isUrl = newTarget.startsWith('http://') || newTarget.startsWith('https://') || newTarget.includes('.');
    const item: ShortcutItem = {
      id: Date.now().toString(),
      name: newName.trim(),
      target: isUrl && !newTarget.startsWith('http') ? `https://${newTarget.trim()}` : newTarget.trim(),
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
      case 'code':
        return <Code2 className="w-4 h-4 text-white" />;
      default:
        return <Compass className="w-4 h-4 text-white" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full select-none"
    >
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
