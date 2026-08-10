import { describe, expect, it } from "vitest";
import { resolveExpenseExportPeriod as resolve } from "./expenseExportPeriod";

const period = (preset: Parameters<typeof resolve>[0]["preset"], extra = {}) =>
  resolve({ preset, today: "2026-08-10", ...extra });
describe("expense export period", () => {
  it("resolves Hari Ini", () =>
    expect(period("today")).toEqual({ startDate: "2026-08-10", endDate: "2026-08-10" }));
  it("resolves Kemarin", () =>
    expect(period("yesterday")).toEqual({ startDate: "2026-08-09", endDate: "2026-08-09" }));
  it("resolves 7 Hari Terakhir", () =>
    expect(period("last_7_days")).toEqual({ startDate: "2026-08-04", endDate: "2026-08-10" }));
  it("uses Monday for Minggu Ini", () =>
    expect(period("this_week")).toEqual({ startDate: "2026-08-10", endDate: "2026-08-10" }));
  it("resolves Bulan Ini", () =>
    expect(period("this_month")).toEqual({ startDate: "2026-08-01", endDate: "2026-08-10" }));
  it("crosses the year for Bulan Sebelumnya", () =>
    expect(resolve({ preset: "last_month", today: "2026-01-15" })).toEqual({
      startDate: "2025-12-01",
      endDate: "2025-12-31",
    }));
  it("resolves Pilih Bulan through its last calendar day", () =>
    expect(period("select_month", { selectedMonth: "2024-02" })).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    }));
  it("resolves Range Tanggal and rejects reversed ranges", () => {
    expect(period("custom", { startDate: "2026-08-02", endDate: "2026-08-07" })).toEqual({
      startDate: "2026-08-02",
      endDate: "2026-08-07",
    });
    expect(() => period("custom", { startDate: "2026-08-08", endDate: "2026-08-07" })).toThrow(
      "tidak boleh",
    );
  });
});
