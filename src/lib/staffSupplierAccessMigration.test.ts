import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260829150000_staff_supplier_operational_access.sql",
  ),
  "utf8",
).toLowerCase();

describe("staff supplier operational access migration contract", () => {
  it("allows Staff to read only active Supplier catalog rows", () => {
    expect(sql).toMatch(
      /create\s+policy\s+suppliers_select_staff_active[\s\S]*?on\s+public\.suppliers[\s\S]*?for\s+select[\s\S]*?lm_is_active_staff_or_above\s*\(\s*\)[\s\S]*?deleted_at\s+is\s+null[\s\S]*?is_active\s*=\s*true/,
    );

    expect(sql).toMatch(
      /create\s+policy\s+supplier_items_select_staff_active[\s\S]*?on\s+public\.supplier_items[\s\S]*?for\s+select[\s\S]*?lm_is_active_staff_or_above\s*\(\s*\)[\s\S]*?deleted_at\s+is\s+null[\s\S]*?is_active\s*=\s*true[\s\S]*?from\s+public\.suppliers\s+s/,
    );
  });

  it("does not grant Staff direct Supplier writes or Purchase financial reads", () => {
    expect(sql).not.toContain("suppliers_insert_staff");
    expect(sql).not.toContain("suppliers_update_staff");
    expect(sql).not.toContain("suppliers_delete_staff");
    expect(sql).not.toContain("supplier_items_insert_staff");
    expect(sql).not.toContain("supplier_items_update_staff");
    expect(sql).not.toContain("supplier_items_delete_staff");
    expect(sql).not.toContain("purchase_invoices_select_staff");
    expect(sql).not.toContain("purchase_items_select_staff");
  });

  it("allows Staff to set Supplier inputter while preserving the ON CONSTRAINT hotfix", () => {
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.set_operational_inputter[\s\S]*?require_visitor_role\s*\(\s*array\s*\[\s*'staff'\s*,\s*'admin'\s*,\s*'super_admin'\s*\]/,
    );

    expect(sql).toMatch(
      /on\s+conflict\s+on\s+constraint\s+operational_inputter_settings_outlet_section_key/,
    );

    expect(sql).not.toMatch(
      /on\s+conflict\s*\(\s*outlet_id\s*,\s*section\s*\)/,
    );
  });

  it("allows Staff to save active Suppliers but preserves Supplier lifecycle for Admin", () => {
    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.save_supplier_with_items[\s\S]*?require_visitor_role\s*\(\s*array\s*\[\s*'staff'\s*,\s*'admin'\s*,\s*'super_admin'\s*\]/,
    );

    expect(sql).toMatch(
      /v_is_admin\s*:=\s*coalesce\s*\(\s*public\.lm_is_active_admin\s*\(\s*\)\s*,\s*false\s*\)/,
    );

    expect(sql).toMatch(
      /case\s+when\s+v_is_admin[\s\S]*?else\s+true\s+end[\s\S]*?v_inputter/,
    );

    expect(sql).toMatch(
      /is_active\s*=\s*case\s+when\s+v_is_admin[\s\S]*?else\s+s\.is_active\s+end/,
    );

    expect(sql).toMatch(
      /and\s*\(\s*v_is_admin\s+or\s+s\.is_active\s*=\s*true\s*\)/,
    );
  });

  it("allows Supplier export for Staff without opening financial export families", () => {
    expect(sql).toContain("'suppliers'");

    expect(sql).toMatch(
      /if\s+p_report_type\s+in\s*\(\s*'financial'\s*,\s*'purchases'\s*,\s*'assets'\s*,\s*'depreciation'\s*\)[\s\S]*?not\s+public\.lm_is_active_admin\s*\(\s*\)/,
    );

    expect(sql).not.toMatch(
      /p_report_type\s+in\s*\([^)]*'suppliers'[^)]*\)[\s\S]*?not\s+public\.lm_is_active_admin/,
    );
  });

  it("does not contain destructive Supplier or operational data reset", () => {
    expect(sql).not.toMatch(/truncate[\s\S]*cascade/);

    for (const table of [
      "suppliers",
      "supplier_items",
      "purchase_invoices",
      "purchase_transactions",
      "inventory_movements",
      "sales_transactions",
      "operational_expenses",
      "assets",
    ]) {
      expect(sql).not.toContain(`delete from public.${table}`);
    }
  });
});