import { describe, expect, it } from "vitest";
import {
  calculateGrowth,
  calculateMargin,
  getFinanceCoverage,
  safePercentage,
  sourceStatusLabel,
  summarizeJulyActual,
} from "./reporting";

describe("reporting presentation semantics", () => {
  it("does not invent growth when the denominator is zero", () => {
    expect(calculateGrowth(100, 0)).toBeNull();
    expect(calculateGrowth(0, 0)).toBe(0);
  });
  it("keeps a zero-revenue margin unavailable", () => {
    expect(calculateMargin(0, 0)).toBeNull();
  });
  it("translates provenance for users", () => {
    expect(sourceStatusLabel("mixed")).toContain("Historis");
  });
  it("distinguishes unavailable, partial, and available finance coverage", () => {
    expect(getFinanceCoverage("2026-07-01", "2026-07-31", true)).toBe("FULLY_UNAVAILABLE");
    expect(getFinanceCoverage("2026-07-15", "2026-08-15", true)).toBe("PARTIAL");
    expect(getFinanceCoverage("2026-08-01", "2026-08-31", false)).toBe("AVAILABLE");
  });
  it("keeps percentages safe at a zero denominator", () => {
    expect(safePercentage(25, 100)).toBe(25);
    expect(safePercentage(5, 0)).toBeNull();
  });
  it("marks July metadata as full-month only for the exact month", () => {
    const report = {
      rows: [{ date: "2026-07-01", total_sales: 100, lovin_sales: 80, lovin_sales_raw: 80, arayya_sales: 20, bill_count: null, adult_visitors: 2, child_visitors: 1, visitor_total: 3, product_quantity: 4, product_detail_available: true, source_notes: null }],
      known_bill_count: 0, bill_coverage_complete: false, product_detail_coverage_complete: false,
      transaction_composition_available: false as const, product_financial_metrics_available: false as const,
      july_financial_costs_available: false as const, mapped_quantity: 4, unmatched_quantity: 0, free_quantity: 0,
    };
    expect(summarizeJulyActual(report, "2026-07-01", "2026-07-10")?.isFullJulyRange).toBe(false);
  });
});
