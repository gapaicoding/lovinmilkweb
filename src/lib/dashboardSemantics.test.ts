import { describe, expect, it } from "vitest";
import {
  buildArayyaSnapshot,
  buildLovinSnapshot,
  sumDashboardDailySeries,
} from "./dashboardSemantics";

describe("Dashboard business semantics", () => {
  it("keeps Lovin purchase and difference unavailable", () => {
    expect(buildLovinSnapshot(1_000_000, null)).toEqual({
      revenue: 1_000_000,
      purchase: null,
      revenueMinusPurchase: null,
    });
  });
  it("labels Lovin arithmetic without treating it as gross profit", () => {
    expect(buildLovinSnapshot(1_000_000, 400_000).revenueMinusPurchase).toBe(600_000);
  });
  it("uses authoritative Arayya HPP and leaves zero-revenue margin unavailable", () => {
    expect(buildArayyaSnapshot(500_000, 200_000)).toEqual({
      revenue: 500_000,
      hpp: 200_000,
      grossProfit: 300_000,
      margin: 60,
    });
    expect(buildArayyaSnapshot(0, 0).margin).toBeNull();
  });
  it("reconciles daily totals without double-counting mixed bills", () => {
    const totals = sumDashboardDailySeries([
      {
        date: "2026-08-01",
        outlet_revenue: 80_000,
        lovin_revenue: 50_000,
        arayya_revenue: 30_000,
        bill_count: 1,
        quantity: 2,
        visitor_count: 3,
        visitor_adult: 2,
        visitor_child: 1,
      },
    ]);
    expect(totals).toEqual({ revenue: 80_000, bills: 1, quantity: 2, visitors: 3 });
  });
});
