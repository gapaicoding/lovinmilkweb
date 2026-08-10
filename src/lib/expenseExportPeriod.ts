export type ExpenseExportPreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "this_week"
  | "this_month"
  | "last_month"
  | "select_month"
  | "custom";

export interface ExpenseExportPeriodInput {
  preset: ExpenseExportPreset;
  today: string;
  selectedMonth?: string;
  startDate?: string;
  endDate?: string;
}

export interface ExpenseExportPeriod {
  startDate: string;
  endDate: string;
}

export function resolveExpenseExportPeriod(input: ExpenseExportPeriodInput): ExpenseExportPeriod {
  const today = parseBusinessDate(input.today);
  if (!today) throw new Error("Tanggal bisnis tidak valid.");
  switch (input.preset) {
    case "today":
      return range(today, today);
    case "yesterday": {
      const date = addDays(today, -1);
      return range(date, date);
    }
    case "last_7_days":
      return range(addDays(today, -6), today);
    case "this_week":
      return range(addDays(today, -mondayIndex(today)), today);
    case "this_month":
      return range(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), today);
    case "last_month": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return range(start, end);
    }
    case "select_month": {
      if (!/^\d{4}-\d{2}$/.test(input.selectedMonth ?? "")) throw new Error("Bulan wajib dipilih.");
      const [year, month] = input.selectedMonth!.split("-").map(Number);
      if (month < 1 || month > 12) throw new Error("Bulan tidak valid.");
      return range(new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 0)));
    }
    case "custom": {
      const start = parseBusinessDate(input.startDate ?? "");
      const end = parseBusinessDate(input.endDate ?? "");
      if (!start || !end) throw new Error("Tanggal awal dan tanggal akhir wajib diisi.");
      if (start.getTime() > end.getTime())
        throw new Error("Tanggal awal tidak boleh melewati tanggal akhir.");
      return range(start, end);
    }
  }
}

function parseBusinessDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return format(date) === value ? date : null;
}
function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
function mondayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}
function format(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function range(start: Date, end: Date): ExpenseExportPeriod {
  return { startDate: format(start), endDate: format(end) };
}
