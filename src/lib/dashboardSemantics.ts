export interface LovinSnapshot {
  revenue: number;
  purchase: number | null;
  revenueMinusPurchase: number | null;
}

export interface ArayyaSnapshot {
  revenue: number | null;
  hpp: number | null;
  grossProfit: number | null;
  margin: number | null;
}

export interface DashboardDailyPoint {
  date: string;
  outlet_revenue: number;
  lovin_revenue: number;
  arayya_revenue: number;
  bill_count: number | null;
  quantity: number;
  visitor_count: number | null;
  visitor_adult: number | null;
  visitor_child: number | null;
}

export function buildLovinSnapshot(
  revenue: number,
  purchase: number | null,
): LovinSnapshot {
  return {
    revenue,
    purchase,
    revenueMinusPurchase:
      purchase === null ? null : revenue - purchase,
  };
}

export function buildArayyaSnapshot(
  revenue: number | null,
  hpp: number | null,
): ArayyaSnapshot {
  const grossProfit =
    revenue === null || hpp === null
      ? null
      : revenue - hpp;

  return {
    revenue,
    hpp,
    grossProfit,
    margin:
      grossProfit === null ||
      revenue === null ||
      revenue === 0
        ? null
        : (grossProfit / revenue) * 100,
  };
}

export function sumDashboardDailySeries(
  rows: DashboardDailyPoint[],
) {
  return rows.reduce(
    (total, row) => ({
      revenue:
        total.revenue +
        finiteNumber(row.outlet_revenue),

      bills:
        row.bill_count === null
          ? total.bills
          : (total.bills ?? 0) +
            finiteNumber(row.bill_count),

      quantity:
        total.quantity +
        finiteNumber(row.quantity),

      visitors:
        row.visitor_count === null
          ? total.visitors
          : (total.visitors ?? 0) +
            finiteNumber(row.visitor_count),
    }),
    {
      revenue: 0,
      bills: null as number | null,
      quantity: 0,
      visitors: null as number | null,
    },
  );
}

function finiteNumber(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : 0;
}