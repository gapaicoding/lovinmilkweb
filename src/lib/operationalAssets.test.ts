import { describe, expect, it } from "vitest";
import { bookValueAt, depreciationPreview, validateAssetAccounting } from "./operationalAssets";

const base = {
  acquisitionCost: 12_000_000,
  residualValue: 0,
  usefulLifeMonths: 12,
  acquisitionDate: "2026-07-31",
};

describe("operational asset previews", () => {
  it("uses straight-line monthly values and acquisition-month inputs", () => {
    expect(depreciationPreview(base)).toEqual({
      base: 12_000_000,
      monthly: 1_000_000,
      finalPeriod: 1_000_000,
    });
  });

  it("adjusts the final uneven period without drift", () => {
    const result = depreciationPreview({ ...base, acquisitionCost: 10_000_000, usefulLifeMonths: 36 });
    expect(result.monthly * 35 + result.finalPeriod).toBe(10_000_000);
  });

  it("validates residual and useful life", () => {
    expect(validateAssetAccounting({ ...base, residualValue: 13_000_000 })).toMatch(/residu/);
    expect(validateAssetAccounting({ ...base, usefulLifeMonths: 0 })).toMatch(/Umur/);
  });

  it("applies an as-of period cutoff", () => {
    expect(
      bookValueAt(12_000_000, 0, [
        { period: "2026-07-01", amount: 1_000_000 },
        { period: "2026-08-01", amount: 1_000_000 },
        { period: "2026-09-01", amount: 1_000_000 },
      ], "2026-08-01"),
    ).toEqual({ accumulated: 2_000_000, bookValue: 10_000_000 });
  });
});
