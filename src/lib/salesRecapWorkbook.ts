import type { Cell, CellObject, Row, Sheet } from "write-excel-file/browser";
import { parseReportDate, reportPeriodLabel } from "@/lib/reportExport";
import { indonesianDayName, type SalesRecapDailyRow } from "@/lib/salesRecap";

const CURRENCY_FORMAT = '"Rp" #,##0;[Red]("Rp" #,##0);-';
const HEADER = "#9A3412";
const GROUP_HEADER = "#C2410C";
const WHITE = "#FFFFFF";
const MILLISECONDS_PER_DAY = 86_400_000;
const EXCEL_UNIX_EPOCH_SERIAL = 25_569;
const EXCEL_PRE_LEAP_BUG_UNIX_EPOCH_SERIAL = 25_568;
type BrowserFileContent = File | Blob | ArrayBuffer;

export async function exportSalesRecapWorkbook(
  rows: SalesRecapDailyRow[], startDate: string, endDate: string,
): Promise<void> {
  const blob = await createSalesRecapWorkbookBlob(rows, startDate, endDate);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = salesRecapFilename(startDate, endDate);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}

export async function createSalesRecapWorkbookBlob(
  rows: SalesRecapDailyRow[], startDate: string, endDate: string,
): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const sheet = createSalesRecapSheetModel(rows, startDate, endDate);
  return writeXlsxFile([sheet], { fontFamily: "Aptos", fontSize: 10 }).toBlob();
}

