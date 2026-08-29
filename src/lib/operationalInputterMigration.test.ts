import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260828130000_operational_inputter_snapshots.sql",
  ),
  "utf8",
).toLowerCase();

describe("operational inputter migration contract", () => {
  it("defines scoped settings, snapshots, RPCs, and raw-write restrictions", () => {
    expect(sql).toContain("create table public.operational_inputter_settings");
    expect(sql).toMatch(/unique\s*\(\s*outlet_id\s*,\s*section\s*\)/);
    expect(sql).toMatch(/section\s+in\s*\(\s*'sales'\s*,\s*'expenses'\s*\)/);
    expect(sql).toMatch(/add\s+column\s+inputter_name\s+text\s+null/);
    expect(sql).toContain(
      "create or replace function public.get_operational_inputter",
    );
    expect(sql).toContain(
      "create or replace function public.set_operational_inputter",
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+table\s+public\.operational_inputter_settings\s+from\s+public\s*,\s*anon\s*,\s*authenticated/,
    );
  });

  it("snapshots on insert, rejects missing settings, and preserves snapshots on update", () => {
    expect(sql).toMatch(/before\s+insert\s+on\s+public\.sales_transactions/);
    expect(sql).toMatch(
      /before\s+insert\s+on\s+public\.operational_expenses/,
    );
    expect(sql).toContain("nama penginput penjualan belum diatur");
    expect(sql).toContain("nama penginput pengeluaran belum diatur");
    expect(sql).toContain(
      "create or replace function public.lm_preserve_operational_inputter_snapshot",
    );
    expect(sql).toMatch(
      /before\s+update\s+of\s+inputter_name\s+on\s+public\.sales_transactions/,
    );
    expect(sql).toMatch(
      /before\s+update\s+of\s+inputter_name\s+on\s+public\.operational_expenses/,
    );
    expect(sql).toMatch(/new\.inputter_name\s*:=\s*old\.inputter_name/);
  });
});
