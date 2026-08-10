import { describe, expect, it } from "vitest";
import {
  dashboardPeriodRange,
  jakartaMonthRange,
  jakartaToday,
  validateBusinessRange,
} from "./businessPeriod";

describe("business period", () => {
  it("uses the Jakarta calendar day", () => {
    expect(jakartaToday(new Date("2026-06-30T18:00:00Z"))).toBe("2026-07-01");
  });
  it("builds a complete calendar month", () => {
    expect(jakartaMonthRange("2026-07-12")).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });
  it("rejects a reversed range", () => {
    expect(validateBusinessRange({ startDate: "2026-07-02", endDate: "2026-07-01" })).toBeTruthy();
  });
  it("builds Dashboard month-to-date in Jakarta", () => {
    expect(dashboardPeriodRange("monthToDate", "2026-08-10")).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    });
  });
  it("handles previous-month year boundaries", () => {
    expect(dashboardPeriodRange("previousMonth", "2026-01-05")).toEqual({
      startDate: "2025-12-01",
      endDate: "2025-12-31",
    });
  });
});
