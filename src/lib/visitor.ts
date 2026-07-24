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

export interface VisitorVisitRow {
  id: string;
  visitor_id: string;
  visitor_code: string;
  full_name: string;
  phone: string | null;
  check_in_at: string;
  check_out_at: string | null;
  notes: string | null;
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

function asRecord(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toNumber(value: Json | undefined): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
