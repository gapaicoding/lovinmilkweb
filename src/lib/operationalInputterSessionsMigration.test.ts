import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260831170000_operational_inputter_sessions_v3.sql",
  "utf8",
).toLowerCase();

describe("operational inputter sessions v3 migration", () => {
  it("creates append-oriented history for all four sections", () => {
    expect(sql).toContain("create table public.operational_inputter_sessions");
    for (const section of ["sales", "expenses", "suppliers", "visitors"])
      expect(sql).toContain(`'${section}'`);
    expect(sql).toContain("superseded_at=clock_timestamp()");
    expect(sql).toContain("insert into public.operational_inputter_sessions");
  });
  it("validates actor, outlet, section, and superseded state", () => {
    expect(sql).toContain("v_row.actor_id<>v_actor");
    expect(sql).toContain("v_row.outlet_id<>v_outlet");
    expect(sql).toContain("v_row.section<>p_section");
    expect(sql).toContain("v_row.superseded_at is not null");
  });
  it("requires session ids in every new create wrapper and derives names server-side", () => {
    for (const fn of [
      "create_sales_transaction_with_visit",
      "create_operational_expense",
      "save_supplier_with_items",
      "create_or_append_visitor_daily_recap",
    ])
      expect(sql).toContain(`function public.${fn}`);
    expect(sql).toContain("p_inputter_session_id uuid");
    expect(sql).toContain("new.inputter_name:=v.inputter_name");
    expect(sql).not.toMatch(/select[^;]+operational_inputter_settings/s);
  });
  it("protects both historical snapshot columns and leaves old ids nullable", () => {
    expect(sql).toContain("add column inputter_session_id uuid");
    expect(sql).toContain("new.inputter_name:=old.inputter_name");
    expect(sql).toContain("new.inputter_session_id:=old.inputter_session_id");
    expect(sql).not.toContain("inputter_session_id uuid not null");
  });
  it("keeps the first visitor recorder while allowing later inputters to append", () => {
    expect(sql).toContain("v_header_name:=case when exists");
    expect(sql).toContain("then null else v.inputter_name end");
    expect(sql).toContain("'inputter_name',v.inputter_name");
  });
  it("retires authenticated execution of unambiguous renamed legacy implementations", () => {
    expect(sql).toContain("rename to create_operational_expense_v2_legacy");
    expect(sql).toContain("revoke all on function public.create_operational_expense_v2_legacy");
    expect(sql).toContain("save_supplier_with_items_v2_legacy");
    expect(sql).toContain("create_sales_transaction_with_visit_v2_legacy");
  });
});
