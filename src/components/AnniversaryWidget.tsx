import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Heart,
  Sparkles,
  CalendarHeart,
  Gift,
  Clock,
  Check,
  Edit2,
} from 'lucide-react';
import { getAnniversaryCalculations } from '../utils/anniversary';
import { sound } from '../utils/sound';

interface AnniversaryWidgetProps {
  startYear: number;
  onStartYearChange: (year: number) => void;
  showAlwaysInCompact: boolean;
  onToggleShowAlways: () => void;
}

export const AnniversaryWidget: React.FC<AnniversaryWidgetProps> = ({
  startYear,
  onStartYearChange,
  showAlwaysInCompact,
  onToggleShowAlways,
}) => {
  const [editingYear, setEditingYear] = useState(false);
  const [tempYear, setTempYear] = useState(startYear);
  const [notes, setNotes] = useState(() => {
    return localStorage.getItem('di_anniv_notes') || '';
  });
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState(notes);
  const [celebrated, setCelebrated] = useState(false);

  const calc = getAnniversaryCalculations(startYear, 1, 14);

  const handleSaveYear = () => {
    sound.playClick();
    onStartYearChange(tempYear);
    setEditingYear(false);
  };

  const handleSaveNotes = () => {
    sound.playClick();
    setNotes(tempNotes);
    localStorage.setItem('di_anniv_notes', tempNotes);
    setIsEditingNotes(false);
  };

  const triggerCelebrate = () => {
    sound.playSuccess();
    setCelebrated(true);
    setTimeout(() => setCelebrated(false), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col justify-between h-full w-full py-0.5 select-none text-white overflow-y-auto no-scrollbar"
    >
      {/* Top Banner Status */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-2xl bg-gradient-to-r from-pink-500/15 via-rose-500/10 to-purple-500/15 border border-pink-500/25">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-xl bg-pink-500/20 text-pink-400">
            <Heart className="w-3.5 h-3.5 fill-current animate-pulse text-rose-400" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-pink-200 tracking-tight">
                Anniversary & Mensive
              </span>
              <span className="text-[10px] text-zinc-400">· 14 Februari</span>
            </div>
            <p className="text-[10px] text-zinc-300">
              {calc.isAnnivToday
                ? '🎉 Selamat Hari Anniversary Tahunan! 🥂'
                : calc.isMensiveToday
                ? '💖 Hari ini Mensive! Rayakan momen indahmu ✨'
                : calc.isAnnivApproaching
                ? `💍 H-${calc.daysUntilAnniv} Menuju Anniversary 14 Februari!`
                : calc.isMensiveApproaching
                ? `⏰ H-${calc.daysUntilMensive} Menuju Mensive (${calc.nextMensiveFormatted})`
                : `${calc.daysUntilMensive} hari menuju mensive berikutnya (${calc.nextMensiveFormatted})`}
            </p>
          </div>
        </div>

        <button
          onClick={triggerCelebrate}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
            celebrated
              ? 'bg-pink-500 text-white scale-105'
              : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-pink-300 border border-pink-500/30'
          }`}
          title="Kirim Cinta"
        >
          <Sparkles className="w-3 h-3 text-pink-400" />
          <span>{celebrated ? 'Terkirim! ❤️' : 'Love'}</span>
        </button>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-2 my-1.5">
        {/* Card 1: Mensive Bulanan */}
        <div className="flex flex-col justify-between p-2 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9.5px] font-medium">Mensive Bulanan</span>
            <Clock className="w-3 h-3 text-rose-400" />
          </div>
          <div className="my-0.5">
            <div className="text-sm font-bold font-mono text-rose-200">
              {calc.isMensiveToday ? 'HARI INI' : `${calc.daysUntilMensive} Hari`}
            </div>
            <div className="text-[9px] text-zinc-400 truncate">
              {calc.isMensiveToday ? '14 Tiap Bulan' : `Ke ${calc.nextMensiveFormatted}`}
            </div>
          </div>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
            <div
              className="bg-rose-500 h-full rounded-full transition-all duration-500"
              style={{
                width: calc.isMensiveToday
                  ? '100%'
                  : `${Math.max(8, Math.min(100, ((30 - calc.daysUntilMensive) / 30) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* Card 2: Anniversary Tahunan */}
        <div className="flex flex-col justify-between p-2 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9.5px] font-medium">Anniversary 14 Feb</span>
            <Gift className="w-3 h-3 text-pink-400" />
          </div>
          <div className="my-0.5">
            <div className="text-sm font-bold font-mono text-pink-200">
              {calc.isAnnivToday ? 'HARI INI' : `${calc.daysUntilAnniv} Hari`}
            </div>
            <div className="text-[9px] text-zinc-400 truncate">
              {calc.isAnnivToday ? '14 Februari' : `Ke ${calc.nextAnnivFormatted}`}
            </div>
          </div>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-pink-500 to-purple-500 h-full rounded-full transition-all duration-500"
              style={{
                width: calc.isAnnivToday
                  ? '100%'
                  : `${Math.max(5, Math.min(100, ((365 - calc.daysUntilAnniv) / 365) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* Card 3: Total Hari Bersama */}
        <div className="flex flex-col justify-between p-2 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[9.5px] font-medium">Hari Bersama</span>
            <CalendarHeart className="w-3 h-3 text-purple-400" />
          </div>
          <div className="my-0.5">
            <div className="text-sm font-bold font-mono text-purple-200">
              {calc.totalDaysTogether.toLocaleString('id-ID')} Hari
            </div>
            <div className="text-[9px] text-zinc-400 truncate">
              {calc.yearsTogether > 0 ? `${calc.yearsTogether} thn ` : ''}
              {calc.remainingMonths} bln bersama
            </div>
          </div>
          <div className="flex items-center justify-between pt-0.5 text-[8.5px] text-zinc-500">
            <span>Sejak 14 Feb {startYear}</span>
            <button
              onClick={() => {
                sound.playClick();
                setEditingYear(!editingYear);
              }}
              className="text-zinc-400 hover:text-white"
              title="Ubah tahun jadian"
            >
              <Edit2 className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Edit Year Prompt if active */}
      {editingYear && (
        <div className="flex items-center justify-between px-3 py-1.5 mb-1 rounded-xl bg-zinc-900 border border-zinc-700 text-xs">
          <span className="text-zinc-300 text-[10px]">Tahun Jadian:</span>
          <div className="flex items-center space-x-1.5">
            <input
              type="number"
              min="2000"
              max={new Date().getFullYear()}
              value={tempYear}
              onChange={(e) => setTempYear(Number(e.target.value))}
              className="w-16 px-1.5 py-0.5 bg-black border border-zinc-700 rounded text-center text-xs font-mono text-white focus:outline-none focus:border-pink-500"
            />
            <button
              onClick={handleSaveYear}
              className="px-2 py-0.5 bg-pink-600 hover:bg-pink-500 rounded text-[10px] font-medium text-white"
            >
              Simpan
            </button>
          </div>
        </div>
      )}

      {/* Love Note & Settings Row */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-[10px]">
        {/* Left: Gift / Love Note */}
        <div className="flex-1 flex items-center space-x-1.5 overflow-hidden">
          <Gift className="w-3 h-3 text-pink-400 shrink-0" />
          {isEditingNotes ? (
            <div className="flex-1 flex items-center space-x-1">
              <input
                type="text"
                value={tempNotes}
                onChange={(e) => setTempNotes(e.target.value)}
                placeholder="Rencana kado / ucapan tgl 14..."
                className="w-full px-1.5 py-0.5 bg-black border border-zinc-700 rounded text-[10px] text-white focus:outline-none focus:border-pink-500"
              />
              <button
                onClick={handleSaveNotes}
                className="p-1 bg-pink-600 hover:bg-pink-500 rounded text-white"
              >
                <Check className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => {
                sound.playClick();
                setTempNotes(notes);
                setIsEditingNotes(true);
              }}
              className="truncate cursor-pointer hover:text-zinc-200 text-zinc-400"
              title="Klik untuk ubah catatan kado/kejutan"
            >
              {notes ? (
                <span className="text-zinc-200">{notes}</span>
              ) : (
                <span className="italic text-zinc-500">
                  + Tambah ide kado / catatan kejutan tgl 14...
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Toggle Pill Notification Display */}
        <div className="flex items-center space-x-1 shrink-0 pl-2 border-l border-zinc-800">
          <span className="text-zinc-400 text-[9.5px]">Di Kapsul:</span>
          <button
            onClick={() => {
              sound.playClick();
              onToggleShowAlways();
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              showAlwaysInCompact
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {showAlwaysInCompact ? 'Selalu' : 'H-3 & Hari H'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
