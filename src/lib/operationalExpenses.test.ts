import { describe, expect, it } from "vitest";
import { suggestedExpenseAmount, validateOperationalExpense } from "./operationalExpenses";

const valid = {
  expenseDate: "2026-08-10",
  itemName: " Ayam ",
  quantity: 2.5,
  unit: " kg ",
  unitPrice: 36000,
  amount: 90000,
  costCategoryId: "category",
  notes: "",
};

describe("operational expense detail", () => {
  it("accepts free-text items, units, decimals, and an independently edited total", () => {
    expect(
      validateOperationalExpense({ ...valid, quantity: 3, unitPrice: 5300, amount: 16000 }),
    ).toBeNull();
  });
  it("validates required accounting detail", () => {
    expect(validateOperationalExpense({ ...valid, itemName: " " })).toBe(
      "Nama barang wajib diisi.",
    );
    expect(validateOperationalExpense({ ...valid, quantity: 0 })).toBe(
      "Jumlah harus lebih dari 0.",
    );
    expect(validateOperationalExpense({ ...valid, unit: " " })).toBe("Satuan ukuran wajib diisi.");
    expect(validateOperationalExpense({ ...valid, unitPrice: -1 })).toBe(
      "Harga satuan tidak valid.",
    );
    expect(validateOperationalExpense({ ...valid, amount: 0 })).toBe(
      "Harga total harus lebih dari 0.",
    );
  });
  it("calculates a non-authoritative amount suggestion", () => {
    expect(suggestedExpenseAmount(2.5, 5300)).toBe(13250);
  });
});
