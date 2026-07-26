import { describe, expect, it } from "vitest";

import { classifyFinanceError } from "@/lib/dynamicFinance";
import { aggregatePurchaseBreakdown } from "@/lib/juneFinance";

describe("dynamic finance error classification", () => {
  it("membedakan izin, validasi, konflik, dan sumber RPC", () => {
    expect(classifyFinanceError({ code: "42501" })).toContain("izin");
    expect(classifyFinanceError({ code: "23514" })).toContain("tidak valid");
    expect(classifyFinanceError({ code: "23505" })).toContain("sudah tersedia");
    expect(classifyFinanceError({ code: "PGRST202" })).toContain("migration");
  });

  it("tidak menyebut gangguan koneksi untuk error database generik", () => {
    const message = classifyFinanceError({ message: "relation rejected the query" });
    expect(message).toContain("Database menolak");
    expect(message.toLowerCase()).not.toContain("koneksi");
  });
});

describe("dynamic purchase breakdown", () => {
  it("menggabungkan historical dan operational rows tanpa bergantung supplier", () => {
    const result = aggregatePurchaseBreakdown([
      {
        item_name_normalized: "susu segar",
        financial_class: "hpp",
        amount: 100_000,
        line_count: 2,
      },
      {
        item_name_normalized: "Susu Segar",
        financial_class: "hpp",
        amount: 50_000,
        line_count: 1,
      },
      {
        item_name_normalized: "servis",
        financial_class: "operating_expense",
        amount: 25_000,
        line_count: 1,
      },
    ]);

    expect(result.hppTotal).toBe(150_000);
    expect(result.operatingExpenseTotal).toBe(25_000);
    expect(result.hpp[0]).toMatchObject({
      name: "susu segar",
      financialClass: "hpp",
      amount: 150_000,
      lineCount: 3,
    });
  });
});
