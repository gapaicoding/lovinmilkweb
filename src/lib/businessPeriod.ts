export const BUSINESS_TIME_ZONE = "Asia/Jakarta";

export interface BusinessDateRange {
  startDate: string;
  endDate: string;
}

export type DashboardPeriodPreset =
  | "today"
  | "last7"
  | "monthToDate"
  | "previousMonth"
  | "custom";

interface BusinessDateParts {
  year: number;
  month: number;
  day: number;
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

  const candidate = `${value("year")}-${value("month")}-${value("day")}`;

  if (!parseBusinessDate(candidate)) {
    throw new Error("Tanggal bisnis Asia/Jakarta tidak dapat ditentukan.");
  }

  return candidate;
}

export function jakartaMonthRange(value = jakartaToday()): BusinessDateRange {
  const safeValue = normalizeBusinessDate(value);
  const parts = parseBusinessDate(safeValue);

  if (!parts) {
    throw new Error("Tanggal bisnis tidak valid.");
  }

  const endDate = new Date(
    Date.UTC(parts.year, parts.month, 0),
  )
    .toISOString()
    .slice(0, 10);

  return {
    startDate: `${safeValue.slice(0, 7)}-01`,
    endDate,
  };
}

export function dashboardPeriodRange(
  preset: Exclude<DashboardPeriodPreset, "custom">,
  today = jakartaToday(),
): BusinessDateRange {
  const safeToday = normalizeBusinessDate(today);

  if (preset === "today") {
    return {
      startDate: safeToday,
      endDate: safeToday,
    };
  }

  if (preset === "last7") {
    return {
      startDate: shiftBusinessDate(safeToday, -6),
      endDate: safeToday,
    };
  }

  if (preset === "monthToDate") {
    return {
      startDate: `${safeToday.slice(0, 7)}-01`,
      endDate: safeToday,
    };
  }

  const parts = parseBusinessDate(safeToday);

  if (!parts) {
    throw new Error("Tanggal bisnis tidak valid.");
  }

  const previousEnd = new Date(
    Date.UTC(parts.year, parts.month - 1, 0),
  )
    .toISOString()
    .slice(0, 10);

  return {
    startDate: `${previousEnd.slice(0, 7)}-01`,
    endDate: previousEnd,
  };
}

export function isBusinessDate(value: unknown): value is string {
  return parseBusinessDate(value) !== null;
}

export function validateBusinessRange(
  range: BusinessDateRange,
): string | null {
  if (
    !isBusinessDate(range.startDate) ||
    !isBusinessDate(range.endDate)
  ) {
    return "Rentang tanggal tidak valid.";
  }

  if (range.endDate < range.startDate) {
    return "Tanggal akhir tidak boleh sebelum tanggal awal.";
  }

  return null;
}

function normalizeBusinessDate(value: unknown): string {
  if (isBusinessDate(value)) {
    return value;
  }

  return jakartaToday();
}

function shiftBusinessDate(value: string, days: number): string {
  const parts = parseBusinessDate(value);

  if (!parts) {
    throw new Error("Tanggal bisnis tidak valid.");
  }

  const date = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + days,
    ),
  );

  return date.toISOString().slice(0, 10);
}

function parseBusinessDate(
  value: unknown,
): BusinessDateParts | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
  };
}