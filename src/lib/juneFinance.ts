import { supabase } from "@/integrations/supabase/client";

export const JUNE_FINANCE_BATCH_KEY = "LM-ACTUAL-JUNE-2026-FULL-ASSETS-V2";
export const JUNE_FINANCE_MONTH = "2026-06-01";

export type FinanceBreakdownFilter = "all" | "hpp" | "operating_expense";
export type ImportBatchStatus =
  | "prepared"
  | "staged"
  | "importing"
  | "imported"
  | "reconciled"
  | "failed"
  | "rolled_back"
  | "unknown";

export interface FinancialStatement {
  importBatchId: string;
  batchKey: string;
  batchStatus: ImportBatchStatus;
  monthStart: string;
  revenue: number;
  hpp: number;
  grossProfit: number;
  operatingExpense: number;
  ebitda: number;
  depreciation: number;
  ebitOperatingProfit: number;
  taxAmount: number | null;
  taxRecorded: boolean;
  netIncomeProvisionalBeforeTax: number;
  netIncomeFinal: number | null;
  dividendAmount: number | null;
  dividendRecorded: boolean;
  retainedEarningsFinal: number | null;
  statementStatus: string;
}

export interface PurchaseBreakdownItem {
  key: string;
  name: string;
  financialClass: Exclude<FinanceBreakdownFilter, "all">;
  amount: number;
  lineCount: number;
}

export interface PurchaseBreakdown {
  hpp: PurchaseBreakdownItem[];
  operatingExpense: PurchaseBreakdownItem[];
  hppTotal: number;
  operatingExpenseTotal: number;
}

interface FinanceQueryError {
  code?: string;
  message?: string;
}

interface FinanceQueryResult<T> {
  data: T | null;
  error: FinanceQueryError | null;
}

interface FinanceSelectQuery<T> extends PromiseLike<FinanceQueryResult<T[]>> {
  eq(column: string, value: unknown): FinanceSelectQuery<T>;
  gte(column: string, value: unknown): FinanceSelectQuery<T>;
  lt(column: string, value: unknown): FinanceSelectQuery<T>;
  is(column: string, value: null): FinanceSelectQuery<T>;
  in(column: string, values: readonly unknown[]): FinanceSelectQuery<T>;
  order(
    column: string,
    options?: {
      ascending?: boolean;
    },
  ): FinanceSelectQuery<T>;
  maybeSingle(): PromiseLike<FinanceQueryResult<T>>;
}

interface UntypedSupabaseClient {
  from(table: string): {
    select(columns: string): FinanceSelectQuery<Record<string, unknown>>;
  };
}

const financeClient = supabase as unknown as UntypedSupabaseClient;

export function parseMonthStart(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-01$/.test(value)) {
    return undefined;
  }

  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return undefined;
  }

  return value;
}

export function monthInputToStart(value: string): string | undefined {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return undefined;
  }

  return parseMonthStart(`${value}-01`);
}

