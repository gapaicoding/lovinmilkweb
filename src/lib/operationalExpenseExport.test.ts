import { describe, expect, it } from "vitest";
import { buildOperationalExpenseExport } from "./operationalExpenseExport";

describe("operational expense export", () => {
  it("uses exact detail columns and derives daily/category totals from exported rows", () => {
    const base = {
      deleted_at: null,
      expense_date: "2026-08-10",
      item_name: "A",
      quantity: 2,
      unit: "kg",
      unit_price: 5000,
      amount: 10000,
      category_name_snapshot: "Perlengkapan",
      receipt_reference: "N-1",
      vendor_name: "Toko",
      notes: null,
      inputter_name: "Andi",
    };
    const payload = buildOperationalExpenseExport(
      [
        { ...base, id: "1" },
        { ...base, id: "2", item_name: "B", amount: 12000 },
      ] as never,
      "2026-08-10",
      "2026-08-10",
    );
    expect(payload.sheets[0].columns.map((column) => column.label)).toEqual([
      "Tanggal",
      "Penginput",
      "Nama Barang",
      "Jumlah / Ukuran",
      "Satuan Ukuran",
      "Harga Satuan",
      "Harga Total",
      "Kategori",
      "Nota",
      "TOKO",
      "Catatan",
    ]);
    expect(payload.sheets[0].rows[0].Penginput).toBe("Andi");
    expect(payload.sheets[1].rows[0]["Total Belanja"]).toBe(22000);
    expect(payload.sheets[2].rows[0]["Jumlah Pencatatan"]).toBe(2);
    expect(payload.filename).toBe("Pengeluaran_LovinMilk_2026-08-10.xlsx");
  });
});
