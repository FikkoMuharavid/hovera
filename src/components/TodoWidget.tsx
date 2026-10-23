import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Trash2, ListTodo, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sound } from '../utils/sound';

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

interface TodoWidgetProps {
  onTasksUpdate?: (count: number) => void;
}

export const TodoWidget: React.FC<TodoWidgetProps> = ({ onTasksUpdate }) => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem('di_tasks');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [
      { id: '1', text: 'Buka laptop & review task hari ini', completed: true, createdAt: Date.now() - 3600000 },
      { id: '2', text: 'Kerjakan project Dynamic Island', completed: false, createdAt: Date.now() - 1800000 },
      { id: '3', text: 'Istirahat & minum air putih', completed: false, createdAt: Date.now() },
    ];
  });

  const [inputVal, setInputVal] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  useEffect(() => {
    localStorage.setItem('di_tasks', JSON.stringify(tasks));
    const activeCount = tasks.filter((t) => !t.completed).length;
    onTasksUpdate?.(activeCount);
  }, [tasks, onTasksUpdate]);

  const addTask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim()) return;

    sound.playClick();
    const newTask: Task = {
      id: Date.now().toString(),
      text: inputVal.trim(),
      completed: false,
      createdAt: Date.now(),
    };

    setTasks((prev) => [newTask, ...prev]);
    setInputVal('');
  };

  const toggleTask = (id: string) => {
    sound.playClick();
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextState = !t.completed;
          if (nextState) {
            sound.playSuccess();
            try {
              confetti({
                particleCount: 35,
                spread: 45,
                origin: { y: 0.15 },
                colors: ['#38bdf8', '#34d399', '#f472b6', '#fbbf24'],
                disableForReducedMotion: true,
              });
            } catch {
              // fallback
            }
          }
          return { ...t, completed: nextState };
        }
        return t;
      })
    );
  };

  const deleteTask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playPop();
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full select-none"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <div className="flex items-center space-x-1.5 text-xs text-zinc-300 font-medium">
          <ListTodo className="w-3.5 h-3.5 text-sky-400" />
          <span>Tugas Saya</span>
          <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded-full bg-zinc-800 font-mono">
            {completedCount}/{tasks.length}
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-1 bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800 text-[10px]">
          {(['all', 'active', 'completed'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                sound.playClick();
                setFilter(mode);
              }}
              className={`px-2 py-0.5 rounded-md capitalize transition-all ${
                filter === mode
                  ? 'bg-zinc-700/80 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              {mode === 'all' ? 'Semua' : mode === 'active' ? 'Aktif' : 'Selesai'}
            </button>
          ))}
        </div>
      </div>

      {/* Input box */}
      <form onSubmit={addTask} className="relative mt-2.5 mb-1.5">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Tambah tugas baru... (Enter)"
          className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 py-1.5 pr-8 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500/80 transition-colors"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-zinc-800 hover:bg-sky-500 hover:text-white text-zinc-400 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Task list container */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1.5 pr-0.5 max-h-[145px] pt-1 no-scrollbar">
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredTasks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-6 text-zinc-500 text-xs"
            >
              <Sparkles className="w-5 h-5 mb-1 text-zinc-600" />
              <span>Tidak ada tugas di kategori ini</span>
            </motion.div>
          ) : (
            filteredTasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, height: 0, margin: 0, padding: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                onClick={() => toggleTask(task.id)}
                className={`group flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                  task.completed
                    ? 'bg-zinc-900/40 border-zinc-800/40 text-zinc-500'
                    : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-200 hover:border-zinc-700/80'
                }`}
              >
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                      task.completed
                        ? 'bg-emerald-500 border-emerald-500 text-black'
                        : 'border-zinc-600 group-hover:border-zinc-400'
                    }`}
                  >
                    {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span
                    className={`text-xs truncate transition-all ${
                      task.completed ? 'line-through text-zinc-500' : ''
                    }`}
                  >
                    {task.text}
                  </span>
                </div>

                <button
                  onClick={(e) => deleteTask(task.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded-md transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
