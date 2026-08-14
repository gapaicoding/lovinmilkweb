import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const DEPOSIT_METHODS = [
  "Tidak Disetor",
  "Setor Tunai ke bu Reni",
  "Setor ATM/Bank",
] as const;

export type DepositMethod = (typeof DEPOSIT_METHODS)[number];
export type SalesRecapStatus = "DRAFT" | "READY_TO_VALIDATE" | "NEEDS_REVIEW" | "VALIDATED";

export interface SalesDailyClosingDraft {
  membership_transaction_count: number | null;
  promo_transaction_count: number | null;
  cashier_name: string | null;
  adult_visitors: number | null;
  child_visitors: number | null;
  qris_dretail: number | null;
  qris_dynamic_bca: number | null;
  qris_static_bca: number | null;
  debit_edc_bca: number | null;
  qris_static_bri: number | null;
  cash_payment: number | null;
  dine_in_sales: number | null;
  takeaway_sales: number | null;
  reservation_sales: number | null;
  cash_opening: number | null;
  cash_deposited: number | null;
  deposit_method: DepositMethod | null;
  cash_closing_actual: number | null;
  notes: string | null;
}

export interface SalesRecapDailyRow extends SalesDailyClosingDraft {
  business_date: string;
  bill_count: number;
  system_total_sales: number;
  lovin_sales: number;
  arayya_sales: number;
  quantity: number;
  visitor_system_total: number | null;
  visitor_system_adult: number | null;
  visitor_system_child: number | null;
  closing_id: string | null;
  sales_validated_at: string | null;
  sales_validated_revision: number | null;
  cash_validated_at: string | null;
  cash_validated_revision: number | null;
  current_revision: number;
  payment_total: number;
  payment_variance: number;
  service_type_total: number;
  service_type_variance: number;
  expected_cash_closing: number;
  cash_variance: number | null;
  subunit_variance: number;
  sales_validation_is_current: boolean;
  cash_validation_is_current: boolean;
  sales_fields_complete: boolean;
  cash_fields_complete: boolean;
  overall_status: SalesRecapStatus;
  updated_at: string | null;
}

export interface SalesRecapReport {
  requested_start_date: string;
  requested_end_date: string;
  operational_cutover_date: string;
  source_status: "legacy" | "operational" | "mixed";
  rows: SalesRecapDailyRow[];
}

interface RpcError { message?: string; code?: string }
interface RecapRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: Json | null; error: RpcError | null }>;
}

const recapClient = supabase as unknown as RecapRpcClient;

export function createEmptyClosingDraft(): SalesDailyClosingDraft {
  return {
    membership_transaction_count: 0,
    promo_transaction_count: 0,
    cashier_name: null,
    adult_visitors: 0,
    child_visitors: 0,
    qris_dretail: 0,
    qris_dynamic_bca: 0,
    qris_static_bca: 0,
    debit_edc_bca: 0,
    qris_static_bri: 0,
    cash_payment: 0,
    dine_in_sales: 0,
    takeaway_sales: 0,
    reservation_sales: 0,
    cash_opening: 0,
    cash_deposited: 0,
    deposit_method: "Tidak Disetor",
    cash_closing_actual: 0,
    notes: null,
  };
}

export function closingDraftFromRow(row: SalesRecapDailyRow): SalesDailyClosingDraft {
  if (!row.closing_id) {
    const draft = createEmptyClosingDraft();
    draft.adult_visitors = row.visitor_system_adult ?? 0;
    draft.child_visitors = row.visitor_system_child ?? 0;
    return draft;
  }
  const keys = Object.keys(createEmptyClosingDraft()) as Array<keyof SalesDailyClosingDraft>;
  return Object.fromEntries(keys.map((key) => [key, row[key]])) as unknown as SalesDailyClosingDraft;
}

export function calculateClosingPreview(draft: SalesDailyClosingDraft, systemTotal: number) {
  const paymentTotal = sumNullable([
    draft.qris_dretail, draft.qris_dynamic_bca, draft.qris_static_bca,
    draft.debit_edc_bca, draft.qris_static_bri, draft.cash_payment,
  ]);
  const serviceTypeTotal = sumNullable([
    draft.dine_in_sales, draft.takeaway_sales, draft.reservation_sales,
  ]);
  const expectedCashClosing = (draft.cash_opening ?? 0) + (draft.cash_payment ?? 0)
    - (draft.cash_deposited ?? 0);
  return {
    paymentTotal,
    paymentVariance: paymentTotal - systemTotal,
    serviceTypeTotal,
    serviceTypeVariance: serviceTypeTotal - systemTotal,
    expectedCashClosing,
    cashVariance: draft.cash_closing_actual === null
      ? null
      : draft.cash_closing_actual - expectedCashClosing,
  };
}

export async function fetchSalesRecapDaily(
  outletId: string,
  startDate: string,
  endDate: string,
): Promise<SalesRecapReport> {
  const { data, error } = await recapClient.rpc("get_sales_recap_daily", {
    p_outlet_id: outletId, p_start_date: startDate, p_end_date: endDate,
  });
  if (error) throw rpcError(error, "Rekap Sales gagal dimuat.");
  return normalizeReport(data, startDate, endDate);
}

