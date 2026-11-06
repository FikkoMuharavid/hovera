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
  Settings,
  Power,
} from 'lucide-react';
import { getAnniversaryCalculations } from '../utils/anniversary';
import { sound } from '../utils/sound';

interface AnniversaryWidgetProps {
  annivEnabled?: boolean;
  onToggleAnnivEnabled?: (val?: boolean) => void;
  startYear?: number;
  startMonth?: number;
  startDay?: number;
  onDateChange?: (day: number, month: number, year: number) => void;
  showAlwaysInCompact?: boolean;
  onToggleShowAlways?: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export const AnniversaryWidget: React.FC<AnniversaryWidgetProps> = ({
  annivEnabled = false,
  onToggleAnnivEnabled,
  startYear = 2024,
  startMonth = 1, // 0-indexed (1 = Februari)
  startDay = 14,
  onDateChange,
  showAlwaysInCompact = false,
  onToggleShowAlways,
}) => {
  const [isConfiguring, setIsConfiguring] = useState(!annivEnabled);
  const [tempDay, setTempDay] = useState(startDay);
  const [tempMonth, setTempMonth] = useState(startMonth);
  const [tempYear, setTempYear] = useState(startYear);

  const [notes, setNotes] = useState(() => {
    try {
      return localStorage.getItem('di_anniv_notes') || '';
    } catch {
      return '';
    }
  });
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState(notes);
  const [celebrated, setCelebrated] = useState(false);
  const celebrateTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (celebrateTimeoutRef.current) clearTimeout(celebrateTimeoutRef.current);
    };
  }, []);

  const calc = getAnniversaryCalculations(startYear, startMonth, startDay);

  const handleSaveDateConfig = () => {
    sound.playSuccess();
    onDateChange?.(tempDay, tempMonth, tempYear);
    onToggleAnnivEnabled?.(true);
    setIsConfiguring(false);
  };

  const handleDisableAnniv = () => {
    sound.playPop();
    onToggleAnnivEnabled?.(false);
    setIsConfiguring(false);
  };

  const handleSaveNotes = () => {
    sound.playClick();
    setNotes(tempNotes);
    try {
      localStorage.setItem('di_anniv_notes', tempNotes);
    } catch {}
    setIsEditingNotes(false);
  };

  const triggerCelebrate = () => {
    sound.playSuccess();
    setCelebrated(true);
    if (celebrateTimeoutRef.current) clearTimeout(celebrateTimeoutRef.current);
    celebrateTimeoutRef.current = setTimeout(() => setCelebrated(false), 2500);
  };

  // 1. TAMPILAN JIKA BELUM DIAKTIFKAN
  if (!annivEnabled && !isConfiguring) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center justify-center py-6 px-4 text-center my-auto h-full w-full select-none"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-rose-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400 mb-3 shadow-lg">
          <Heart className="w-6 h-6 fill-current animate-pulse text-pink-400" />
        </div>
        <h3 className="text-sm font-semibold text-white">Pengingat Anniversary & Mensive</h3>
        <p className="text-[11px] text-zinc-400 max-w-[320px] mt-1 mb-4 leading-relaxed">
          Rayakan momen indah bersama pasangan. Atur tanggal jadian atau pernikahan Anda untuk melacak total hari bersama dan pengingat mensive bulanan otomatis.
        </p>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setTempDay(startDay);
            setTempMonth(startMonth);
            setTempYear(startYear);
            setIsConfiguring(true);
          }}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
        >
          <CalendarHeart className="w-4 h-4" />
          <span>+ Atur Tanggal Spesial</span>
        </button>
      </motion.div>
    );
  }

  // 2. FORM PENGATURAN TANGGAL
  if (isConfiguring) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="flex flex-col space-y-3 h-full w-full py-1 text-white select-none overflow-y-auto no-scrollbar"
      >
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-lg bg-pink-500/20 text-pink-400">
              <CalendarHeart className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-pink-200">Pengaturan Tanggal Spesial</span>
              <span className="text-[10px] text-zinc-400 block">Pilih tanggal jadian atau pernikahan Anda</span>
            </div>
          </div>
          {annivEnabled && (
            <button
              onClick={() => setIsConfiguring(false)}
              className="text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Kembali
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800">
          {/* Pilihan Tanggal */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-zinc-400 font-medium">Tanggal (Hari)</label>
            <select
              value={tempDay}
              onChange={(e) => setTempDay(Number(e.target.value))}
              className="bg-black border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500 font-mono"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Pilihan Bulan */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-zinc-400 font-medium">Bulan</label>
            <select
              value={tempMonth}
              onChange={(e) => setTempMonth(Number(e.target.value))}
              className="bg-black border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Pilihan Tahun */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] text-zinc-400 font-medium">Tahun</label>
            <input
              type="number"
              min="1970"
              max={CURRENT_YEAR}
              value={tempYear}
              onChange={(e) => setTempYear(Number(e.target.value))}
              className="bg-black border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500 font-mono text-center"
            />
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-[10.5px] text-pink-300 flex items-start space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0 mt-0.5" />
          <span>
            <strong>Otomatis:</strong> Sistem akan menghitung pengingat <strong>Mensive tiap tanggal {tempDay}</strong> setiap bulan dan <strong>Anniversary tahunan tiap {tempDay} {MONTH_NAMES[tempMonth]}</strong>.
          </span>
        </div>

        <div className="flex items-center justify-between pt-2">
          {annivEnabled ? (
            <button
              type="button"
              onClick={handleDisableAnniv}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] transition-colors cursor-pointer"
            >
              <Power className="w-3 h-3" />
              <span>Matikan Pengingat</span>
            </button>
          ) : <div />}

          <div className="flex items-center space-x-2">
            {annivEnabled && (
              <button
                type="button"
                onClick={() => setIsConfiguring(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveDateConfig}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan & Aktifkan</span>
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // 3. TAMPILAN DASHBOARD AKTIF
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col space-y-2 h-full w-full py-0.5 pb-2 select-none text-white overflow-y-auto no-scrollbar"
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
              <span className="text-[10px] text-zinc-400">· {startDay} {MONTH_NAMES[startMonth]}</span>
            </div>
            <p className="text-[10px] text-zinc-300">
              {calc.isAnnivToday
                ? 'Selamat Hari Anniversary Tahunan!'
                : calc.isMensiveToday
                ? 'Hari ini Mensive! Rayakan momen indahmu'
                : calc.isAnnivApproaching
                ? `H-${calc.daysUntilAnniv} Menuju Anniversary ${startDay} ${MONTH_NAMES[startMonth]}!`
                : calc.isMensiveApproaching
                ? `H-${calc.daysUntilMensive} Menuju Mensive (${calc.nextMensiveFormatted})`
                : `${calc.daysUntilMensive} hari menuju mensive berikutnya (${calc.nextMensiveFormatted})`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              sound.playClick();
              setTempDay(startDay);
              setTempMonth(startMonth);
              setTempYear(startYear);
              setIsConfiguring(true);
            }}
            className="p-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            title="Ubah Tanggal Spesial"
          >
            <Settings className="w-3 h-3" />
          </button>

          <button
            onClick={triggerCelebrate}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
              celebrated
                ? 'bg-pink-500 text-white scale-105 shadow-md'
                : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-pink-300 border border-pink-500/30'
            }`}
            title="Kirim Cinta"
          >
            {celebrated ? (
              <Heart className="w-3 h-3 fill-current text-white animate-bounce" />
            ) : (
              <Sparkles className="w-3 h-3 text-pink-400" />
            )}
            <span>{celebrated ? 'Terkirim!' : 'Love'}</span>
          </button>
        </div>
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
              {calc.isMensiveToday ? `Tgl ${startDay} Tiap Bulan` : `Ke ${calc.nextMensiveFormatted}`}
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
            <span className="text-[9.5px] font-medium">Anniversary</span>
            <Gift className="w-3 h-3 text-pink-400" />
          </div>
          <div className="my-0.5">
            <div className="text-sm font-bold font-mono text-pink-200">
              {calc.isAnnivToday ? 'HARI INI' : `${calc.daysUntilAnniv} Hari`}
            </div>
            <div className="text-[9px] text-zinc-400 truncate">
              {calc.isAnnivToday ? `${startDay} ${MONTH_NAMES[startMonth]}` : `Ke ${calc.nextAnnivFormatted}`}
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
            <span>Sejak {startDay} {MONTH_NAMES[startMonth].slice(0, 3)} {startYear}</span>
            <button
              onClick={() => {
                sound.playClick();
                setTempDay(startDay);
                setTempMonth(startMonth);
                setTempYear(startYear);
                setIsConfiguring(true);
              }}
              className="text-zinc-400 hover:text-white"
              title="Ubah tanggal jadian"
            >
              <Edit2 className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>

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
                placeholder={`Rencana kado / ucapan tgl ${startDay}...`}
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
                  + Tambah ide kado / catatan kejutan tgl {startDay}...
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
              onToggleShowAlways?.();
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer ${
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
