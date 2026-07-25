import { describe, expect, it } from "vitest";

import {
  aggregatePurchaseBreakdown,
  isActualJuneStatement,
  monthInputToStart,
  nextMonthStart,
  normalizeFinancialStatement,
  parseBreakdownFilter,
  parseMonthStart,
} from "@/lib/juneFinance";

describe("June finance helpers", () => {
  it("accepts canonical month filters and rejects invalid values", () => {
    expect(parseMonthStart("2026-06-01")).toBe("2026-06-01");
    expect(monthInputToStart("2026-06")).toBe("2026-06-01");
    expect(nextMonthStart("2026-12-01")).toBe("2027-01-01");
    expect(parseMonthStart("2026-06-15")).toBeUndefined();
    expect(parseMonthStart("2026-13-01")).toBeUndefined();
    expect(parseBreakdownFilter("hpp")).toBe("hpp");
    expect(parseBreakdownFilter("estimated")).toBeUndefined();
  });

  it("normalizes the approved June statement without mixing legacy values", () => {
    const statement = normalizeFinancialStatement({
      import_batch_id: "08da144c-5571-447b-a294-ecb730c4a0d8",
      batch_key: "LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2",
      batch_status: "reconciled",
      month_start: "2026-06-01",
      revenue: "30011000.00",
      hpp: "10488538.00",
      gross_profit: "19522462.00",
      operating_expense: "1046760.00",
      ebitda: "18475702.00",
      depreciation: "0.00",
      ebit_operating_profit: "18475702.00",
      tax_amount: null,
      tax_recorded: false,
      net_income_provisional_before_tax: "18475702.00",
      net_income_final: null,
      dividend_amount: null,
      dividend_recorded: false,
      retained_earnings_final: null,
      statement_status: "provisional_before_tax",
    });

    expect(statement.revenue - statement.hpp).toBe(statement.grossProfit);
    expect(statement.grossProfit - statement.operatingExpense).toBe(statement.ebitda);
    expect(statement.ebitda - statement.depreciation).toBe(statement.ebitOperatingProfit);
    expect(statement.taxRecorded).toBe(false);
    expect(statement.netIncomeFinal).toBeNull();
    expect(statement.dividendRecorded).toBe(false);
    expect(statement.retainedEarningsFinal).toBeNull();
    expect(isActualJuneStatement(statement)).toBe(true);
    expect(isActualJuneStatement({ ...statement, batchStatus: "imported" })).toBe(false);
  });

  it("groups purchase rows by class and normalized item", () => {
    const breakdown = aggregatePurchaseBreakdown([
      {
        item_name_normalized: "Susu segar",
        financial_class: "hpp",
        amount: "100000",
      },
      {
        item_name_normalized: "Susu segar",
        financial_class: "hpp",
        amount: 25000,
      },
      {
        item_name_normalized: "Tisu",
        financial_class: "operating_expense",
        amount: "5000",
      },
      {
        item_name_normalized: "Aset",
        financial_class: "asset",
        amount: "999999",
      },
    ]);

    expect(breakdown.hppTotal).toBe(125000);
    expect(breakdown.operatingExpenseTotal).toBe(5000);
    expect(breakdown.hpp).toEqual([
      expect.objectContaining({
        name: "Susu segar",
        amount: 125000,
        lineCount: 2,
      }),
    ]);
    expect(breakdown.operatingExpense).toHaveLength(1);
  });
});
