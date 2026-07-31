import { describe, expect, it } from "vitest";

import {
  calculateGrossProfit,
  calculatePurchaseSubtotal,
  calculatePurchaseTotal,
  formatCostStatus,
  summarizePurchaseSubunits,
  validatePurchaseLines,
} from "./purchases";

describe("purchase domain", () => {
  it("calculates canonical previews without accepting invalid numbers", () => {
    expect(calculatePurchaseSubtotal(10, 5_000)).toBe(50_000);
    expect(calculatePurchaseSubtotal(Number.NaN, 5_000)).toBe(0);
    expect(calculatePurchaseTotal([
      { inventoryItemId: "a", quantity: 10, unitCost: 5_000 },
      { inventoryItemId: "b", quantity: 2, unitCost: 7_500 },
    ])).toBe(65_000);
  });

  it("validates duplicate items, quantity, and unit cost", () => {
    expect(validatePurchaseLines([])).toMatch(/Minimal/);
    expect(validatePurchaseLines([
      { inventoryItemId: "a", quantity: 1, unitCost: 0 },
    ])).toBeNull();
    expect(validatePurchaseLines([
      { inventoryItemId: "a", quantity: 1, unitCost: 1 },
      { inventoryItemId: "a", quantity: 1, unitCost: 1 },
    ])).toMatch(/dua kali/);
  });

  it("summarizes mixed Subunits and operational profit", () => {
    expect(summarizePurchaseSubunits(["Arayya", "Lovin Milk", "Arayya"])).toBe(
      "Arayya + Lovin Milk",
    );
    expect(calculateGrossProfit(50_000, 20_000)).toBe(30_000);
    expect(formatCostStatus("provisional")).toBe("Provisional");
  });
});
