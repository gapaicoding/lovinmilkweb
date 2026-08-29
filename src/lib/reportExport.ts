import { computeRange, type DateRange, type RangePreset } from "@/components/DateRangeFilter";
import { toDateInput } from "@/lib/format";

export const REPORT_TIMEZONE = "Asia/Jakarta";

export type ReportType =
  | "financial"
  | "sales"
  | "visitors"
  | "expenses"
  | "purchases"
  | "products"
  | "suppliers"
  | "assets"
  | "depreciation";

export type ExportColumnKind = "text" | "integer" | "decimal" | "currency" | "date" | "status";
export interface TypedExportValue {
  value: string | number | boolean | Date | null;
  kind: ExportColumnKind;
}
export type ExportValue = string | number | boolean | Date | null | TypedExportValue;

export interface ExportColumn {
  key: string;
  label: string;
  kind?: ExportColumnKind;
  width?: number;
}

export interface ExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: Array<Record<string, ExportValue>>;
  emptyMessage?: string;
}

export interface ReportExportPayload {
  reportType: ReportType;
  title: string;
  startDate: string;
  endDate: string;
  periodLabel: string;
  dataStatus: "Historical" | "Operational" | "Combined" | "No actual data";
  sheets: ExportSheet[];
  sourceRecordCount: number;
  filename: string;
  asOfDate?: string;
  supplierUpdateLabel?: string;
}

export interface ReportExportRequest {
  reportType: ReportType;
  range: DateRange;
  filters?: Record<string, string | boolean | null | undefined>;
}

export class ReportExportError extends Error {
  constructor(
    public readonly kind:
      | "no_data"
      | "access_denied"
      | "query_failure"
      | "generation_failure"
      | "download_failure",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReportExportError";
  }
}

export const REPORT_LABELS: Record<ReportType, string> = {
  financial: "Laporan Keuangan",
  sales: "Laporan Penjualan",
  visitors: "Laporan Pengunjung",
  expenses: "Laporan Pengeluaran",
  purchases: "Laporan Pembelian",
  products: "Laporan Produk",
  suppliers: "Laporan Supplier",
  assets: "Register Aset",
  depreciation: "Laporan Penyusutan",
};

export function canExportReport(
  role: "staff" | "admin" | "super_admin" | null,
  reportType: ReportType,
): boolean {
  if (!role) return false;
  if (role === "admin" || role === "super_admin") return true;
  return ["sales", "visitors", "expenses", "products"].includes(reportType);
}

export function createExportRange(
  preset: RangePreset = "this_month",
  referenceDate = jakartaToday(),
): DateRange {
  return computeRange(preset, undefined, undefined, referenceDate);
}

export function toInclusiveDateRange(range: DateRange): { startDate: string; endDate: string } {
  return { startDate: toDateInput(range.from), endDate: toDateInput(range.to) };
}

export function jakartaToday(reference = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(value("year"), value("month") - 1, value("day"));
}

export function parseReportDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function reportPeriodLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatIndonesianDate(startDate);
  return `${formatIndonesianDate(startDate)} – ${formatIndonesianDate(endDate)}`;
}

export function safeReportFilename(
  reportType: ReportType,
  startDate: string,
  endDate: string,
): string {
  const reportName: Record<ReportType, string> = {
    financial: "Laporan_Keuangan",
    sales: "Penjualan",
    visitors: "Pengunjung",
    expenses: "Pengeluaran",
    purchases: "Pembelian",
    products: "Produk",
    suppliers: "Supplier",
    assets: "Aset_AsOf",
    depreciation: "Penyusutan",
  };
  const period = reportType === "assets"
    ? endDate
    : startDate === endDate
      ? startDate
      : `${startDate}_${endDate}`;
  return `LovinMilk_${reportName[reportType]}_${period}.xlsx`
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "_");
}

export function rangeFromDates(startDate: string, endDate: string): DateRange {
  return computeRange("custom", parseReportDate(startDate), parseReportDate(endDate));
}

export function classifyExportError(error: unknown): ReportExportError {
  if (error instanceof ReportExportError) return error;
  const candidate = error as { code?: string; message?: string };
  if (candidate?.code === "42501" || candidate?.code === "PGRST301") {
    return new ReportExportError(
      "access_denied",
      "Anda tidak memiliki izin untuk mengekspor laporan ini.",
      { cause: error },
    );
  }
  return new ReportExportError(
    "query_failure",
    candidate?.message
      ? `Data export gagal diambil: ${candidate.message}`
      : "Data export belum berhasil diambil.",
    { cause: error },
  );
}

export function detectDataStatus(sources: Array<string | null | undefined>) {
  const normalized = new Set(sources.filter(Boolean));
  const historical = normalized.has("historical_import");
  const operational =
    normalized.has("operational") ||
    normalized.has("legacy_unclassified") ||
    normalized.has("adjustment");
  if (historical && operational) return "Combined" as const;
  if (historical) return "Historical" as const;
  return "Operational" as const;
}

function formatIndonesianDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: REPORT_TIMEZONE,
  }).format(parseReportDate(value));
}
