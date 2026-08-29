import { describe, expect, it } from "vitest";
import { buildOperationalSalesExportPayload } from "@/lib/reportExportData";

describe("operational Sales inputter export", () => {
  it("adds Penginput and repeats the historical snapshot on detail rows", () => {
    const payload = buildOperationalSalesExportPayload({
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      transactions: [{
        id: "trx",
        transactionDate: "2026-08-10",
        transactionNumber: "TRX-1",
        inputterName: "Budi",
        totalAmount: 20000,
        notes: null,
        deletedAt: null,
        linkedVisit: null,
        items: [{
          id: "item",
          productNameSnapshot: "Susu",
          productSkuSnapshot: "SKU",
          categoryNameSnapshot: "Minuman",
          subunitNameSnapshot: "Lovin",
          subunitId: "subunit",
          salesCategoryId: "category",
          quantity: 2,
          unitSnapshot: "cup",
          unitPrice: 10000,
          amount: 20000,
          notes: null,
        }],
      }] as never,
    });
    const detail = payload.sheets.find((sheet) => sheet.name === "Detail Transaksi");
    expect(detail?.columns.some((column) => column.label === "Penginput")).toBe(true);
    expect(detail?.rows[0].Penginput).toBe("Budi");
  });
});
