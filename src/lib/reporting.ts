import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type SourceStatus =
  | "legacy"
  | "operational"
  | "mixed"
  | "empty"
  | "unavailable"
  | "partial_operational";

export interface OutletReport {
  requested_start_date: string;
  requested_end_date: string;
  operational_cutover_date: string;
  source_status: SourceStatus;
  legacy_coverage_start: string | null;
  legacy_coverage_end: string | null;
  operational_coverage_start: string | null;
  operational_coverage_end: string | null;
  revenue: number;
  hpp: number;
  gross_profit: number;
  operational_expense: number;
  depreciation: number;
  operating_profit: number;
  bill_count: number;
  quantity: number;
  visitor_count: number;
  has_provisional_hpp: boolean;
  provisional_hpp_item_count: number;
  provisional_hpp_revenue: number;
}

export interface ProductReportRow {
  product_id: string | null;
  product_name: string;
  category_name: string | null;
  subunit_id?: string;
  subunit_name?: string;
  quantity: number;
  revenue: number | null;
  hpp: number | null;
  gross_profit: number | null;
  margin_percent?: number | null;
  financial_available: boolean;
  source_status: "legacy" | "operational";
  has_provisional_hpp?: boolean;
  provisional_hpp_item_count?: number;
}

export interface ProductReport {
  requested_start_date: string;
  requested_end_date: string;
  operational_cutover_date: string;
  source_status: SourceStatus;
  historical_financial_metrics_available: false;
  legacy_rows: ProductReportRow[];
  operational_rows: ProductReportRow[];
}

export interface CurrentInventoryReport {
  position_status: "current";
  as_of: string;
  quantity: number;
  inventory_value: number;
  items_without_cost_basis: number;
  item_count: number;
}

export interface SubunitReport {
  requested_start_date: string;
  requested_end_date: string;
  operational_cutover_date: string;
  source_status: SourceStatus;
  financial_available: boolean;
  message?: string;
  revenue?: number;
  hpp?: number;
  gross_profit?: number;
  direct_operational_expense?: number;
  attributable_depreciation?: number;
  contribution_before_shared_outlet_cost?: number;
  quantity?: number;
  transaction_involvement_count?: number;
  transaction_count_additive?: false;
  has_provisional_hpp?: boolean;
}

export interface JulyActualDailyRow {
  date: string;
  total_sales: number;
  lovin_sales: number;
  lovin_sales_raw: number | null;
  arayya_sales: number | null;
  bill_count: number | null;
  adult_visitors: number | null;
  child_visitors: number | null;
  visitor_total: number | null;
  product_quantity: number;
  product_detail_available: boolean;
  source_notes: string | null;
}

export interface JulyActualReport {
  rows: JulyActualDailyRow[];
  known_bill_count: number;
  bill_coverage_complete: boolean;
  product_detail_coverage_complete: boolean;
  transaction_composition_available: false;
  product_financial_metrics_available: false;
  july_financial_costs_available: false;
  mapped_quantity: number;
  unmatched_quantity: number;
  free_quantity: number;
}

export type FinanceCoverage = "FULLY_UNAVAILABLE" | "PARTIAL" | "AVAILABLE";

export interface JulyActualSummary {
  revenue: number;
  lovinRevenue: number;
  arayyaRevenue: number;
  knownBills: number;
  quantity: number;
  adultVisitors: number;
  childVisitors: number;
  visitors: number;
  isFullJulyRange: boolean;
}

function fromJson<T>(value: Json): T {
  return value as T;
}

