import { describe, expect, it } from "vitest";
import { expenseScopeLabel, validateOperationalExpense } from "./operationalExpenses";

describe("operational expense", () => {
  it("rejects non-positive and non-finite values", () => {
    expect(validateOperationalExpense({ expenseDate: "2026-07-01", amount: 0, costCategoryId: "x" })).toBeTruthy();
    expect(validateOperationalExpense({ expenseDate: "2026-07-01", amount: Number.NaN, costCategoryId: "x" })).toBeTruthy();
  });
  it("distinguishes direct and shared cost", () => {
    expect(expenseScopeLabel("subunit", "Arayya")).toContain("langsung");
    expect(expenseScopeLabel("outlet")).toContain("bersama");
  });
});
