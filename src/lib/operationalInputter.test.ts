import { describe, expect, it } from "vitest";
import { displayOperationalInputter, normalizeOperationalInputter, operationalInputterQueryKey } from "@/lib/operationalInputter";

describe("operational inputter", () => {
  it("normalizes names", () => {
    expect(normalizeOperationalInputter(" Budi ")).toBe("Budi");
    expect(normalizeOperationalInputter("Rina Putri")).toBe("Rina Putri");
  });
  it("rejects blank and overlong names", () => {
    expect(() => normalizeOperationalInputter("   ")).toThrow("wajib");
    expect(() => normalizeOperationalInputter("a".repeat(101))).toThrow("100");
  });
  it("keeps section query state independent", () => {
    expect(operationalInputterQueryKey("outlet", "sales")).not.toEqual(operationalInputterQueryKey("outlet", "expenses"));
    expect(operationalInputterQueryKey("outlet", "suppliers")).not.toEqual(operationalInputterQueryKey("outlet", "sales"));
    expect(operationalInputterQueryKey("outlet", "suppliers")).not.toEqual(operationalInputterQueryKey("outlet", "expenses"));
  });
  it("displays historical null safely", () => {
    expect(displayOperationalInputter(null)).toBe("—");
  });
});
