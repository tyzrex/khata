/** BS calendar data covers ~2000 BS onward — a safe lower bound for the year list. */
export const MIN_BS_YEAR = 2000;

export function buildBsYearOptions(selectedYear: number, currentBsYear: number): number[] {
  const maxBsYear = Math.max(selectedYear, currentBsYear + 1);
  return Array.from({ length: maxBsYear - MIN_BS_YEAR + 1 }, (_, index) => maxBsYear - index);
}
