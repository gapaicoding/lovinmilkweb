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
const v3 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260831170000_operational_inputter_sessions_v3.sql"),
  "utf8",
);
const block = (start: string, end: string) =>
  sql.slice(sql.indexOf(start), end ? sql.indexOf(end, sql.indexOf(start)) : undefined);
describe("marketing migration security and integrity", () => {
  it("keeps six independent inputter sections", () => {
    for (const section of ["sales", "expenses", "suppliers", "visitors", "interviews", "marketing"])
      expect(sql).toContain(`'${section}'`);
  });
  it("authorizes all operational roles and canonical outlet", () => {
    expect(sql).toContain("array['staff','admin','super_admin']");
    expect(sql).toContain("lm_resolve_sales_outlet");
  });
  it("uses a narrow security-definer predicate with a safe search path", () => {
    const wrapper = block(
      "create or replace function public.lm_is_current_marketing_outlet",
      "revoke execute on function public.lm_resolve_sales_outlet",
    );
    expect(wrapper).toContain("returns boolean");
    expect(wrapper).toContain("stable");
    expect(wrapper).toContain("security definer");
    expect(wrapper).toContain("set search_path = pg_catalog, pg_temp");
    expect(wrapper).toContain("p_outlet_id = public.lm_resolve_sales_outlet(null)");
  });
  it("grants only the wrapper to authenticated and keeps the shared resolver private", () => {
    expect(sql).toContain(
      "revoke execute on function public.lm_resolve_sales_outlet(uuid)\nfrom public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.lm_is_current_marketing_outlet(uuid)\nto authenticated, service_role",
    );
    expect(sql).not.toMatch(/grant execute on function public\.lm_resolve_sales_outlet/i);
  });
  it("never invokes the private resolver directly from Marketing RLS", () => {
    const policies = block(
      "create policy marketing_recaps_read_staff",
      "revoke all on public.marketing_daily_recaps",
    );
    expect(policies).not.toContain("lm_resolve_sales_outlet(null)");
    expect(policies.match(/lm_is_active_staff_or_above\(\)/g)).toHaveLength(3);
  });
  it("scopes recap reads directly through the wrapper", () => {
    const policy = block(
      "create policy marketing_recaps_read_staff",
      "create policy marketing_members_read_staff",
    );
    expect(policy).toContain("lm_is_current_marketing_outlet(outlet_id)");
  });
  it("scopes membership and event reads through their current-Outlet parent", () => {
    const members = block(
      "create policy marketing_members_read_staff",
      "create policy marketing_events_read_staff",
    );
    const events = block(
      "create policy marketing_events_read_staff",
      "revoke all on public.marketing_daily_recaps",
    );
    for (const policy of [members, events]) {
      expect(policy).toContain("exists (");
      expect(policy).toContain("from public.marketing_daily_recaps r");
      expect(policy).toContain("lm_is_current_marketing_outlet(r.outlet_id)");
    }
  });
  it("enforces one parent per outlet/date and enum", () => {
    expect(sql).toContain("unique (outlet_id, business_date)");
    expect(sql).toContain("registration_type in ('PAID','UNPAID')");
  });
  it("revokes direct writes and uses an atomic RPC", () => {
    expect(sql).toContain("revoke all on public.marketing_daily_recaps");
    expect(sql).toContain("grant select on public.marketing_daily_recaps");
    expect(sql).toContain("save_marketing_daily_recap_v1");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.marketing_daily_/i);
  });
  it("keeps inputter require, start, and history whitelists at exactly six sections", () => {
    for (const functionName of [
      "lm_require_operational_inputter_session",
      "start_operational_inputter_session",
      "get_operational_inputter_history",
    ]) {
      const fn = block(
        `function public.${functionName}`,
        functionName === "get_operational_inputter_history"
          ? "create function public.save_marketing_daily_recap_v1"
          : "create or replace function public.",
      );
      for (const section of [
        "sales",
        "expenses",
        "suppliers",
        "visitors",
        "interviews",
        "marketing",
      ])
        expect(fn).toContain(`'${section}'`);
    }
  });
  it("keeps validate-session section-agnostic and therefore Marketing-compatible", () => {
    const validate = v3.slice(
      v3.indexOf("create or replace function public.validate_operational_inputter_session"),
      v3.indexOf("create or replace function public.get_operational_inputter_history"),
    );
    expect(validate).toContain("s.section=p_section");
    expect(validate).not.toMatch(/p_section not in/i);
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
