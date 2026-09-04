import { describe, expect, it } from "vitest";
import { buildMarketingWorkbook } from "./marketingDevelopmentWorkbook";
describe("marketing workbook", () => {
  it("keeps a numeric main count and separate detail sheets", () => {
    const sheets = buildMarketingWorkbook([], "2026-08");
    expect(sheets.map((s) => s.sheet)).toEqual([
      "Rekap Marketing",
      "Detail Membership Baru",
      "Detail Event Marketing",
    ]);
    expect(sheets[0].data).toHaveLength(34);
    expect((sheets[0].data[3][2] as { value: number }).value).toBe(0);
  });
});
