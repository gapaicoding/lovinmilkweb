export const BUSINESS_TIME_ZONE = "Asia/Jakarta";

export interface BusinessDateRange {
  startDate: string;
  endDate: string;
}

export function jakartaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function jakartaMonthRange(value = jakartaToday()): BusinessDateRange {
  const [year, month] = value.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { startDate: `${value.slice(0, 7)}-01`, endDate: end };
}

export function isBusinessDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function validateBusinessRange(range: BusinessDateRange): string | null {
  if (!isBusinessDate(range.startDate) || !isBusinessDate(range.endDate))
    return "Rentang tanggal tidak valid.";
  if (range.endDate < range.startDate) return "Tanggal akhir tidak boleh sebelum tanggal awal.";
  return null;
}