export function salesRecapFilename(startDate: string, endDate: string): string {
  const formatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const start = formatter.format(parseReportDate(startDate));
  const end = formatter.format(parseReportDate(endDate));
  const label = startDate === endDate ? start : `${start} s.d. ${end}`;
  return `Rekap Sales - ${label}.xlsx`.replace(/[<>:"/\\|?*]/g, "-");
}

export function createSalesRecapSheetModel(
  rows: SalesRecapDailyRow[], startDate: string, endDate: string,
): Sheet<BrowserFileContent> {
  const numberOfDays = inclusiveDays(startDate, endDate);
  const dataEntered = rows.filter((row) => row.closing_id || row.bill_count > 0).length;
  const top: Row[] = [
    [styled("Rekap Sales LOVIN MILK", { columnSpan: 27, fontWeight: "bold", fontSize: 16, textColor: WHITE, backgroundColor: HEADER, height: 30 }), ...blanks(26)],
    [styled(`Periode ${reportPeriodLabel(startDate, endDate)}`, { columnSpan: 27, fontWeight: "bold", backgroundColor: "#FFF7ED" }), ...blanks(26)],
    [styled("Tanggal Awal", { fontWeight: "bold" }), dateCell(startDate), styled("Tanggal Akhir", { fontWeight: "bold" }), dateCell(endDate), styled("Jumlah Hari", { fontWeight: "bold" }), integerCell(numberOfDays), styled("Data Terinput", { fontWeight: "bold" }), integerCell(dataEntered)],
    blanks(27),
  ];
  const headers = createHeaders();
  const dataRows = rows.map(createDataRow);
  const totalRow = createTotalRow(rows);
  return {
    sheet: "Rekap Sales",
    data: [...top, ...headers, ...dataRows, totalRow],
    columns: [12,14,16,16,17,3,22,16,16,18,20,18,18,18,16,18,18,18,18,19,18,15,19,18,25,20,19].map((width) => ({ width })),
    stickyRowsCount: top.length + headers.length,
    stickyColumnsCount: 7,
    zoomScale: 0.75,
    dateFormat: "dd mmm yyyy",
  };
}

function createHeaders(): Row[] {
  const mainLabels = [
    "HARI", "TANGGAL", "Jumlah Struk Transaksi", "Transaksi Membership",
    "Transaksi Kupon/Promo", "", "Petugas Kasir", "Pengunjung Dewasa",
    "Pengunjung Anak",
  ];
  const trailing = [
    "TOTAL SALES", "Total Sales Arayya", "Total Sales Lovin", "Sub Total DINE IN",
    "Sub Total TAKE AWAY", "Sub Total Reservasi", "Validasi Sales",
    "Uang Cash Awal (Buka)", "Uang Cash Disetor", "Metode Setor",
    "Uang Cash Akhir (Tutup)", "Validasi Cash Akhir",
  ];
  const row1: Row = [
    ...mainLabels.map((label) => header(label, { rowSpan: 2 })),
    header("REKAP SALES", { columnSpan: 6, backgroundColor: GROUP_HEADER }),
    ...blanks(5),
    ...trailing.map((label) => header(label, { rowSpan: 2 })),
  ];
  const row2: Row = [
    ...blanks(9),
    ...["QRIS DRetail", "QRIS Dinamis BCA", "QRIS Statis BCA", "Debit EDC BCA", "QRIS Statis BRI", "Cash"].map((label) => header(label, { backgroundColor: GROUP_HEADER })),
    ...blanks(12),
  ];
  return [row1, row2];
}

function createDataRow(row: SalesRecapDailyRow): Row {
  const sunday = indonesianDayName(row.business_date) === "Minggu";
  return [
    styled(indonesianDayName(row.business_date), sunday ? { textColor: "#DC2626", fontWeight: "bold" } : {}),
    dateCell(row.business_date), integerCell(row.bill_count), nullableInteger(row.membership_transaction_count),
    nullableInteger(row.promo_transaction_count), styled(""), styled(row.cashier_name ?? ""),
    nullableInteger(row.adult_visitors), nullableInteger(row.child_visitors),
    ...[row.qris_dretail,row.qris_dynamic_bca,row.qris_static_bca,row.debit_edc_bca,row.qris_static_bri,row.cash_payment].map(nullableCurrency),
    currencyCell(row.system_total_sales), currencyCell(row.arayya_sales), currencyCell(row.lovin_sales),
    nullableCurrency(row.dine_in_sales), nullableCurrency(row.takeaway_sales), nullableCurrency(row.reservation_sales),
    booleanCell(row.sales_validation_is_current), nullableCurrency(row.cash_opening), nullableCurrency(row.cash_deposited),
    styled(row.deposit_method ?? ""), nullableCurrency(row.cash_closing_actual), booleanCell(row.cash_validation_is_current),
  ];
}

function createTotalRow(rows: SalesRecapDailyRow[]): Row {
  const sums = (key: keyof SalesRecapDailyRow) => rows.reduce((total, row) => total + (typeof row[key] === "number" ? row[key] : 0), 0);
  return [
    styled("TOTAL", { fontWeight: "bold", backgroundColor: "#FFF7ED", columnSpan: 2 }), null,
    integerCell(sums("bill_count"), true), integerCell(sums("membership_transaction_count"), true),
    integerCell(sums("promo_transaction_count"), true), styled("", { backgroundColor: "#FFF7ED" }), styled("", { backgroundColor: "#FFF7ED" }),
    integerCell(sums("adult_visitors"), true), integerCell(sums("child_visitors"), true),
    ...["qris_dretail","qris_dynamic_bca","qris_static_bca","debit_edc_bca","qris_static_bri","cash_payment","system_total_sales","arayya_sales","lovin_sales","dine_in_sales","takeaway_sales","reservation_sales"].map((key) => currencyCell(sums(key as keyof SalesRecapDailyRow), true)),
    styled("", { backgroundColor: "#FFF7ED" }), styled("", { backgroundColor: "#FFF7ED" }), currencyCell(sums("cash_deposited"), true),
    styled("", { backgroundColor: "#FFF7ED" }), styled("", { backgroundColor: "#FFF7ED" }), styled("", { backgroundColor: "#FFF7ED" }),
  ];
}

function header(value: string, options: Omit<CellObject, "value"> = {}): Cell {
  return styled(value, { fontWeight: "bold", textColor: WHITE, backgroundColor: HEADER, wrap: true, align: "center", alignVertical: "center", height: 38, ...options });
}
function styled(value: string | number | boolean | Date, options: Omit<CellObject, "value"> = {}): Cell {
  return { value, borderColor: "#D1D5DB", borderStyle: "thin", alignVertical: "center", ...options } as Cell;
}
function currencyCell(value: number, total = false): Cell { return styled(value, { type: Number, format: CURRENCY_FORMAT, align: "right", ...(total ? { fontWeight: "bold", backgroundColor: "#FFF7ED" } : {}) }); }
function nullableCurrency(value: number | null): Cell { return value === null ? styled("") : currencyCell(value); }
function integerCell(value: number, total = false): Cell { return styled(value, { type: Number, format: "#,##0", align: "right", ...(total ? { fontWeight: "bold", backgroundColor: "#FFF7ED" } : {}) }); }
function nullableInteger(value: number | null): Cell { return value === null ? styled("") : integerCell(value); }
function dateCell(value: string): Cell { return styled(excelSerialFromIsoDate(value), { type: Number, format: "dd mmm yyyy" }); }
function booleanCell(value: boolean): Cell { return styled(value, { type: Boolean, fontWeight: "bold", textColor: value ? "#166534" : "#991B1B", align: "center" }); }
function blanks(count: number): Row { return Array.from({ length: count }, () => null); }
function inclusiveDays(startDate: string, endDate: string): number { return excelSerialFromIsoDate(endDate) - excelSerialFromIsoDate(startDate) + 1; }

/**
 * Converts a calendar-only ISO date to an Excel 1900-system serial without
 * creating a timezone-bearing local Date. Excel's fictitious 1900-02-29 is
 * accounted for so modern dates remain compatible with its serial calendar.
 */
export function excelSerialFromIsoDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid ISO business date: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getTime() < Date.UTC(1900, 0, 1)
  ) {
    throw new Error(`Invalid ISO business date: ${value}`);
  }

  const unixDay = date.getTime() / MILLISECONDS_PER_DAY;
  const epochSerial = date.getTime() < Date.UTC(1900, 2, 1)
    ? EXCEL_PRE_LEAP_BUG_UNIX_EPOCH_SERIAL
    : EXCEL_UNIX_EPOCH_SERIAL;
  return unixDay + epochSerial;
}
