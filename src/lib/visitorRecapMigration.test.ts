import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260828120000_visitor_daily_recap_bulk_entry.sql"),
  "utf8",
).toLowerCase();

describe("visitor daily recap migration contract", () => {
  it("uses one active header per outlet and date", () => {
    expect(sql).toContain("uq_visitor_daily_recaps_active_day");
    expect(sql).toContain("on public.visitor_daily_recaps(outlet_id,business_date)");
  });
  it("creates an atomic append RPC with recorder conflict protection", () => {
    expect(sql).toContain("create_or_append_visitor_daily_recap");
    expect(sql).toContain("sudah memiliki perekap");
    expect(sql).toContain("jsonb_array_length(p_entries)");
  });
  it("keeps bulk rows out of checkout and the live active index", () => {
    expect(sql).toContain("capture_mode='live_session' and check_out_at is null");
    expect(sql).toContain("entry rekap tidak memerlukan checkout");
    expect(sql).toContain("capture_mode='bulk_recap'");
  });
  it("stores selected Jakarta slot and protects export range", () => {
    expect(sql).toContain("asia/jakarta");
    expect(sql).toContain("rentang laporan maksimal 366 hari");
  });
});
