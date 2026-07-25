import { describe, expect, it } from "vitest";

import {
  buildStraightLineSchedule,
  calculateMonthlyDepreciation,
  matchesAssetFilters,
  type FilterableAsset,
} from "@/lib/actualAssets";

const capitalizedAsset = {
  acquisitionDate: "2026-06-15",
  acquisitionCost: 1_200_000,
  residualValue: 0,
  usefulLifeMonths: 12,
  capitalizationStatus: "capitalized" as const,
  depreciationStartDate: "2026-07-01",
};

describe("asset depreciation", () => {
  it("menghitung penyusutan garis lurus dan nilai buku akhir", () => {
    expect(calculateMonthlyDepreciation(capitalizedAsset)).toBe(100_000);

    const schedule = buildStraightLineSchedule(capitalizedAsset);

    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toEqual({
      periodMonth: "2026-07-01",
      depreciationAmount: 100_000,
      accumulatedDepreciation: 100_000,
      endingBookValue: 1_100_000,
    });
    expect(schedule.at(-1)?.endingBookValue).toBe(0);
  });

  it("menaruh selisih pembulatan pada bulan terakhir", () => {
    const schedule = buildStraightLineSchedule({
      ...capitalizedAsset,
      acquisitionCost: 100,
      usefulLifeMonths: 3,
    });

    expect(schedule.map((row) => row.depreciationAmount)).toEqual([33.33, 33.33, 33.34]);
    expect(schedule.at(-1)?.accumulatedDepreciation).toBe(100);
  });

  it("tidak menyusutkan aset tracking-only", () => {
    const trackingOnly = {
      ...capitalizedAsset,
      capitalizationStatus: "tracking_only_expensed" as const,
    };

    expect(calculateMonthlyDepreciation(trackingOnly)).toBe(0);
    expect(buildStraightLineSchedule(trackingOnly)).toEqual([]);
  });
});

describe("asset filters", () => {
  const asset: FilterableAsset = {
    assetName: "Mixer Susu",
    assetCode: "AST-021",
    brand: "Lovin",
    categoryId: "equipment",
    assetStatus: "active",
    capitalizationStatus: "tracking_only_expensed",
    acquisitionDate: "2026-06-08",
    deletedAt: null,
  };

  it("mencari tanpa membedakan kapitalisasi huruf", () => {
    expect(matchesAssetFilters(asset, { query: "MIXER" })).toBe(true);
    expect(matchesAssetFilters(asset, { query: "ast-021" })).toBe(true);
    expect(matchesAssetFilters(asset, { query: "freezer" })).toBe(false);
  });

  it("menggabungkan kategori, status, tanggal, dan kapitalisasi", () => {
    expect(
      matchesAssetFilters(asset, {
        categoryId: "equipment",
        status: "active",
        capitalization: "tracking_only_expensed",
        from: "2026-06-01",
        to: "2026-06-30",
      }),
    ).toBe(true);

    expect(matchesAssetFilters(asset, { from: "2026-06-09" })).toBe(false);
    expect(matchesAssetFilters(asset, { status: "disposed" })).toBe(false);
  });

  it("memisahkan data aktif dan soft-deleted", () => {
    expect(matchesAssetFilters(asset, { deleted: "active" })).toBe(true);
    expect(matchesAssetFilters(asset, { deleted: "deleted" })).toBe(false);
    expect(
      matchesAssetFilters(
        {
          ...asset,
          deletedAt: "2026-07-25T12:00:00Z",
        },
        { deleted: "deleted" },
      ),
    ).toBe(true);
  });
});
