import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Sun, Moon, Sunrise, Sunset, Heart } from 'lucide-react';
import { getAnniversaryCalculations } from '../utils/anniversary';

interface ClockWidgetProps {
  onNavigateToAnniv?: () => void;
  annivEnabled?: boolean;
  startYear?: number;
  startMonth?: number;
  startDay?: number;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({
  onNavigateToAnniv,
  annivEnabled = false,
  startYear = 2024,
  startMonth = 1,
  startDay = 14,
}) => {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  // Indonesian date formatter
  const dateFormatted = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(time);

  // Time-based greeting
  const hourNum = time.getHours();
  let greeting = 'Selamat Malam';
  let GreetingIcon = Moon;
  let greetingColor = 'text-indigo-400';

  if (hourNum >= 5 && hourNum < 11) {
    greeting = 'Selamat Pagi';
    GreetingIcon = Sunrise;
    greetingColor = 'text-amber-400';
  } else if (hourNum >= 11 && hourNum < 15) {
    greeting = 'Selamat Siang';
    GreetingIcon = Sun;
    greetingColor = 'text-yellow-400';
  } else if (hourNum >= 15 && hourNum < 18) {
    greeting = 'Selamat Sore';
    GreetingIcon = Sunset;
    greetingColor = 'text-orange-400';
  }

  // Mini week calendar days
  const daysOfWeek = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const currentDayIndex = time.getDay();

  const annivCalc = getAnniversaryCalculations(startYear, startMonth, startDay);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-between h-full w-full py-1 px-1 text-white select-none overflow-y-auto no-scrollbar gap-1.5"
    >
      {/* Top greeting - sleek & clean tanpa kotak badge tebal */}
      <div className="flex items-center space-x-1.5 text-zinc-400 text-xs font-medium shrink-0 pt-0.5">
        <GreetingIcon className={`w-3.5 h-3.5 ${greetingColor}`} />
        <span>{greeting}</span>
      </div>

      {/* Main Clock */}
      <div className="flex items-baseline justify-center space-x-1.5 shrink-0 my-auto">
        <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-white font-mono drop-shadow-sm">
          {hours}:{minutes}
        </span>
        <span className="text-sm sm:text-base font-mono text-zinc-400 font-light w-6 sm:w-7">
          :{seconds}
        </span>
      </div>

      {/* Full Date */}
      <div className="flex items-center space-x-1.5 text-xs text-zinc-300 font-medium shrink-0">
        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
        <span>{dateFormatted}</span>
      </div>

      {/* Mini 7-day weekly indicators */}
      <div className="flex items-center space-x-1 pt-1.5 pb-0.5 border-t border-zinc-800/80 w-full max-w-[320px] justify-center shrink-0">
        {daysOfWeek.map((day, idx) => {
          const isToday = idx === currentDayIndex;
          return (
            <div
              key={day}
              className={`flex flex-col items-center px-2 py-0.5 rounded-md text-[10px] transition-all ${
                isToday
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span>{day}</span>
            </div>
          );
        })}
      </div>

      {/* Mensive & Anniversary Preview Footer - Hanya tampil jika user mengaktifkan fitur Anniversary */}
      {annivEnabled && (
        <button
          onClick={onNavigateToAnniv}
          className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 text-[9.5px] text-pink-300 transition-colors cursor-pointer shrink-0 shadow-sm mb-0.5"
          title="Lihat detail Anniversary & Mensive"
        >
          <Heart className="w-2.5 h-2.5 fill-current text-pink-400 shrink-0" />
          <span className="truncate max-w-[300px]">
            {annivCalc.isAnnivToday
              ? `Hari ini Anniversary! (${annivCalc.nextAnnivFormatted})`
              : annivCalc.isMensiveToday
              ? `Hari ini Mensive! (tgl ${startDay})`
              : `Mensive: ${annivCalc.daysUntilMensive} hari lagi (${annivCalc.nextMensiveFormatted})`}
          </span>
        </button>
      )}
    </motion.div>
  );
};
