import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260829120000_supplier_master_v2.sql"), "utf8").toLowerCase();

describe("supplier master v2 migration contract", () => {
  it("extends inputters and defines authoritative atomic catalog writes", () => {
    expect(sql).toMatch(/section\s+in\s*\(\s*'sales'\s*,\s*'expenses'\s*,\s*'suppliers'\s*\)/);
    expect(sql).toContain("nama penginput supplier belum diatur");
    expect(sql).toContain("save_supplier_with_items");
    expect(sql).toMatch(/alter table public\.supplier_items alter column supplier_id set not null/);
    expect(sql).toMatch(/before update of inputter_name on public\.suppliers/);
    expect(sql).toMatch(/before update of inputter_name on public\.supplier_items/);
  });
  it("authoritatively snapshots Supplier and Supplier Item inserts", () => {
    expect(sql).toMatch(
      /create\s+trigger\s+suppliers_snapshot_inputter[\s\S]*?before\s+insert\s+on\s+public\.suppliers[\s\S]*?lm_snapshot_supplier_inputter_on_insert\s*\(\s*\)/,
    );
    expect(sql).toMatch(
      /create\s+trigger\s+supplier_items_snapshot_inputter[\s\S]*?before\s+insert\s+on\s+public\.supplier_items[\s\S]*?lm_snapshot_supplier_item_inputter_on_insert\s*\(\s*\)/,
    );
    expect(sql).toMatch(
      /lm_snapshot_supplier_inputter_on_insert[\s\S]*?new\.outlet_id\s*:=\s*v_outlet[\s\S]*?new\.inputter_name\s*:=\s*public\.lm_get_active_operational_inputter\s*\(\s*v_outlet\s*,\s*'suppliers'\s*\)/,
    );
    expect(sql).toMatch(
      /lm_snapshot_supplier_item_inputter_on_insert[\s\S]*?from\s+public\.suppliers\s+s[\s\S]*?s\.id\s*=\s*new\.supplier_id[\s\S]*?v_requested_outlet\s*<>\s*v_supplier_outlet[\s\S]*?new\.outlet_id\s*:=\s*v_supplier_outlet[\s\S]*?new\.inputter_name\s*:=\s*public\.lm_get_active_operational_inputter/,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.lm_snapshot_supplier_inputter_on_insert\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.lm_snapshot_supplier_item_inputter_on_insert\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
    );
  });
  it("uses canonical UUID validation and never updates deleted catalog items", () => {
    expect(sql).toContain(
      "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    );
    expect(sql).not.toContain("^[0-9a-f-]{36}$");
    expect(sql).toMatch(
      /exists\s*\(\s*select\s+1\s+from\s+public\.supplier_items[\s\S]*?id\s*=\s*v_item_id[\s\S]*?supplier_id\s*=\s*v_id[\s\S]*?deleted_at\s+is\s+null\s*\)/,
    );
    expect(sql).toMatch(
      /update\s+public\.supplier_items\s+set[\s\S]*?where\s+id\s*=\s*v_item_id\s+and\s+supplier_id\s*=\s*v_id\s+and\s+deleted_at\s+is\s+null/,
    );
  });
  it("resets only supplier master data without cascading operational history", () => {
    expect(sql).toContain("delete from public.supplier_items");
    expect(sql).toContain("delete from public.suppliers");
    expect(sql).not.toMatch(/truncate[\s\S]*cascade/);
    for (const table of ["purchase_invoices", "purchase_transactions", "inventory_movements", "sales_transactions", "operational_expenses", "assets"]) {
      expect(sql).not.toContain(`delete from public.${table}`);
    }
    expect(sql).toMatch(/not exists[\s\S]*purchase_invoices/);
    expect(sql).toMatch(/not exists[\s\S]*purchase_transactions/);
  });
});
