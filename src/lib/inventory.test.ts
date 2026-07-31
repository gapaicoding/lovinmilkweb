import { describe, expect, it } from "vitest";

import {
  canCreateInventoryRequirement,
  calculateRequiredQuantity,
  calculateStockVariance,
  isValidPhysicalQuantity,
  isValidPositiveQuantity,
  isLowStock,
  toInventoryNumber,
} from "@/lib/inventory";

describe("inventory domain", () => {
  it("menghitung variance positif dan negatif secara deterministik", () => {
    expect(calculateStockVariance(10, 12.12555)).toBe(2.1256);
    expect(calculateStockVariance(10, 7)).toBe(-3);
  });

  it("menghitung kebutuhan BOM dari quantity penjualan", () => {
    expect(calculateRequiredQuantity(3, 1.25)).toBe(3.75);
  });

  it("menandai stok pada atau di bawah minimum", () => {
    expect(isLowStock({ current_stock: "5", minimum_stock: "5" })).toBe(true);
    expect(isLowStock({ current_stock: 6, minimum_stock: 5 })).toBe(false);
  });

  it("mengamankan numeric kosong/tidak valid", () => {
    expect(toInventoryNumber(null)).toBe(0);
    expect(toInventoryNumber("invalid")).toBe(0);
  });

  it("memvalidasi quantity tanpa batas maksimum arbitrer", () => {
    expect(isValidPositiveQuantity(0.0001)).toBe(true);
    expect(isValidPositiveQuantity(0)).toBe(false);
    expect(isValidPositiveQuantity(-1)).toBe(false);
    expect(isValidPositiveQuantity(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidPhysicalQuantity(0)).toBe(true);
    expect(isValidPhysicalQuantity(-0.0001)).toBe(false);
    expect(isValidPhysicalQuantity(Number.NaN)).toBe(false);
  });

  it("mencegah BOM lintas Subunit dan master nonaktif di frontend", () => {
    const valid = {
      productSubunitId: "subunit-a",
      inventoryItemSubunitId: "subunit-a",
      productIsActive: true,
      categoryIsActive: true,
      subunitIsActive: true,
      inventoryItemIsActive: true,
    };
    expect(canCreateInventoryRequirement(valid)).toBe(true);
    expect(canCreateInventoryRequirement({
      ...valid,
      inventoryItemSubunitId: "subunit-b",
    })).toBe(false);
    expect(canCreateInventoryRequirement({
      ...valid,
      inventoryItemIsActive: false,
    })).toBe(false);
  });
});
