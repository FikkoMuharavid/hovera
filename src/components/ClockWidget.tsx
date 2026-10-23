import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Sun, Moon, Sunrise, Sunset } from 'lucide-react';

export const ClockWidget: React.FC = () => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-between h-full w-full py-1 text-white select-none"
    >
      {/* Top greeting badge */}
      <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs">
        <GreetingIcon className={`w-3.5 h-3.5 ${greetingColor}`} />
        <span className="text-zinc-300 font-medium">{greeting}</span>
      </div>

      {/* Main Clock */}
      <div className="flex items-baseline justify-center space-x-2 my-2">
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
      <div className="flex items-center space-x-1.5 mt-3 pt-2 border-t border-zinc-800/80 w-full justify-center">
        {daysOfWeek.map((day, idx) => {
          const isToday = idx === currentDayIndex;
          return (
            <div
              key={day}
              className={`flex flex-col items-center px-2 py-1 rounded-md text-[10px] transition-all ${
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
    </motion.div>
  );
};
