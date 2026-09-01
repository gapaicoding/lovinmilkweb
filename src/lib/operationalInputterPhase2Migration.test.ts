import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  resolve(root, "supabase/migrations/20260901150000_operational_inputter_v3_phase2_cleanup.sql"),
  "utf8",
).toLowerCase();
const source = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("Operational Inputter V3 Phase-2 cleanup", () => {
  it("fails closed instead of reading the Phase-1 setting fallback", () => {
    expect(sql).not.toMatch(/from\s+public\.operational_inputter_settings/);
    expect(sql).toContain("sesi penginput wajib diisi");
    expect(sql).toContain("create or replace function public.lm_snapshot_operational_inputter()");
    expect(sql).toContain("create or replace function public.lm_snapshot_supplier_inputter_on_insert()");
    expect(sql).toContain("create or replace function public.lm_snapshot_supplier_item_inputter_on_insert()");
    expect(sql).toContain("create or replace function public.lm_snapshot_visitor_inputter()");
  });

  it("retires legacy authenticated write and active-inputter execution", () => {
    expect(sql).toContain("revoke all on function public.get_operational_inputter(text,uuid),public.set_operational_inputter(text,text,uuid)");
    for (const signature of [
      "create_operational_expense(date,text,numeric,text,numeric,numeric,uuid,text,text,text)",
      "save_supplier_with_items(jsonb,jsonb,uuid,uuid)",
      "create_sales_transaction_with_visit(date,jsonb,text,text,uuid,uuid,jsonb)",
      "update_sales_transaction_with_visit(uuid,date,jsonb,text,uuid,jsonb)",
      "create_or_append_visitor_daily_recap(date,uuid,text,jsonb)",
      "create_operational_visitor_visit(date,integer,integer,uuid,text,uuid)",
    ]) {
      expect(sql).toContain(`public.${signature}`);
    }
    expect(sql).toContain("from public,anon,authenticated");
  });

  it("keeps only the idempotent Visitor V3 overload executable", () => {
    expect(sql).toMatch(/create_or_append_visitor_daily_recap_v3\(date,uuid,uuid,text,jsonb\)\s+from public,anon,authenticated/);
    expect(sql).toMatch(/create_or_append_visitor_daily_recap_v3\(date,uuid,uuid,text,jsonb,uuid\)\s+to authenticated/);
  });

  it("preserves session RPC grants and snapshot immutability", () => {
    for (const signature of [
      "start_operational_inputter_session(text,text,uuid)",
      "validate_operational_inputter_session(uuid,text,uuid)",
      "get_operational_inputter_history(text,uuid,integer)",
      "create_operational_expense_v3(date,text,numeric,text,numeric,numeric,uuid,uuid,text,text,text)",
      "save_supplier_with_items_v3(jsonb,jsonb,uuid,uuid,uuid)",
      "create_sales_transaction_with_visit_v3(date,jsonb,uuid,text,text,uuid,uuid,jsonb)",
      "update_sales_transaction_with_visit_v3(uuid,date,jsonb,text,uuid,jsonb,uuid)",
    ]) {
      expect(sql).toContain(`public.${signature}`);
    }
    expect(source("supabase/migrations/20260831170000_operational_inputter_sessions_v3.sql")).toContain("new.inputter_session_id:=old.inputter_session_id");
    expect(source("supabase/migrations/20260831170000_operational_inputter_sessions_v3.sql")).toMatch(/add column inputter_session_id uuid references/);
  });

  it("proves the dead VisitorVisitManager has no runtime reachability", () => {
    expect(source("src/routes/_authenticated/kunjungan.tsx")).toContain("component: VisitorRecapPage");
    expect(source("src/components/VisitorRecapPage.tsx")).toContain("<VisitorDailyRecapPanel />");
    expect(source("src/routes/_authenticated/pengunjung.tsx")).toContain("component: VisitorManager");
    expect(source("src/routeTree.gen.ts")).toContain("AuthenticatedKunjunganRouteImport");
    expect(existsSync(resolve(root, "src/components/VisitorVisitManager.tsx"))).toBe(false);
    expect(source("src/components/visitor/VisitorDailyRecapPanel.tsx")).toContain('rpc("create_or_append_visitor_daily_recap_v3"');
    expect(source("src/hooks/useSalesTransactions.ts")).toContain('rpc("create_sales_transaction_with_visit_v3"');
    expect(source("src/hooks/useOperationalExpenses.ts")).toContain('rpc("create_operational_expense_v3"');
    expect(source("src/routes/_authenticated/supplier.tsx")).toContain('rpc("save_supplier_with_items_v3"');
    for (const file of [
      "src/hooks/useOperationalExpenses.ts",
      "src/hooks/useSalesTransactions.ts",
      "src/routes/_authenticated/supplier.tsx",
      "src/components/visitor/VisitorDailyRecapPanel.tsx",
    ]) {
      const runtimeSource = source(file);
      expect(runtimeSource).not.toContain('rpc("create_operational_expense"');
      expect(runtimeSource).not.toContain('rpc("save_supplier_with_items"');
      expect(runtimeSource).not.toContain('rpc("create_sales_transaction_with_visit"');
      expect(runtimeSource).not.toContain('rpc("update_sales_transaction_with_visit"');
      expect(runtimeSource).not.toContain('rpc("create_or_append_visitor_daily_recap"');
      expect(runtimeSource).not.toContain('rpc("create_operational_visitor_visit"');
    }
  });
});
