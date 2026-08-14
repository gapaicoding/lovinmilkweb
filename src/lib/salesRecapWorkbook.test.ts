import { describe, expect, it } from "vitest";
import type { Cell } from "write-excel-file/browser";
import { createSalesRecapSheetModel, salesRecapFilename } from "@/lib/salesRecapWorkbook";
import { createEmptyClosingDraft, type SalesRecapDailyRow } from "@/lib/salesRecap";

describe("sales recap workbook", () => {
  it("creates a predictable custom-range filename", () => {
    expect(salesRecapFilename("2026-08-11", "2026-08-14")).toContain("11 Agustus 2026 s.d. 14 Agustus 2026");
  });

  it("preserves the A-AA structure and exact business mappings", () => {
    const row = recapRow();
    const sheet = createSalesRecapSheetModel([row], "2026-08-11", "2026-08-14");
    const mainHeader = sheet.data[4];
    const paymentHeader = sheet.data[5];
    const dataRow = sheet.data[6];
    const logicalHeaders = mainHeader.map((cell, index) =>
      index >= 9 && index <= 14 ? cellValue(paymentHeader[index]) : cellValue(cell),
    );

    expect(sheet.columns).toHaveLength(27);
    expect(mainHeader).toHaveLength(27);
    expect(logicalHeaders).toEqual([
      "HARI",
      "TANGGAL",
      "Jumlah Struk Transaksi",
      "Transaksi Membership",
      "Transaksi Kupon/Promo",
      "",
      "Petugas Kasir",
      "Pengunjung Dewasa",
      "Pengunjung Anak2",
      "QRIS DRetail",
      "QRIS Dinamis BCA",
      "QRIS Statis BCA",
      "Debit EDC BCA",
      "QRIS Statis BRI",
      "Cash",
      "TOTAL SALES",
      "Total Sales Arayya",
      "Total Sales Lovin",
      "Sub Total DINE IN",
      "Sub Total TAKE AWAY",
      "Sub Total Reservasi",
      "Validasi Sales",
      "Uang Cash Awal (Buka)",
      "Uang Cash Disetor",
      "Metode Setor",
      "Uang Cash Akhir (Tutup)",
      "Validasi Cash Akhir",
    ]);
    expect(paymentHeader.slice(9, 15).map(cellValue)).toEqual([
      "QRIS DRetail",
      "QRIS Dinamis BCA",
      "QRIS Statis BCA",
      "Debit EDC BCA",
      "QRIS Statis BRI",
      "Cash",
    ]);
    expect(cellValue(mainHeader[15])).toBe("TOTAL SALES");
    expect(cellValue(mainHeader[16])).toBe("Total Sales Arayya");
    expect(cellValue(mainHeader[17])).toBe("Total Sales Lovin");
    expect(cellValue(mainHeader[21])).toBe("Validasi Sales");
    expect(cellValue(mainHeader[26])).toBe("Validasi Cash Akhir");
    expect(cellValue(dataRow[15])).toBe(100_000);
    expect(cellValue(dataRow[16])).toBe(50_000);
    expect(cellValue(dataRow[17])).toBe(50_000);
    expect(cellValue(dataRow[21])).toBe(true);
    expect(cellValue(dataRow[26])).toBe(false);
  });

  it("keeps position balances blank while summing Cash Deposit in TOTAL", () => {
    const first = recapRow({ cash_opening: 100_000, cash_deposited: 50_000, cash_closing_actual: 120_000 });
    const second = recapRow({ business_date: "2026-08-12", cash_opening: 120_000, cash_deposited: 70_000, cash_closing_actual: 130_000 });
    const sheet = createSalesRecapSheetModel([first, second], "2026-08-11", "2026-08-12");
    const totalRow = sheet.data.at(-1)!;

    expect(cellValue(totalRow[22])).toBe("");
    expect(cellValue(totalRow[23])).toBe(120_000);
    expect(cellValue(totalRow[25])).toBe("");
  });

  it("writes the inclusive custom-range day count as numeric metadata", () => {
    const sheet = createSalesRecapSheetModel([recapRow()], "2026-08-11", "2026-08-14");
    expect(cellValue(sheet.data[2][5])).toBe(4);
  });
});

function recapRow(overrides: Partial<SalesRecapDailyRow> = {}): SalesRecapDailyRow {
  return {
    ...createEmptyClosingDraft(),
    business_date: "2026-08-11",
    bill_count: 2,
    system_total_sales: 100_000,
    lovin_sales: 50_000,
    arayya_sales: 50_000,
    quantity: 4,
    visitor_system_total: 5,
    visitor_system_adult: 3,
    visitor_system_child: 2,
    closing_id: "closing-id",
    sales_validated_at: "2026-08-11T14:00:00Z",
    sales_validated_revision: 3,
    cash_validated_at: null,
    cash_validated_revision: null,
    current_revision: 3,
    payment_total: 100_000,
    payment_variance: 0,
    service_type_total: 100_000,
    service_type_variance: 0,
    expected_cash_closing: 70_000,
    cash_variance: 0,
    subunit_variance: 0,
    sales_validation_is_current: true,
    cash_validation_is_current: false,
    sales_fields_complete: true,
    cash_fields_complete: true,
    overall_status: "READY_TO_VALIDATE",
    updated_at: "2026-08-11T14:00:00Z",
    ...overrides,
  };
}

function cellValue(cell: Cell | null | undefined) {
  return cell && typeof cell === "object" && "value" in cell ? cell.value : null;
}
