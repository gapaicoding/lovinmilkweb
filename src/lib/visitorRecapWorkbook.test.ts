import { describe, expect, it } from "vitest";
import { buildVisitorRecapSheetModel, excelColumnName } from "./visitorRecapWorkbook";
describe("visitor recap workbook", () => {
  it("builds 66 columns through BN and aggregates duplicate slots", () => {
    const model = buildVisitorRecapSheetModel([{business_date:"2026-08-28",recorder_name:"Via",arrival_time:"07:00",adult_count:2,child_count:1},{business_date:"2026-08-28",recorder_name:"Via",arrival_time:"07:00",adult_count:1,child_count:2}],"2026-08-28","2026-08-28");
    expect(model.columns).toHaveLength(66); expect(model.data[4]).toHaveLength(66); expect(excelColumnName(66)).toBe("BN");
    expect((model.data[4][3] as {value:string}).value).toBe("Via"); expect((model.data[4][4] as {value:number}).value).toBe(3); expect((model.data[4][35] as {value:number}).value).toBe(3);
  });
  it("includes empty and cross-month calendar dates",()=>{ const model=buildVisitorRecapSheetModel([],"2026-07-31","2026-08-01"); expect(model.data).toHaveLength(6); });
});