export function nextMonthStart(monthStart: string): string {
  const [yearText, monthText] = monthStart.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

export function formatFinanceMonth(monthStart: string): string {
  const [yearText, monthText] = monthStart.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function isActualJuneStatement(statement: FinancialStatement | null): boolean {
  return Boolean(
    statement &&
    statement.batchKey === JUNE_FINANCE_BATCH_KEY &&
    statement.batchStatus === "reconciled" &&
    statement.monthStart === JUNE_FINANCE_MONTH,
  );
}

export async function fetchFinancialStatement(
  monthStart: string,
): Promise<FinancialStatement | null> {
  const { data, error } = await financeClient
    .from("v_financial_statement_monthly")
    .select(
      [
        "import_batch_id",
        "batch_key",
        "month_start",
        "revenue",
        "hpp",
        "gross_profit",
        "operating_expense",
        "ebitda",
        "depreciation",
        "ebit_operating_profit",
        "tax_amount",
        "tax_recorded",
        "net_income_provisional_before_tax",
        "net_income_final",
        "dividend_amount",
        "dividend_recorded",
        "retained_earnings_final",
        "statement_status",
      ].join(","),
    )
    .eq("month_start", monthStart)
    .eq("batch_key", JUNE_FINANCE_BATCH_KEY)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const { data: batch, error: batchError } = await financeClient
    .from("data_import_batches")
    .select("status")
    .eq("id", data.import_batch_id)
    .maybeSingle();

  if (batchError) {
    throw batchError;
  }

  if (!batch) {
    throw new Error("Status batch laporan aktual tidak ditemukan.");
  }

  return normalizeFinancialStatement({
    ...data,
    batch_status: batch.status,
  });
}

export async function fetchPurchaseBreakdown({
  importBatchId,
  monthStart,
  filter,
}: {
  importBatchId: string;
  monthStart: string;
  filter: FinanceBreakdownFilter;
}): Promise<PurchaseBreakdown> {
  const classes = filter === "all" ? ["hpp", "operating_expense"] : [filter];

  const { data, error } = await financeClient
    .from("purchase_items")
    .select(
      [
        "item_name_normalized",
        "financial_class",
        "amount",
        "purchase_invoice:purchase_invoices!purchase_items_invoice_batch_fkey!inner(",
        "purchase_date,status,deleted_at",
        ")",
      ].join(""),
    )
    .eq("import_batch_id", importBatchId)
    .is("deleted_at", null)
    .in("financial_class", classes)
    .eq("purchase_invoice.status", "recorded")
    .is("purchase_invoice.deleted_at", null)
    .gte("purchase_invoice.purchase_date", monthStart)
    .lt("purchase_invoice.purchase_date", nextMonthStart(monthStart))
    .order("amount", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  return aggregatePurchaseBreakdown(data ?? []);
}

export function normalizeFinancialStatement(row: Record<string, unknown>): FinancialStatement {
  return {
    importBatchId: toText(row.import_batch_id),
    batchKey: toText(row.batch_key),
    batchStatus: toImportBatchStatus(row.batch_status),
    monthStart: toText(row.month_start),
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
  };
}

export function aggregatePurchaseBreakdown(rows: Record<string, unknown>[]): PurchaseBreakdown {
  const grouped = new Map<string, PurchaseBreakdownItem>();

  for (const row of rows) {
    const financialClass = row.financial_class;

    if (financialClass !== "hpp" && financialClass !== "operating_expense") {
      continue;
    }

    const name = toText(row.item_name_normalized).trim() || "Item tanpa nama";
    const key = `${financialClass}:${name.toLocaleLowerCase("id-ID")}`;
    const current = grouped.get(key);

    if (current) {
      current.amount += toNumber(row.amount);
      current.lineCount += 1;
      continue;
    }

    grouped.set(key, {
      key,
      name,
      financialClass,
      amount: toNumber(row.amount),
      lineCount: 1,
    });
  }

  const sortByAmount = (left: PurchaseBreakdownItem, right: PurchaseBreakdownItem) =>
    right.amount - left.amount || left.name.localeCompare(right.name, "id-ID");

  const hpp = [...grouped.values()]
    .filter((item) => item.financialClass === "hpp")
    .sort(sortByAmount);
  const operatingExpense = [...grouped.values()]
    .filter((item) => item.financialClass === "operating_expense")
    .sort(sortByAmount);

  return {
    hpp,
    operatingExpense,
    hppTotal: sumBreakdown(hpp),
    operatingExpenseTotal: sumBreakdown(operatingExpense),
  };
}

export function parseBreakdownFilter(value: unknown): FinanceBreakdownFilter | undefined {
  if (value === "all" || value === "hpp" || value === "operating_expense") {
    return value;
  }

  return undefined;
}

export function getFinanceErrorMessage(error: unknown): string {
  const queryError =
    typeof error === "object" && error !== null ? (error as FinanceQueryError) : null;

  if (
    queryError?.code === "42501" ||
    queryError?.message?.toLocaleLowerCase("id-ID").includes("permission denied")
  ) {
    return "Data ini tidak tersedia untuk peran Anda sesuai kebijakan akses.";
  }

  return "Data keuangan belum dapat dimuat. Periksa koneksi lalu coba lagi.";
}

function sumBreakdown(items: PurchaseBreakdownItem[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function toImportBatchStatus(value: unknown): ImportBatchStatus {
  switch (value) {
    case "prepared":
    case "staged":
    case "importing":
    case "imported":
    case "reconciled":
    case "failed":
    case "rolled_back":
      return value;
    default:
      return "unknown";
  }
}
