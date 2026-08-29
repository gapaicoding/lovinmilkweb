import type { OperationalExpenseRow } from "@/hooks/useOperationalExpenses";
import { parseReportDate, reportPeriodLabel, type ReportExportPayload } from "@/lib/reportExport";

export function buildOperationalExpenseExport(
  rows: OperationalExpenseRow[],
  startDate: string,
  endDate: string,
): ReportExportPayload {
  const active = rows.filter(
    (row) => !row.deleted_at && row.expense_date >= startDate && row.expense_date <= endDate,
  );
  const daily = aggregate(active, (row) => row.expense_date);
  const category = aggregate(active, (row) => row.category_name_snapshot);
  const period = startDate === endDate ? startDate : `${startDate}_${endDate}`;
  return {
    reportType: "expenses",
    title: "Data Pengeluaran",
    startDate,
    endDate,
    periodLabel: reportPeriodLabel(startDate, endDate),
    dataStatus: active.length ? "Operational" : "No actual data",
    sourceRecordCount: active.length,
    filename: `Pengeluaran_LovinMilk_${period}.xlsx`,
    sheets: [
      {
        name: "Detail Pengeluaran",
        columns: [
          column("Tanggal", "date", 15),
          column("Penginput", "text", 22),
          column("Nama Barang", "text", 28),
          column("Jumlah / Ukuran", "decimal", 16),
          column("Satuan Ukuran", "text", 16),
          column("Harga Satuan", "currency", 18),
          column("Harga Total", "currency", 18),
          column("Kategori", "text", 28),
          column("Nota", "text", 18),
          column("TOKO", "text", 24),
          column("Catatan", "text", 32),
        ],
        rows: active.map((row) => ({
          Tanggal: parseReportDate(row.expense_date),
          Penginput: row.inputter_name,
          "Nama Barang": row.item_name ?? "Data historis",
          "Jumlah / Ukuran": row.quantity,
          "Satuan Ukuran": row.unit,
          "Harga Satuan": row.unit_price,
          "Harga Total": Number(row.amount),
          Kategori: row.category_name_snapshot,
          Nota: row.receipt_reference,
          TOKO: row.vendor_name,
          Catatan: row.notes,
        })),
      },
      {
        name: "TOTAL BELANJA HARIAN",
        columns: [
          column("Tanggal", "date", 18),
          column("Jumlah Pencatatan", "integer", 18),
          column("Total Belanja", "currency", 20),
        ],
        rows: daily.map(([key, count, total]) => ({
          Tanggal: parseReportDate(key),
          "Jumlah Pencatatan": count,
          "Total Belanja": total,
        })),
      },
      {
        name: "SUMMARY BELANJA",
        columns: [
          column("Kategori", "text", 30),
          column("Jumlah Pencatatan", "integer", 18),
          column("Total Belanja", "currency", 20),
        ],
        rows: category.map(([key, count, total]) => ({
          Kategori: key,
          "Jumlah Pencatatan": count,
          "Total Belanja": total,
        })),
      },
    ],
  };
}

function aggregate(
  rows: OperationalExpenseRow[],
  keyOf: (row: OperationalExpenseRow) => string,
): Array<[string, number, number]> {
  const values = new Map<string, [number, number]>();
  for (const row of rows) {
    const key = keyOf(row);
    const previous = values.get(key) ?? [0, 0];
    values.set(key, [previous[0] + 1, previous[1] + Number(row.amount)]);
  }
  return [...values]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, [count, total]]) => [key, count, total]);
}

function column(
  label: string,
  kind: "text" | "integer" | "decimal" | "currency" | "date",
  width: number,
) {
  return { key: label, label, kind, width };
}
