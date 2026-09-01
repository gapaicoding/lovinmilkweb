import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901120000_visitor_daily_recap_idempotency.sql"),
  "utf8",
).toLowerCase();

describe("visitor recap idempotency migration", () => {
  it("adds a request ledger instead of deduping by slot content", () => {
    expect(sql).toContain("create table public.visitor_daily_recap_submissions");
    expect(sql).toContain("request_id uuid primary key");
    expect(sql).toContain("operation = 'create_or_append_visitor_daily_recap_v3'");
    expect(sql).toContain("response jsonb");
    expect(sql).not.toContain("unique (outlet_id, business_date, arrival_time");
  });

  it("requires a request id and returns prior saved response on retry", () => {
    expect(sql).toContain("request idempotency key wajib diisi");
    expect(sql).toContain("return v_existing");
    expect(sql).toContain("permintaan simpan masih diproses");
  });

  it("keeps legitimate same-slot arrivals possible", () => {
    expect(sql).toContain("create or replace function public.create_or_append_visitor_daily_recap_v3");
    expect(sql).toContain("public.create_or_append_visitor_daily_recap(p_business_date");
    expect(sql).not.toContain("unique (outlet_id, business_date, arrival_time");
  });
});