export async function saveSalesDailyClosing(
  outletId: string,
  businessDate: string,
  closing: SalesDailyClosingDraft,
): Promise<void> {
  const { error } = await recapClient.rpc("upsert_sales_daily_closing", {
    p_outlet_id: outletId, p_business_date: businessDate, p_closing: closing,
  });
  if (error) throw rpcError(error, "Draft closing gagal disimpan.");
}

export async function validateSalesDailyClosing(
  outletId: string, businessDate: string, expectedRevision: number,
): Promise<void> {
  const { error } = await recapClient.rpc("validate_sales_daily_closing", {
    p_outlet_id: outletId, p_business_date: businessDate, p_expected_revision: expectedRevision,
  });
  if (error) throw rpcError(error, "Validasi Sales gagal.");
}

export async function validateCashDailyClosing(
  outletId: string, businessDate: string, expectedRevision: number,
): Promise<void> {
  const { error } = await recapClient.rpc("validate_cash_daily_closing", {
    p_outlet_id: outletId, p_business_date: businessDate, p_expected_revision: expectedRevision,
  });
  if (error) throw rpcError(error, "Validasi Cash gagal.");
}

export function indonesianDayName(businessDate: string): string {
  const [year, month, day] = businessDate.split("-").map(Number);
  const dayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dayIndex];
}

function normalizeReport(data: Json | null, startDate: string, endDate: string): SalesRecapReport {
  const root = record(data);
  const rows = Array.isArray(root.rows) ? root.rows.map(normalizeRow) : [];
  return {
    requested_start_date: textValue(root.requested_start_date) ?? startDate,
    requested_end_date: textValue(root.requested_end_date) ?? endDate,
    operational_cutover_date: textValue(root.operational_cutover_date) ?? "2026-08-01",
    source_status: root.source_status === "legacy" || root.source_status === "mixed" ? root.source_status : "operational",
    rows,
  };
}

function normalizeRow(value: unknown): SalesRecapDailyRow {
  const row = record(value);
  const nullableNumber = (key: string) => row[key] === null || row[key] === undefined ? null : numberValue(row[key]);
  const nullableText = (key: string) => textValue(row[key]);
  const status = row.overall_status;
  return {
    business_date: nullableText("business_date") ?? "",
    bill_count: numberValue(row.bill_count), system_total_sales: numberValue(row.system_total_sales),
    lovin_sales: numberValue(row.lovin_sales), arayya_sales: numberValue(row.arayya_sales),
    quantity: numberValue(row.quantity), visitor_system_total: nullableNumber("visitor_system_total"),
    visitor_system_adult: nullableNumber("visitor_system_adult"), visitor_system_child: nullableNumber("visitor_system_child"),
    closing_id: nullableText("closing_id"), membership_transaction_count: nullableNumber("membership_transaction_count"),
    promo_transaction_count: nullableNumber("promo_transaction_count"), cashier_name: nullableText("cashier_name"),
    adult_visitors: nullableNumber("adult_visitors"), child_visitors: nullableNumber("child_visitors"),
    qris_dretail: nullableNumber("qris_dretail"), qris_dynamic_bca: nullableNumber("qris_dynamic_bca"),
    qris_static_bca: nullableNumber("qris_static_bca"), debit_edc_bca: nullableNumber("debit_edc_bca"),
    qris_static_bri: nullableNumber("qris_static_bri"), cash_payment: nullableNumber("cash_payment"),
    dine_in_sales: nullableNumber("dine_in_sales"), takeaway_sales: nullableNumber("takeaway_sales"),
    reservation_sales: nullableNumber("reservation_sales"), cash_opening: nullableNumber("cash_opening"),
    cash_deposited: nullableNumber("cash_deposited"), deposit_method: DEPOSIT_METHODS.includes(row.deposit_method as DepositMethod) ? row.deposit_method as DepositMethod : null,
    cash_closing_actual: nullableNumber("cash_closing_actual"), notes: nullableText("notes"),
    sales_validated_at: nullableText("sales_validated_at"), sales_validated_revision: nullableNumber("sales_validated_revision"),
    cash_validated_at: nullableText("cash_validated_at"), cash_validated_revision: nullableNumber("cash_validated_revision"),
    current_revision: numberValue(row.current_revision), payment_total: numberValue(row.payment_total),
    payment_variance: numberValue(row.payment_variance), service_type_total: numberValue(row.service_type_total),
    service_type_variance: numberValue(row.service_type_variance), expected_cash_closing: numberValue(row.expected_cash_closing),
    cash_variance: nullableNumber("cash_variance"), subunit_variance: numberValue(row.subunit_variance),
    sales_validation_is_current: row.sales_validation_is_current === true,
    cash_validation_is_current: row.cash_validation_is_current === true,
    sales_fields_complete: row.sales_fields_complete === true, cash_fields_complete: row.cash_fields_complete === true,
    overall_status: status === "VALIDATED" || status === "READY_TO_VALIDATE" || status === "NEEDS_REVIEW" ? status : "DRAFT",
    updated_at: nullableText("updated_at"),
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function sumNullable(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}
function rpcError(error: RpcError, fallback: string): Error {
  const result = new Error(error.message?.trim() || fallback);
  result.name = error.code || "SalesRecapError";
  return result;
}
