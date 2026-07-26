import { actualClient, toFiniteNumber } from "@/lib/actualData";

export interface DashboardActualSummary {
  revenue: number;
  billCount: number;
  visitors: number;
  productQuantity: number;
  historicalDays: string[];
  liveDays: string[];
  hasData: boolean;
}

interface HistoricalSalesRow {
  sale_date: string;
  total_sales: number | string;
  bill_count: number | string;
}
interface HistoricalTrafficRow {
  traffic_date: string;
  total_visitors: number | string;
}
interface HistoricalQuantityRow {
  sale_date: string;
  quantity: number | string;
}
interface LiveSaleRow {
  transaction_date: string;
  amount: number | string;
  quantity: number | string | null;
}
interface LiveVisitRow {
  visit_date: string;
}
interface LiveVisitDatabaseRow {
  check_in_at: string;
}

export interface MergeDashboardActualInput {
  historicalSales: HistoricalSalesRow[];
  historicalTraffic: HistoricalTrafficRow[];
  historicalQuantities: HistoricalQuantityRow[];
  liveSales: LiveSaleRow[];
  liveVisits: LiveVisitRow[];
}

/** Historical aggregate dates are authoritative, so overlapping live rows are excluded. */
export function mergeDashboardActual(input: MergeDashboardActualInput): DashboardActualSummary {
  const historicalDays = new Set(input.historicalSales.map((row) => row.sale_date));
  input.historicalTraffic.forEach((row) => historicalDays.add(row.traffic_date));
  input.historicalQuantities.forEach((row) => historicalDays.add(row.sale_date));

  const liveSales = input.liveSales.filter((row) => !historicalDays.has(row.transaction_date));
  const liveVisits = input.liveVisits.filter((row) => !historicalDays.has(row.visit_date));
  const liveDays = new Set([
    ...liveSales.map((row) => row.transaction_date),
    ...liveVisits.map((row) => row.visit_date),
  ]);

  return {
    revenue:
      input.historicalSales.reduce((sum, row) => sum + toFiniteNumber(row.total_sales), 0) +
      liveSales.reduce((sum, row) => sum + toFiniteNumber(row.amount), 0),
    billCount:
      input.historicalSales.reduce((sum, row) => sum + toFiniteNumber(row.bill_count), 0) +
      liveSales.length,
    visitors:
      input.historicalTraffic.reduce((sum, row) => sum + toFiniteNumber(row.total_visitors), 0) +
      liveVisits.length,
    productQuantity:
      input.historicalQuantities.reduce((sum, row) => sum + toFiniteNumber(row.quantity), 0) +
      liveSales.reduce((sum, row) => sum + toFiniteNumber(row.quantity), 0),
    historicalDays: [...historicalDays].sort(),
    liveDays: [...liveDays].sort(),
    hasData: historicalDays.size > 0 || liveDays.size > 0,
  };
}

export async function getDashboardActualSummary(startDate: string, endDate: string) {
  const [historicalSales, historicalTraffic, historicalQuantities, liveSales, liveVisits] =
    await Promise.all([
      actualClient
        .from<HistoricalSalesRow>("daily_sales_summaries")
        .select("sale_date,total_sales,bill_count")
        .gte("sale_date", startDate)
        .lte("sale_date", endDate),
      actualClient
        .from<HistoricalTrafficRow>("customer_traffic_daily")
        .select("traffic_date,total_visitors")
        .gte("traffic_date", startDate)
        .lte("traffic_date", endDate),
      actualClient
        .from<HistoricalQuantityRow>("historical_product_daily_quantities")
        .select("sale_date,quantity")
        .gte("sale_date", startDate)
        .lte("sale_date", endDate),
      actualClient
        .from<LiveSaleRow>("sales")
        .select("transaction_date,amount,quantity")
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .is("deleted_at", null),
      actualClient
        .from<LiveVisitDatabaseRow>("visitor_visits")
        .select("check_in_at")
        .gte("check_in_at", `${startDate}T00:00:00+07:00`)
        .lte("check_in_at", `${endDate}T23:59:59.999+07:00`)
        .is("deleted_at", null),
    ]);

  const error =
    historicalSales.error ??
    historicalTraffic.error ??
    historicalQuantities.error ??
    liveSales.error ??
    liveVisits.error;
  if (error) throw error;

  return mergeDashboardActual({
    historicalSales: historicalSales.data ?? [],
    historicalTraffic: historicalTraffic.data ?? [],
    historicalQuantities: historicalQuantities.data ?? [],
    liveSales: liveSales.data ?? [],
    liveVisits: (liveVisits.data ?? []).map((row) => ({
      visit_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(row.check_in_at)),
    })),
  });
}
