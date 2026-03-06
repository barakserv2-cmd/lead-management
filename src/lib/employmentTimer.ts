// ============================================================
// Employment Timer — shared logic for 6-month contract countdown
// ============================================================

const CONTRACT_MONTHS = 6;

export interface TimerData {
  startDate: Date;
  endDate: Date;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  remainingMonths: number;
  remainingExtraDays: number;
  percentUsed: number;
  expired: boolean;
}

/**
 * Calculate employment timer data from a start_date string.
 * Returns null if start_date is falsy.
 */
export function calcTimer(startDateStr: string | null): TimerData | null {
  if (!startDateStr) return null;

  const start = new Date(startDateStr);
  const end = new Date(startDateStr);
  end.setMonth(end.getMonth() + CONTRACT_MONTHS);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = today.getTime() - start.getTime();
  const remainingMs = end.getTime() - today.getTime();

  const totalDays = Math.ceil(totalMs / 86400000);
  const elapsedDays = Math.floor(elapsedMs / 86400000);
  const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
  const expired = remainingMs <= 0;

  const remainingMonths = Math.floor(remainingDays / 30);
  const remainingExtraDays = remainingDays % 30;

  const percentUsed = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

  return {
    startDate: start,
    endDate: end,
    totalDays,
    elapsedDays,
    remainingDays,
    remainingMonths,
    remainingExtraDays,
    percentUsed,
    expired,
  };
}

/**
 * Returns a color tier based on percentage used.
 * green (< 50%) → amber (50-83%) → red (> 83% or expired)
 */
export function timerColor(t: TimerData): "green" | "amber" | "red" {
  if (t.expired || t.percentUsed > 83) return "red";
  if (t.percentUsed > 50) return "amber";
  return "green";
}
