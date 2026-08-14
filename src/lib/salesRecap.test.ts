import { describe, expect, it } from "vitest";
import { calculateClosingPreview, createEmptyClosingDraft, indonesianDayName } from "@/lib/salesRecap";

describe("sales recap helpers", () => {
  it("calculates payment, service, and cash reconciliation", () => {
    const draft = createEmptyClosingDraft();
    Object.assign(draft, {
      qris_dretail: 20_000, qris_dynamic_bca: 20_000, qris_static_bca: 10_000,
      debit_edc_bca: 20_000, qris_static_bri: 10_000, cash_payment: 20_000,
      dine_in_sales: 70_000, takeaway_sales: 30_000,
      cash_opening: 150_000, cash_deposited: 100_000, cash_closing_actual: 70_000,
    });
    expect(calculateClosingPreview(draft, 100_000)).toEqual({
      paymentTotal: 100_000, paymentVariance: 0, serviceTypeTotal: 100_000,
      serviceTypeVariance: 0, expectedCashClosing: 70_000, cashVariance: 0,
    });
  });

  it("derives Indonesian day names without browser timezone shifts", () => {
    expect(indonesianDayName("2026-08-14")).toBe("Jumat");
    expect(indonesianDayName("2026-08-16")).toBe("Minggu");
  });
});
