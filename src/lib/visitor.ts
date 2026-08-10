import { differenceInMinutes, formatDistanceStrict } from "date-fns";
import { id } from "date-fns/locale";
import type { Json } from "@/integrations/supabase/types";

export interface VisitorSearchResult {
  id: string;
  visitor_code: string;
  full_name: string;
  phone: string | null;
  has_active_visit: boolean;
  active_visit_id: string | null;
}

export interface VisitProductSummary {
  product_id: string;
  name: string;
  quantity: number;
  amount: number;
}

export interface LinkedVisitorSalesTransaction {
  transaction_id: string;
  transaction_number: string;
  transaction_date: string;
  total_amount: number;
  deleted_at: string | null;
}

export interface VisitorVisitRow {
  id: string;
  visitor_id: string;
  visitor_code: string;
  full_name: string;
  phone: string | null;
  check_in_at: string;
  check_out_at: string | null;
  notes: string | null;
  outlet_id: string | null;
  visit_date: string;
  adult_count: number | null;
  child_count: number | null;
  total_visitors: number | null;
  record_source: "legacy_manual" | "operational";
  active_transaction_count: number;
  active_purchase_total: number;
  archived_transaction_count: number;
  linked_transactions: LinkedVisitorSalesTransaction[];
  legacy_manual_purchase_amount: number | null;
  legacy_manual_quantity: number | null;
  total_quantity: number;
  total_amount: number;
  products: VisitProductSummary[];
}

export interface VisitorVisitPage {
  rows: VisitorVisitRow[];
  total: number;
  page: number;
  page_size: number;
}

export function parseVisitPage(value: Json): VisitorVisitPage {
  const record = asRecord(value);
  const rows = Array.isArray(record.rows)
    ? record.rows.map(parseVisitRow).filter((row): row is VisitorVisitRow => row !== null)
    : [];
  return {
    rows,
    total: toNumber(record.total),
    page: toNumber(record.page) || 1,
    page_size: toNumber(record.page_size) || 20,
  };
}

export function formatJakartaDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatJakartaTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatVisitDuration(start: string, end?: string | null): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  if (differenceInMinutes(endDate, startDate) < 1) return "< 1 menit";
  return formatDistanceStrict(startDate, endDate, { locale: id });
}

export function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseVisitRow(value: Json): VisitorVisitRow | null {
  const row = asRecord(value);
  if (typeof row.id !== "string" || typeof row.visitor_code !== "string") return null;
  return {
    id: row.id,
    visitor_id: String(row.visitor_id ?? ""),
    visitor_code: row.visitor_code,
    full_name: String(row.full_name ?? ""),
    phone: typeof row.phone === "string" ? row.phone : null,
    check_in_at: String(row.check_in_at ?? ""),
    check_out_at: typeof row.check_out_at === "string" ? row.check_out_at : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    outlet_id: typeof row.outlet_id === "string" ? row.outlet_id : null,
    visit_date: String(row.visit_date ?? ""),
    adult_count: toNullableNumber(row.adult_count),
    child_count: toNullableNumber(row.child_count),
    total_visitors: toNullableNumber(row.total_visitors),
    record_source: row.record_source === "operational" ? "operational" : "legacy_manual",
    active_transaction_count: toNumber(row.active_transaction_count),
    active_purchase_total: toNumber(row.active_purchase_total),
    archived_transaction_count: toNumber(row.archived_transaction_count),
    linked_transactions: Array.isArray(row.linked_transactions)
      ? row.linked_transactions.map((transaction) => {
          const item = asRecord(transaction);
          return {
            transaction_id: String(item.transaction_id ?? ""),
            transaction_number: String(item.transaction_number ?? ""),
            transaction_date: String(item.transaction_date ?? ""),
            total_amount: toNumber(item.total_amount),
            deleted_at: typeof item.deleted_at === "string" ? item.deleted_at : null,
          };
        })
      : [],
    legacy_manual_purchase_amount: toNullableNumber(row.legacy_manual_purchase_amount),
    legacy_manual_quantity: toNullableNumber(row.legacy_manual_quantity),
    total_quantity: toNumber(row.total_quantity),
    total_amount: toNumber(row.total_amount),
    products: Array.isArray(row.products)
      ? row.products.map((product) => {
          const item = asRecord(product);
          return {
            product_id: String(item.product_id ?? ""),
            name: String(item.name ?? ""),
            quantity: toNumber(item.quantity),
            amount: toNumber(item.amount),
          };
        })
      : [],
  };
}

function toNullableNumber(value: Json | undefined): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asRecord(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toNumber(value: Json | undefined): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
