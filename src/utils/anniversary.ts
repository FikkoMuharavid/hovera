export interface AnniversaryConfig {
  startYear: number;
  startMonth: number; // 1 = Feb (0-indexed)
  startDay: number;   // 14
  showAlwaysInCompact: boolean;
  notes: string;
}

export function getAnniversaryCalculations(startYear = 2024, startMonth = 1, startDay = 14) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  // 1. Mensive (Tanggal 14 setiap bulan)
  let nextMensiveYear = currentYear;
  let nextMensiveMonth = currentMonth;

  if (currentDate > startDay) {
    nextMensiveMonth += 1;
    if (nextMensiveMonth > 11) {
      nextMensiveMonth = 0;
      nextMensiveYear += 1;
    }
  }

  const nextMensiveDate = new Date(nextMensiveYear, nextMensiveMonth, startDay);
  const startOfToday = new Date(currentYear, currentMonth, currentDate);
  const diffMensiveMs = nextMensiveDate.getTime() - startOfToday.getTime();
  const daysUntilMensive = Math.round(diffMensiveMs / (1000 * 60 * 60 * 24));
  const isMensiveToday = currentDate === startDay;
  const isMensiveApproaching = daysUntilMensive > 0 && daysUntilMensive <= 3;

  // 2. Anniversary Tahunan (14 Februari)
  let nextAnnivYear = currentYear;
  const thisYearAnniv = new Date(currentYear, startMonth, startDay);
  if (startOfToday > thisYearAnniv) {
    nextAnnivYear = currentYear + 1;
  }
  const nextAnnivDate = new Date(nextAnnivYear, startMonth, startDay);
  const diffAnnivMs = nextAnnivDate.getTime() - startOfToday.getTime();
  const daysUntilAnniv = Math.round(diffAnnivMs / (1000 * 60 * 60 * 24));
  const isAnnivToday = currentMonth === startMonth && currentDate === startDay;
  const isAnnivApproaching = daysUntilAnniv > 0 && daysUntilAnniv <= 3;

  // 3. Total waktu bersama
  const startDate = new Date(startYear, startMonth, startDay);
  const totalDaysTogether = Math.max(
    0,
    Math.floor((startOfToday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  let monthsTogether = (currentYear - startYear) * 12 + (currentMonth - startMonth);
  if (currentDate < startDay) {
    monthsTogether -= 1;
  }
  monthsTogether = Math.max(0, monthsTogether);
  const yearsTogether = Math.floor(monthsTogether / 12);
  const remainingMonths = monthsTogether % 12;

  const nextMensiveFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(nextMensiveDate);

  const nextAnnivFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(nextAnnivDate);

  return {
    isMensiveToday,
    isMensiveApproaching,
    daysUntilMensive,
    nextMensiveFormatted,
    isAnnivToday,
    isAnnivApproaching,
    daysUntilAnniv,
    nextAnnivFormatted,
    totalDaysTogether,
    monthsTogether,
    yearsTogether,
    remainingMonths,
  };
}
