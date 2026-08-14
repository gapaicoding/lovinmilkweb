import { describe, expect, it } from "vitest";
import {
  calculateClosingPreview,
  createEmptyClosingDraft,
  extractCashDraft,
  getClosingDirtyState,
  indonesianDayName,
  type SalesDailyClosingDraft,
} from "@/lib/salesRecap";

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

  it("extracts only Cash balance fields and excludes Cash Payment", () => {
    const draft = createEmptyClosingDraft();
    Object.assign(draft, {
      cash_opening: 150_000,
      cash_deposited: 100_000,
      deposit_method: "Setor ATM/Bank",
      cash_closing_actual: 70_000,
      cash_payment: 20_000,
      cashier_name: "Via",
    });

    expect(extractCashDraft(draft)).toEqual({
      cash_opening: 150_000,
      cash_deposited: 100_000,
      deposit_method: "Setor ATM/Bank",
      cash_closing_actual: 70_000,
    });
    expect(extractCashDraft(draft)).not.toHaveProperty("cash_payment");
  });

  it("does not mark an unchanged draft or unchanged zero values dirty", () => {
    const baseline = createEmptyClosingDraft();
    const current = { ...baseline };
    expect(getClosingDirtyState(current, baseline)).toEqual({
      isDirty: false,
      hasUnsavedSalesChanges: false,
      hasUnsavedCashChanges: false,
    });
  });

  it("distinguishes unsaved Sales changes from Cash-only changes", () => {
    const baseline = createEmptyClosingDraft();
    const salesChanged = { ...baseline, cash_payment: 40_000 };
    const cashChanged = { ...baseline, cash_opening: 150_000 };

    expect(getClosingDirtyState(salesChanged, baseline)).toEqual({
      isDirty: true,
      hasUnsavedSalesChanges: true,
      hasUnsavedCashChanges: false,
    });
    expect(getClosingDirtyState(cashChanged, baseline)).toEqual({
      isDirty: true,
      hasUnsavedSalesChanges: false,
      hasUnsavedCashChanges: true,
    });
  });

  it("normalizes null, undefined, and blank general text predictably", () => {
    const baseline = createEmptyClosingDraft();
    baseline.cashier_name = null;
    baseline.notes = null;
    const current = {
      ...baseline,
      cashier_name: "   ",
      notes: undefined,
    } as unknown as SalesDailyClosingDraft;

    expect(getClosingDirtyState(current, baseline).isDirty).toBe(false);
  });
});
