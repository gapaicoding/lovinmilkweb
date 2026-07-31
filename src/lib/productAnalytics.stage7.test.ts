import { describe, expect, it } from "vitest";
import type { ProductReportRow } from "./reporting";
import { filterProductReportRows, groupProductRowsByCategory, rankProductReportRows } from "./productAnalytics";

function row(name: string, quantity: number, category = "Snack", revenue: number | null = null): ProductReportRow {
  return { product_id: null, product_name: name, category_name: category, quantity, revenue, hpp: null, gross_profit: null, financial_available: revenue !== null, source_status: revenue === null ? "legacy" : "operational" };
}

describe("Stage 7 product presentation helpers", () => {
  it("ranks quantity globally after combining rows", () => {
    expect(rankProductReportRows([row("A", 10), row("B", 30), row("C", 20)]).map((item) => [item.product_name, item.rank])).toEqual([["B", 1], ["C", 2], ["A", 3]]);
  });
  it("calculates contribution without NaN or Infinity", () => {
    expect(rankProductReportRows([row("A", 25), row("B", 75)]).map((item) => item.quantityContribution)).toEqual([75, 25]);
    expect(rankProductReportRows([row("A", 0)])[0].quantityContribution).toBe(0);
  });
  it("groups category quantities", () => {
    expect(groupProductRowsByCategory([row("A", 10), row("B", 20), row("C", 5, "Milk")]).map((item) => [item.name, item.quantity])).toEqual([["Snack", 30], ["Milk", 5]]);
  });
  it("filters category and product name case-insensitively", () => {
    expect(filterProductReportRows([row("Ice Tea", 2, "Drink"), row("Fries", 1)], { search: " ice ", category: "Drink" })).toHaveLength(1);
  });
  it("preserves unavailable historical finance as null", () => {
    const historical = rankProductReportRows([row("A", 1)])[0];
    expect(historical.financial_available).toBe(false);
    expect(historical.revenue).toBeNull();
  });
});
