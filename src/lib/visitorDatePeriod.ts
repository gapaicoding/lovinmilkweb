export const VISITOR_DATE_PERIODS = [
  "all",
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
  "custom",
] as const;

export type VisitorDatePeriod = (typeof VISITOR_DATE_PERIODS)[number];

export interface VisitorDateFilterValue {
  period: VisitorDatePeriod;
  from?: string;
  to?: string;
}

export interface VisitorDateSearch {
  period?: VisitorDatePeriod;
  from?: string;
  to?: string;
}

export interface ResolvedVisitorDateRange {
  from: string | null;
  to: string | null;
  startIso: string | null;
  endExclusiveIso: string | null;
  label: string;
}

const LABELS: Record<VisitorDatePeriod, string> = {
  all: "Semua Waktu",
  today: "Hari Ini",
  yesterday: "Kemarin",
  last_7_days: "7 Hari Terakhir",
  last_30_days: "30 Hari Terakhir",
  this_month: "Bulan Ini",
  last_month: "Bulan Lalu",
  last_3_months: "3 Bulan Terakhir",
  this_year: "Tahun Ini",
  custom: "Rentang Tanggal",
};

export function isVisitorDatePeriod(value: unknown): value is VisitorDatePeriod {
  return typeof value === "string" && VISITOR_DATE_PERIODS.includes(value as VisitorDatePeriod);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function normalizeVisitorDateFilter(search: {
  period?: unknown;
  from?: unknown;
  to?: unknown;
}): VisitorDateFilterValue {
  const period = isVisitorDatePeriod(search.period) ? search.period : "all";
  if (period !== "custom" || !isDateKey(search.from) || !isDateKey(search.to)) {
    return { period: period === "custom" ? "all" : period };
  }
  if (search.from > search.to) return { period: "all" };
  return { period, from: search.from, to: search.to };
}

export function validateVisitorDateSearch(search: {
  period?: unknown;
  from?: unknown;
  to?: unknown;
}): VisitorDateSearch {
  const normalized = normalizeVisitorDateFilter(search);
  return normalized.period === "all" ? {} : normalized;
}

export function resolveVisitorDateRange(
  value: VisitorDateFilterValue,
  now = new Date(),
): ResolvedVisitorDateRange {
  if (value.period === "all") {
    return { from: null, to: null, startIso: null, endExclusiveIso: null, label: LABELS.all };
  }

  const today = jakartaDateKey(now);
  let from = today;
  let to = today;

  switch (value.period) {
    case "yesterday":
      from = to = shiftDateKey(today, -1);
      break;
    case "last_7_days":
      from = shiftDateKey(today, -6);
      break;
    case "last_30_days":
      from = shiftDateKey(today, -29);
      break;
    case "this_month":
      from = `${today.slice(0, 8)}01`;
      break;
    case "last_month": {
      const firstThisMonth = `${today.slice(0, 8)}01`;
      from = shiftMonth(firstThisMonth, -1);
      to = shiftDateKey(firstThisMonth, -1);
      break;
    }
    case "last_3_months":
      from = shiftMonth(today, -3);
      break;
    case "this_year":
      from = `${today.slice(0, 4)}-01-01`;
      break;
    case "custom":
      from = value.from ?? today;
      to = value.to ?? today;
      break;
    case "today":
      break;
  }

  return {
    from,
    to,
    startIso: jakartaMidnightIso(from),
    endExclusiveIso: jakartaMidnightIso(shiftDateKey(to, 1)),
    label:
      value.period === "custom"
        ? `${formatDateKey(from)} – ${formatDateKey(to)}`
        : LABELS[value.period],
  };
}

export function visitorDatePeriodLabel(period: VisitorDatePeriod): string {
  return LABELS[period];
}

function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDateKey(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return dateKey(new Date(Date.UTC(year, month - 1, day + days)));
}

function shiftMonth(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return dateKey(target);
}

function dateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function jakartaMidnightIso(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000).toISOString();
}

function formatDateKey(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
