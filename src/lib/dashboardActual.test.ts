import { describe, expect, it } from "vitest";
import { mergeDashboardActual } from "@/lib/dashboardActual";

describe("mergeDashboardActual", () => {
  it("merges historical and live dates without counting overlap twice", () => {
    const result = mergeDashboardActual({
      historicalSales: [{ sale_date: "2026-06-30", total_sales: 100, bill_count: 2 }],
      historicalTraffic: [{ traffic_date: "2026-06-30", total_visitors: 3 }],
      historicalQuantities: [{ sale_date: "2026-06-30", quantity: 4 }],
      liveSales: [
        { transaction_date: "2026-06-30", amount: 999, quantity: 99 },
        { transaction_date: "2026-07-01", amount: 50, quantity: 1 },
      ],
      liveVisits: [{ visit_date: "2026-06-30" }, { visit_date: "2026-07-01" }],
    });
    expect(result).toMatchObject({
      revenue: 150,
      billCount: 3,
      visitors: 4,
      productQuantity: 5,
      historicalDays: ["2026-06-30"],
      liveDays: ["2026-07-01"],
      hasData: true,
    });
  });

  it("keeps an empty period genuinely empty", () => {
    expect(
      mergeDashboardActual({
        historicalSales: [],
        historicalTraffic: [],
        historicalQuantities: [],
        liveSales: [],
        liveVisits: [],
      }).hasData,
    ).toBe(false);
  });
});
