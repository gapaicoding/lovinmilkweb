import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const sql=readFileSync("supabase/migrations/20260831170000_operational_inputter_sessions_v3.sql","utf8").toLowerCase();
const salesHook=readFileSync("src/hooks/useSalesTransactions.ts","utf8");
const salesManager=readFileSync("src/components/sales/SalesTransactionManager.tsx","utf8");
const expenseHook=readFileSync("src/hooks/useOperationalExpenses.ts","utf8");
const supplierRoute=readFileSync("src/routes/_authenticated/supplier.tsx","utf8");
const visitorPanel=readFileSync("src/components/visitor/VisitorDailyRecapPanel.tsx","utf8");

describe("operational inputter sessions V3 Phase-1 migration",()=>{
 it("keeps append-only session history and all sections",()=>{expect(sql).toContain("create table public.operational_inputter_sessions");for(const section of ["sales","expenses","suppliers","visitors"])expect(sql).toContain(`'${section}'`);expect(sql).toContain("superseded_at=clock_timestamp()")});
 it("preserves deployed legacy RPC names and execution",()=>{for(const name of ["create_operational_expense_v2_legacy","save_supplier_with_items_v2_legacy","create_sales_transaction_with_visit_v2_legacy","create_or_append_visitor_daily_recap_v2_legacy"])expect(sql).not.toContain(`rename to ${name}`);expect(sql).not.toMatch(/revoke[^;]+on function public\.create_operational_expense\(date,text,numeric,text,numeric,numeric,uuid,text,text,text\)[^;]+authenticated/);expect(sql).toContain("temporary phase-1 compatibility source")});
 it("adds explicit secured V3 RPCs",()=>{for(const name of ["create_operational_expense_v3","save_supplier_with_items_v3","create_sales_transaction_with_visit_v3","update_sales_transaction_with_visit_v3","create_or_append_visitor_daily_recap_v3"])expect(sql).toContain(`function public.${name}`);expect(sql).toContain("security definer set search_path=public,pg_catalog");expect(sql).toMatch(/revoke all on function public\.create_operational_expense_v3[\s\S]+from public,anon,authenticated/);expect(sql).toMatch(/grant execute on function public\.create_operational_expense_v3[\s\S]+to authenticated/)});
 it("validates actor, outlet, section and superseded state",()=>{expect(sql).toContain("v_row.actor_id<>v_actor");expect(sql).toContain("v_row.outlet_id<>v_outlet");expect(sql).toContain("v_row.section<>p_section");expect(sql).toContain("v_row.superseded_at is not null")});
 it("uses V3 validation when present and legacy fallback otherwise",()=>{expect(sql).toContain("if v_session is null then");expect(sql).toContain("from public.operational_inputter_settings");expect(sql).toContain("lm_require_operational_inputter_session(v_session");expect(sql).toContain("new.inputter_session_id:=null")});
 it("restores Supplier item existence, deletion and outlet mismatch guards",()=>{expect(sql).toContain("where s.id=new.supplier_id and s.deleted_at is null");expect(sql).toContain("supplier tidak valid untuk item supplier");expect(sql).toContain("v_requested_outlet<>v_supplier_outlet");expect(sql).toContain("outlet item supplier tidak sesuai dengan supplier");expect(sql).toContain("new.outlet_id:=v_supplier_outlet");expect(sql).toContain("'suppliers',v_supplier_outlet")});
 it("requires Sales session only when an update creates a visitor",()=>{expect(sql).toContain("if p_new_visit is not null then");expect(sql).toContain("lm_require_operational_inputter_session(p_inputter_session_id,'sales',v_outlet)");expect(sql).toContain("return public.update_sales_transaction_with_visit(");expect(sql).toContain("new.inputter_name:=old.inputter_name")});
 it("keeps first visitor recorder and immutable per-entry snapshots",()=>{expect(sql).toContain("v_header_name:=case when exists");expect(sql).toContain("then null else v.inputter_name end");expect(sql).toContain("new.inputter_session_id:=old.inputter_session_id")});
});

describe("active frontend V3 RPC routing",()=>{
 it("uses explicit V3 names for all create flows",()=>{expect(salesHook).toContain('rpc("create_sales_transaction_with_visit_v3"');expect(expenseHook).toContain('rpc("create_operational_expense_v3"');expect(supplierRoute).toContain('rpc("save_supplier_with_items_v3"');expect(visitorPanel).toContain('rpc("create_or_append_visitor_daily_recap_v3"')});
 it("conditionally validates Sales session for edit plus new visitor",()=>{expect(salesHook).toContain('rpc("update_sales_transaction_with_visit_v3"');expect(salesManager).toContain('input.visit?.mode === "new" ? await salesInputter.ensureValidSession() : null');expect(salesHook).toContain("...(inputterSessionId ? { p_inputter_session_id: inputterSessionId } : {})")});
});
