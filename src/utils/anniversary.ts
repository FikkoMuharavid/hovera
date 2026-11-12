const DAY_MS = 1000 * 60 * 60 * 24;

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Tanggal 29-31 dipakai sebagai "hari terakhir bulan" di bulan yang lebih pendek. */
const clampDay = (year: number, month: number, day: number) => Math.min(day, daysInMonth(year, month));

/** Kunci tanggal lokal (YYYY-MM-DD) untuk menandai pengingat yang disembunyikan hari ini. */
export function todayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function getAnniversaryCalculations(startYear = 2024, startMonth = 1, startDay = 14) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();
  const startOfToday = new Date(currentYear, currentMonth, currentDate);

  // 1. Mensive (tanggal yang sama setiap bulan)
  const mensiveDayThisMonth = clampDay(currentYear, currentMonth, startDay);
  let nextMensiveYear = currentYear;
  let nextMensiveMonth = currentMonth;
  if (currentDate > mensiveDayThisMonth) {
    nextMensiveMonth += 1;
    if (nextMensiveMonth > 11) {
      nextMensiveMonth = 0;
      nextMensiveYear += 1;
    }
  }
  const nextMensiveDate = new Date(
    nextMensiveYear,
    nextMensiveMonth,
    clampDay(nextMensiveYear, nextMensiveMonth, startDay)
  );
  const daysUntilMensive = Math.round((nextMensiveDate.getTime() - startOfToday.getTime()) / DAY_MS);
  const isMensiveToday = daysUntilMensive === 0;
  const isMensiveApproaching = daysUntilMensive > 0 && daysUntilMensive <= 3;
  const nextMensiveNumber = Math.max(
    1,
    (nextMensiveYear - startYear) * 12 + (nextMensiveMonth - startMonth)
  );

  // 2. Anniversary tahunan
  let nextAnnivYear = currentYear;
  if (startOfToday > new Date(currentYear, startMonth, clampDay(currentYear, startMonth, startDay))) {
    nextAnnivYear += 1;
  }
  const nextAnnivDate = new Date(nextAnnivYear, startMonth, clampDay(nextAnnivYear, startMonth, startDay));
  const daysUntilAnniv = Math.round((nextAnnivDate.getTime() - startOfToday.getTime()) / DAY_MS);
  const isAnnivToday = daysUntilAnniv === 0;
  const isAnnivApproaching = daysUntilAnniv > 0 && daysUntilAnniv <= 3;
  const nextAnnivNumber = Math.max(1, nextAnnivYear - startYear);

  // 3. Total waktu bersama
  const startDate = new Date(startYear, startMonth, startDay);
  const totalDaysTogether = Math.max(0, Math.floor((startOfToday.getTime() - startDate.getTime()) / DAY_MS));

  let monthsTogether = (currentYear - startYear) * 12 + (currentMonth - startMonth);
  if (currentDate < mensiveDayThisMonth) monthsTogether -= 1;
  monthsTogether = Math.max(0, monthsTogether);
  const yearsTogether = Math.floor(monthsTogether / 12);
  const remainingMonths = monthsTogether % 12;

  const nextMensiveFormatted = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(
    nextMensiveDate
  );
  const nextMensiveLong = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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
    nextMensiveLong,
    nextMensiveNumber,
    isAnnivToday,
    isAnnivApproaching,
    daysUntilAnniv,
    nextAnnivFormatted,
    nextAnnivNumber,
    totalDaysTogether,
    monthsTogether,
    yearsTogether,
    remainingMonths,
  };
}

export type AnniversaryCalc = ReturnType<typeof getAnniversaryCalculations>;

export interface AnnivReminder {
  /** Teks singkat untuk kapsul, mis. "Mensive H-2". */
  label: string;
  /** true pada hari H (ditampilkan lebih menonjol). */
  isToday: boolean;
}

/**
 * Pengingat yang tampil di kapsul. Anniversary selalu jatuh di tanggal mensive,
 * jadi anniversary didahulukan. `showAlways` menampilkan hitung mundur mensive
 * setiap hari; selain itu hanya H-3 s/d hari H.
 */
export function getAnnivReminder(calc: AnniversaryCalc, showAlways: boolean): AnnivReminder | null {
  if (calc.isAnnivToday) return { label: 'Anniversary', isToday: true };
  if (calc.isMensiveToday) return { label: 'Mensive', isToday: true };
  if (calc.isAnnivApproaching) return { label: `Anniv H-${calc.daysUntilAnniv}`, isToday: false };
  if (calc.isMensiveApproaching || showAlways) {
    return { label: `Mensive H-${calc.daysUntilMensive}`, isToday: false };
  }
  return null;
}
