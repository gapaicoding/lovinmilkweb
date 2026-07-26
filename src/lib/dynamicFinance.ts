import { supabase } from "@/integrations/supabase/client";
import type {
  FinanceBreakdownFilter,
  FinancialStatement,
  PurchaseBreakdown,
} from "@/lib/juneFinance";
import { aggregatePurchaseBreakdown } from "@/lib/juneFinance";

interface RpcError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

interface RpcResult {
  data: Record<string, unknown>[] | null;
  error: RpcError | null;
}

interface DynamicFinanceClient {
  rpc(
    functionName: "get_financial_statement_range" | "get_purchase_breakdown_range",
    args: Record<string, unknown>,
  ): PromiseLike<RpcResult>;
}

const client = supabase as unknown as DynamicFinanceClient;

export interface DynamicFinancialStatement extends FinancialStatement {
  periodStart: string;
  periodEnd: string;
  sourceRecordCount: number;
  historicalBatchIds: string[];
}

export async function fetchDynamicFinancialStatement(
  startDate: string,
  endDate: string,
): Promise<DynamicFinancialStatement | null> {
  const { data, error } = await client.rpc("get_financial_statement_range", {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row || toNumber(row.source_record_count) === 0) return null;

  return {
    importBatchId: "",
    batchKey: "",
    batchStatus: "unknown",
    monthStart: toText(row.period_start),
    periodStart: toText(row.period_start),
    periodEnd: toText(row.period_end),
    revenue: toNumber(row.revenue),
    hpp: toNumber(row.hpp),
    grossProfit: toNumber(row.gross_profit),
    operatingExpense: toNumber(row.operating_expense),
    ebitda: toNumber(row.ebitda),
    depreciation: toNumber(row.depreciation),
    ebitOperatingProfit: toNumber(row.ebit_operating_profit),
    taxAmount: toNullableNumber(row.tax_amount),
    taxRecorded: row.tax_recorded === true,
    netIncomeProvisionalBeforeTax: toNumber(row.net_income_provisional_before_tax),
    netIncomeFinal: toNullableNumber(row.net_income_final),
    dividendAmount: toNullableNumber(row.dividend_amount),
    dividendRecorded: row.dividend_recorded === true,
    retainedEarningsFinal: toNullableNumber(row.retained_earnings_final),
    statementStatus: toText(row.statement_status),
    sourceRecordCount: toNumber(row.source_record_count),
    historicalBatchIds: Array.isArray(row.historical_batch_ids)
      ? row.historical_batch_ids.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export async function fetchDynamicPurchaseBreakdown({
  startDate,
  endDate,
  filter,
}: {
  startDate: string;
  endDate: string;
  filter: FinanceBreakdownFilter;
}): Promise<PurchaseBreakdown> {
  const classes = filter === "all" ? ["hpp", "operating_expense"] : [filter];
  const { data, error } = await client.rpc("get_purchase_breakdown_range", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_financial_classes: classes,
  });
  if (error) throw error;
  return aggregatePurchaseBreakdown(
    (data ?? []).map((row) => ({
      item_name_normalized: row.item_name,
      financial_class: row.financial_class,
      amount: row.amount,
      line_count: row.line_count,
    })),
  );
}

export function classifyFinanceError(error: unknown): string {
  const candidate = typeof error === "object" && error !== null ? (error as RpcError) : null;
  const message = candidate?.message?.trim();
  if (candidate?.code === "42501") return "Anda tidak memiliki izin untuk melihat data keuangan.";
  if (candidate?.code === "22023" || candidate?.code === "23514")
    return message || "Filter atau nilai yang diberikan tidak valid.";
  if (candidate?.code === "23505") return "Data dengan referensi yang sama sudah tersedia.";
  if (candidate?.code === "PGRST202")
    return "Sumber laporan dinamis belum tersedia. Pastikan migration database sudah diterapkan.";
  return message
    ? `Database menolak permintaan: ${message}`
    : "Rincian transaksi belum berhasil diambil. Ringkasan laporan tetap aman.";
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function toNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return toNumber(value);
}
