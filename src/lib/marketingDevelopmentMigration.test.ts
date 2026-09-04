import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260904170000_marketing_development_daily_recap.sql",
  ),
  "utf8",
);
describe("marketing migration security and integrity", () => {
  it("keeps six independent inputter sections", () => {
    for (const section of ["sales", "expenses", "suppliers", "visitors", "interviews", "marketing"])
      expect(sql).toContain(`'${section}'`);
  });
  it("authorizes all operational roles and canonical outlet", () => {
    expect(sql).toContain("array['staff','admin','super_admin']");
    expect(sql).toContain("lm_resolve_sales_outlet");
  });
  it("enforces one parent per outlet/date and enum", () => {
    expect(sql).toContain("unique (outlet_id, business_date)");
    expect(sql).toContain("registration_type in ('PAID','UNPAID')");
  });
  it("revokes direct writes and uses an atomic RPC", () => {
    expect(sql).toContain("revoke all on public.marketing_daily_recaps");
    expect(sql).toContain("grant select on public.marketing_daily_recaps");
    expect(sql).toContain("save_marketing_daily_recap_v1");
  });
  it("preserves creator/inputter columns on edit", () => {
    const update = sql.match(/update public\.marketing_daily_recaps set ([^;]+);/i)?.[1] ?? "";
    expect(update).not.toContain("inputter_name=");
    expect(update).not.toContain("inputter_session_id=");
    expect(update).not.toContain("created_by=");
  });
  it("replaces both child collections inside the transaction", () => {
    expect(sql).toContain(
      "delete from public.marketing_daily_membership_entries where recap_id=v_recap",
    );
    expect(sql).toContain("delete from public.marketing_daily_events where recap_id=v_recap");
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
  it("has no automatic integrations or historical imports", () => {
    expect(sql).not.toMatch(
      /\bfrom public\.(sales_transactions|memberships|customer_interviews)\b/i,
    );
    expect(sql).not.toMatch(/Budi|Uha Isnaini|Rasyid El Faerizy|Endang Sri Itayati/);
  });
});