export async function fetchDefaultOutletId(): Promise<string> {
  const { data, error } = await supabase
    .from("outlets")
    .select("id")
    .eq("is_default", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id;
  const fallback = await supabase
    .from("outlets")
    .select("id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name")
    .limit(1)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  if (!fallback.data) throw new Error("Outlet aktif belum tersedia.");
  return fallback.data.id;
}

export async function fetchOutletReport(
  outletId: string,
  startDate: string,
  endDate: string,
): Promise<OutletReport> {
  const { data, error } = await supabase.rpc("get_stage7_outlet_report", {
    p_outlet_id: outletId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return fromJson<OutletReport>(data);
}

export async function fetchProductReport(
  outletId: string,
  startDate: string,
  endDate: string,
  subunitId?: string,
): Promise<ProductReport> {
  const { data, error } = await supabase.rpc("get_stage7_product_report", {
    p_outlet_id: outletId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_subunit_id: subunitId ?? undefined,
  });
  if (error) throw error;
  return fromJson<ProductReport>(data);
}

export async function fetchCurrentInventory(outletId: string): Promise<CurrentInventoryReport> {
  const { data, error } = await supabase.rpc("get_stage7_current_inventory_report", {
    p_outlet_id: outletId,
  });
  if (error) throw error;
  return fromJson<CurrentInventoryReport>(data);
}

export async function fetchSubunitReport(
  subunitId: string,
  startDate: string,
  endDate: string,
): Promise<SubunitReport> {
  const { data, error } = await supabase.rpc("get_stage7_subunit_report", {
    p_subunit_id: subunitId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return fromJson<SubunitReport>(data);
}

export async function fetchJulyActual(
  startDate: string,
  endDate: string,
): Promise<JulyActualReport> {
  const { data, error } = await supabase.rpc("get_july_actual_daily", {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return fromJson<JulyActualReport>(data);
}

export function sourceStatusLabel(status: SourceStatus): string {
  const labels: Record<SourceStatus, string> = {
    legacy: "Data Historis",
    operational: "Data Operasional",
    mixed: "Data Historis + Operasional",
    empty: "Belum ada data",
    unavailable: "Data belum tersedia",
    partial_operational: "Cakupan operasional parsial",
  };
  return labels[status];
}

export function calculateGrowth(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function calculateMargin(profit: number, revenue: number): number | null {
  return revenue === 0 ? null : (profit / revenue) * 100;
}

export function hasJulyOverlap(startDate: string, endDate: string): boolean {
  return startDate <= "2026-07-31" && endDate >= "2026-07-01";
}

export function isFullJulyRange(startDate: string, endDate: string): boolean {
  return startDate === "2026-07-01" && endDate === "2026-07-31";
}

export function getFinanceCoverage(
  startDate: string,
  endDate: string,
  hasJulyData: boolean,
): FinanceCoverage {
  if (!hasJulyData || !hasJulyOverlap(startDate, endDate)) return "AVAILABLE";
  if (startDate >= "2026-07-01" && endDate <= "2026-07-31") {
    return "FULLY_UNAVAILABLE";
  }
  return "PARTIAL";
}

export function summarizeJulyActual(
  report: JulyActualReport | undefined,
  startDate: string,
  endDate: string,
): JulyActualSummary | null {
  if (!report || report.rows.length === 0) return null;
  return {
    revenue: report.rows.reduce((total, row) => total + row.total_sales, 0),
    lovinRevenue: report.rows.reduce((total, row) => total + row.lovin_sales, 0),
    arayyaRevenue: report.rows.reduce((total, row) => total + (row.arayya_sales ?? 0), 0),
    knownBills: report.rows.reduce((total, row) => total + (row.bill_count ?? 0), 0),
    quantity: report.rows.reduce((total, row) => total + row.product_quantity, 0),
    adultVisitors: report.rows.reduce((total, row) => total + (row.adult_visitors ?? 0), 0),
    childVisitors: report.rows.reduce((total, row) => total + (row.child_visitors ?? 0), 0),
    visitors: report.rows.reduce((total, row) => total + (row.visitor_total ?? 0), 0),
    isFullJulyRange: isFullJulyRange(startDate, endDate),
  };
}

export function safePercentage(value: number, total: number): number | null {
  return total > 0 ? (value / total) * 100 : null;
}
