import { describe, expect, it } from "vitest";
import { salesRecapFilename } from "@/lib/salesRecapWorkbook";

describe("sales recap workbook", () => {
  it("creates a predictable custom-range filename", () => {
    expect(salesRecapFilename("2026-08-11", "2026-08-14")).toContain("11 Agustus 2026 s.d. 14 Agustus 2026");
  });
});
