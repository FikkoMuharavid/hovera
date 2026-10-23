import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Sun, Moon, Sunrise, Sunset, Heart } from 'lucide-react';
import { getAnniversaryCalculations } from '../utils/anniversary';

interface ClockWidgetProps {
  onNavigateToAnniv?: () => void;
  startYear?: number;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({
  onNavigateToAnniv,
  startYear = 2024,
}) => {
  const [time, setTime] = useState(new Date());

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

  const annivCalc = getAnniversaryCalculations(startYear, 1, 14);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-between h-full w-full py-0.5 text-white select-none"
    >
      {/* Top greeting badge */}
      <div className="flex items-center space-x-1.5 px-3 py-0.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px]">
        <GreetingIcon className={`w-3.5 h-3.5 ${greetingColor}`} />
        <span className="text-zinc-300 font-medium">{greeting}</span>
      </div>

      {/* Main Clock */}
      <div className="flex items-baseline justify-center space-x-2 my-1">
        <span className="text-5xl font-semibold tracking-tighter text-white font-mono drop-shadow-sm">
          {hours}:{minutes}
        </span>
        <span className="text-lg font-mono text-zinc-400 font-light w-8">
          :{seconds}
        </span>
      </div>

      {/* Full Date */}
      <div className="flex items-center space-x-1.5 text-xs text-zinc-300 font-medium">
        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
        <span>{dateFormatted}</span>
      </div>

      {/* Mini 7-day weekly indicators */}
      <div className="flex items-center space-x-1.5 mt-2 pt-1.5 border-t border-zinc-800/80 w-full justify-center">
        {daysOfWeek.map((day, idx) => {
          const isToday = idx === currentDayIndex;
          return (
            <div
              key={day}
              className={`flex flex-col items-center px-2 py-0.5 rounded-md text-[10px] transition-all ${
                isToday
                  ? 'bg-white text-black font-bold shadow-sm scale-105'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>{day}</span>
            </div>
          );
        })}
      </div>

      {/* Mensive & Anniversary Preview Footer */}
      <button
        onClick={onNavigateToAnniv}
        className="flex items-center space-x-1.5 px-3 py-0.5 mt-1 rounded-full bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/25 text-[10px] text-pink-300 transition-colors cursor-pointer"
        title="Lihat detail Anniversary & Mensive"
      >
        <Heart className="w-2.5 h-2.5 fill-current text-pink-400 shrink-0" />
        <span className="truncate max-w-[340px]">
          {annivCalc.isAnnivToday
            ? '🎉 Hari ini Anniversary 14 Feb! 🥂'
            : annivCalc.isMensiveToday
            ? '💖 Hari ini Mensive tgl 14! Klik untuk rayakan ✨'
            : `Mensive: ${annivCalc.daysUntilMensive} hari lagi (${annivCalc.nextMensiveFormatted}) · 14 Feb Anniv`}
        </span>
      </button>
    </motion.div>
  );
};
