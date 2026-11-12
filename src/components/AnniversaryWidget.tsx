import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Bell, BellOff, Settings2, Power } from 'lucide-react';
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
  /** Ada pengingat di kapsul untuk hari ini (sebelum disembunyikan). */
  hasReminderToday?: boolean;
  dismissedToday?: boolean;
  onToggleDismissToday?: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const fadeIn = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.16 },
};

const fieldClass =
  'h-8 bg-zinc-950 border border-zinc-800 rounded-lg px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600';

export const AnniversaryWidget: React.FC<AnniversaryWidgetProps> = ({
  annivEnabled = false,
  onToggleAnnivEnabled,
  startYear = 2024,
  startMonth = 1, // 0-indexed (1 = Februari)
  startDay = 14,
  onDateChange,
  showAlwaysInCompact = false,
  onToggleShowAlways,
  hasReminderToday = false,
  dismissedToday = false,
  onToggleDismissToday,
}) => {
  const [isConfiguring, setIsConfiguring] = useState(false);
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

  const calc = getAnniversaryCalculations(startYear, startMonth, startDay);

  const openConfig = () => {
    sound.playClick();
    setTempDay(startDay);
    setTempMonth(startMonth);
    setTempYear(startYear);
    setIsConfiguring(true);
  };

  const handleSaveDateConfig = () => {
    sound.playSuccess();
    const year = Math.min(CURRENT_YEAR, Math.max(1970, tempYear || CURRENT_YEAR));
    onDateChange?.(tempDay, tempMonth, year);
    onToggleAnnivEnabled?.(true);
    setIsConfiguring(false);
  };

  const handleDisableAnniv = () => {
    sound.playPop();
    onToggleAnnivEnabled?.(false);
    setIsConfiguring(false);
  };

  const saveNotes = () => {
    try {
      localStorage.setItem('di_anniv_notes', notes.trim());
    } catch {}
  };

  // 1. Belum diaktifkan
  if (!annivEnabled && !isConfiguring) {
    return (
      <motion.div
        {...fadeIn}
        className="flex flex-col items-center justify-center h-full w-full px-6 text-center select-none"
      >
        <Heart className="w-5 h-5 text-rose-400 mb-3" />
        <h3 className="text-[13px] font-medium text-zinc-100">Mensive & Anniversary</h3>
        <p className="text-[11px] text-zinc-500 max-w-[300px] mt-1 mb-4 leading-relaxed">
          Isi tanggal jadian atau pernikahan. Hovera menghitung hari bersama dan mengingatkan
          setiap tanggal itu tiba.
        </p>
        <button
          type="button"
          onClick={openConfig}
          className="h-8 px-4 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          Atur tanggal
        </button>
      </motion.div>
    );
  }

  // 2. Form tanggal
  if (isConfiguring) {
    return (
      <motion.div {...fadeIn} className="flex flex-col h-full w-full gap-3 text-white select-none">
        <div>
          <div className="text-[12px] font-medium text-zinc-100">Tanggal spesial</div>
          <div className="text-[10.5px] text-zinc-500">Tanggal jadian atau pernikahan</div>
        </div>

        <div className="grid grid-cols-[72px_1fr_88px] gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Tanggal</span>
            <select
              value={tempDay}
              onChange={(e) => setTempDay(Number(e.target.value))}
              className={`${fieldClass} tabular-nums`}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Bulan</span>
            <select
              value={tempMonth}
              onChange={(e) => setTempMonth(Number(e.target.value))}
              className={fieldClass}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">Tahun</span>
            <input
              type="number"
              min={1970}
              max={CURRENT_YEAR}
              value={tempYear}
              onChange={(e) => setTempYear(Number(e.target.value))}
              className={`${fieldClass} tabular-nums`}
            />
          </label>
        </div>

        <p className="text-[10.5px] text-zinc-500 leading-relaxed">
          Mensive setiap tanggal {tempDay}
          {tempDay > 28 ? ' (atau hari terakhir di bulan yang lebih pendek)' : ''}, anniversary setiap{' '}
          {tempDay} {MONTH_NAMES[tempMonth]}.
        </p>

        <div className="flex items-center justify-between mt-auto pb-1">
          {annivEnabled ? (
            <button
              type="button"
              onClick={handleDisableAnniv}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] text-zinc-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <Power className="w-3.5 h-3.5" />
              Matikan fitur
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsConfiguring(false)}
              className="h-8 px-3 rounded-lg text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveDateConfig}
              className="h-8 px-4 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Simpan
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // 3. Dashboard
  // Anniversary selalu jatuh di tanggal mensive, jadi angka utama = acara berikutnya.
  const nextIsAnniv = calc.daysUntilAnniv === calc.daysUntilMensive;
  const isToday = calc.daysUntilMensive === 0;
  const mainLabel = nextIsAnniv
    ? `Anniversary ke-${calc.nextAnnivNumber}`
    : `Mensive ke-${calc.nextMensiveNumber}`;
  const togetherText = [
    calc.yearsTogether > 0 ? `${calc.yearsTogether} thn` : '',
    `${calc.remainingMonths} bln`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div
      {...fadeIn}
      className="flex flex-col h-full w-full gap-2 pb-2 text-white select-none overflow-y-auto no-scrollbar"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-zinc-100">Mensive & Anniversary</div>
          <div className="text-[10.5px] text-zinc-500 tabular-nums">
            Sejak {startDay} {MONTH_NAMES[startMonth]} {startYear}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasReminderToday && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onToggleDismissToday?.();
              }}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[10.5px] transition-colors cursor-pointer ${
                dismissedToday
                  ? 'border-zinc-800 text-zinc-500 hover:text-zinc-200'
                  : 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
              }`}
              title={
                dismissedToday
                  ? 'Tampilkan lagi pengingat di kapsul'
                  : 'Sembunyikan pengingat di kapsul sampai besok'
              }
            >
              {dismissedToday ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
              {dismissedToday ? 'Tampilkan lagi' : 'Matikan hari ini'}
            </button>
          )}
          <button
            type="button"
            onClick={openConfig}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Ubah tanggal"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-[1.15fr_1fr] rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="flex flex-col justify-center px-4 py-3">
          <div className="text-[10.5px] text-zinc-500">{mainLabel}</div>
          {isToday ? (
            <div className="mt-1 text-[26px] leading-none font-semibold text-rose-300">Hari ini</div>
          ) : (
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[30px] leading-none font-semibold tabular-nums text-zinc-50">
                {calc.daysUntilMensive}
              </span>
              <span className="text-[12px] text-zinc-400">hari lagi</span>
            </div>
          )}
          <div className="mt-1.5 text-[11px] text-zinc-400 capitalize">{calc.nextMensiveLong}</div>
        </div>

        <div className="flex flex-col border-l border-zinc-800 divide-y divide-zinc-800">
          <StatRow
            label={`Anniversary ke-${calc.nextAnnivNumber}`}
            value={calc.daysUntilAnniv === 0 ? 'Hari ini' : `${calc.daysUntilAnniv} hari`}
            hint={calc.nextAnnivFormatted}
          />
          <StatRow
            label="Bersama"
            value={`${calc.totalDaysTogether.toLocaleString('id-ID')} hari`}
            hint={togetherText}
          />
        </div>
      </div>

      {/* Catatan + tampilan kapsul */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder={`Catatan untuk ${calc.nextMensiveFormatted}…`}
          maxLength={200}
          className="flex-1 min-w-0 h-8 px-3 rounded-lg border border-zinc-800 bg-zinc-900/40 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10.5px] text-zinc-500">Di kapsul</span>
          <div className="inline-flex p-0.5 rounded-lg border border-zinc-800 bg-zinc-900/40">
            {[false, true].map((always) => (
              <button
                key={String(always)}
                type="button"
                onClick={() => {
                  if (always === showAlwaysInCompact) return;
                  sound.playClick();
                  onToggleShowAlways?.();
                }}
                className={`h-6 px-2 rounded-md text-[10.5px] transition-colors cursor-pointer ${
                  always === showAlwaysInCompact
                    ? 'bg-zinc-700/80 text-zinc-50'
                    : 'text-zinc-500 hover:text-zinc-200'
                }`}
                title={always ? 'Hitung mundur tampil setiap hari' : 'Tampil mulai H-3 sampai hari H'}
              >
                {always ? 'Selalu' : 'H-3'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const StatRow: React.FC<{ label: string; value: string; hint: string }> = ({ label, value, hint }) => (
  <div className="flex-1 flex items-center justify-between gap-3 px-4 py-2.5">
    <div className="min-w-0">
      <div className="text-[10.5px] text-zinc-500 truncate">{label}</div>
      <div className="text-[13px] font-medium tabular-nums text-zinc-100">{value}</div>
    </div>
    <div className="text-[10.5px] text-zinc-500 tabular-nums text-right shrink-0">{hint}</div>
  </div>
);
