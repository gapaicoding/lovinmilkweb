import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  BarChart3,
  TrendingUp,
} from "lucide-react";

import {
  formatCompactRupiah,
  formatDate,
  formatRupiah,
} from "@/lib/format";

import { Skeleton } from "@/components/ui/skeleton";

export interface TrendChartItem {
  key: string;
  label: string;
  sales: number;
  expenses: number;
  profit: number;
  date?: string | Date;
  transactionCount?: number;
}

interface TrendChartProps {
  title?: string;
  description?: string;
  data: TrendChartItem[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  height?: number;
  showSales?: boolean;
  showExpenses?: boolean;
  showProfit?: boolean;
  salesLabel?: string;
  expensesLabel?: string;
  profitLabel?: string;
}

interface CustomTooltipPayloadItem {
  dataKey?: string;
  name?: string;
  value?: number | string;
  payload?: TrendChartItem;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: readonly CustomTooltipPayloadItem[];
  label?: string | number;
}

interface TrendChartTooltipProps
  extends CustomTooltipProps {
  salesLabel: string;
  expensesLabel: string;
  profitLabel: string;
}

export function TrendChart({
  title = "Tren Keuangan",
  description = "Perbandingan penjualan, pengeluaran, dan profit pada periode terpilih.",
  data,
  loading = false,
  emptyTitle = "Belum ada data tren",
  emptyDescription = "Grafik akan muncul setelah terdapat pencatatan pada periode terpilih.",
  height = 360,
  showSales = true,
  showExpenses = true,
  showProfit = true,
  salesLabel = "Penjualan",
  expensesLabel = "Pengeluaran",
  profitLabel = "Profit",
}: TrendChartProps) {
  const normalizedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        sales: normalizeNumber(item.sales),
        expenses: normalizeNumber(
          item.expenses,
        ),
        profit: normalizeNumber(item.profit),
        transactionCount: normalizeNumber(
          item.transactionCount,
        ),
      })),
    [data],
  );

  const summary = useMemo(() => {
    return normalizedData.reduce(
      (result, item) => {
        result.sales += item.sales;
        result.expenses += item.expenses;
        result.profit += item.profit;

        if (
          !result.highestSalesItem ||
          item.sales >
            result.highestSalesItem.sales
        ) {
          result.highestSalesItem = item;
        }

        return result;
      },
      {
        sales: 0,
        expenses: 0,
        profit: 0,
        highestSalesItem:
          null as TrendChartItem | null,
      },
    );
  }, [normalizedData]);

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-semibold">
              {title}
            </h2>

            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {!loading &&
        normalizedData.length > 0 ? (
          <TrendLegend
            showSales={showSales}
            showExpenses={showExpenses}
            showProfit={showProfit}
            salesLabel={salesLabel}
            expensesLabel={expensesLabel}
            profitLabel={profitLabel}
          />
        ) : null}
      </div>

      <div className="p-5">
        {loading ? (
          <TrendChartSkeleton height={height} />
        ) : normalizedData.length === 0 ? (
          <TrendChartEmptyState
            title={emptyTitle}
            description={emptyDescription}
            height={height}
          />
        ) : (
          <div className="space-y-5">
            <TrendSummary
              totalSales={summary.sales}
              totalExpenses={summary.expenses}
              totalProfit={summary.profit}
              highestSalesItem={
                summary.highestSalesItem
              }
            />

            <div
              className="w-full"
              style={{ height }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <ComposedChart
                  data={normalizedData}
                  margin={{
                    top: 12,
                    right: 12,
                    bottom: 8,
                    left: 4,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="sales-area-gradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.22}
                      />

                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tick={{
                      fill:
                        "hsl(var(--muted-foreground))",
                      fontSize: 12,
                    }}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={74}
                    tickFormatter={(value) =>
                      formatCompactRupiah(
                        Number(value),
                      )
                    }
                    tick={{
                      fill:
                        "hsl(var(--muted-foreground))",
                      fontSize: 12,
                    }}
                  />

                  <Tooltip
                    cursor={{
                      stroke:
                        "hsl(var(--muted-foreground))",
                      strokeDasharray: "4 4",
                      strokeOpacity: 0.35,
                    }}
                    content={(props) => (
                      <TrendChartTooltip
                        active={props.active}
                        payload={
                          props.payload as readonly CustomTooltipPayloadItem[]
                        }
                        label={props.label}
                        salesLabel={salesLabel}
                        expensesLabel={
                          expensesLabel
                        }
                        profitLabel={profitLabel}
                      />
                    )}
                  />

                  {showSales ? (
                    <>
                      <Area
                        type="monotone"
                        dataKey="sales"
                        name={salesLabel}
                        fill="url(#sales-area-gradient)"
                        stroke="none"
                        connectNulls
                      />

                      <Line
                        type="monotone"
                        dataKey="sales"
                        name={salesLabel}
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{
                          r: 5,
                          strokeWidth: 2,
                          fill:
                            "hsl(var(--background))",
                        }}
                        connectNulls
                      />
                    </>
                  ) : null}

                  {showExpenses ? (
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      name={expensesLabel}
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2.25}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        fill:
                          "hsl(var(--background))",
                      }}
                      connectNulls
                    />
                  ) : null}

                  {showProfit ? (
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name={profitLabel}
                      stroke="hsl(var(--chart-2, 142 76% 36%))"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        fill:
                          "hsl(var(--background))",
                      }}
                      connectNulls
                    />
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface TrendSummaryProps {
  totalSales: number;
  totalExpenses: number;
  totalProfit: number;
  highestSalesItem: TrendChartItem | null;
}

function TrendSummary({
  totalSales,
  totalExpenses,
  totalProfit,
  highestSalesItem,
}: TrendSummaryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <TrendSummaryItem
        label="Total Penjualan"
        value={formatRupiah(totalSales)}
      />

      <TrendSummaryItem
        label="Total Pengeluaran"
        value={formatRupiah(totalExpenses)}
      />

      <TrendSummaryItem
        label="Total Profit"
        value={formatRupiah(totalProfit)}
        valueClassName={
          totalProfit < 0
            ? "text-destructive"
            : ""
        }
      />

      <TrendSummaryItem
        label="Penjualan Tertinggi"
        value={
          highestSalesItem
            ? formatRupiah(
                highestSalesItem.sales,
              )
            : "-"
        }
        helper={
          highestSalesItem
            ? getTrendItemDateLabel(
                highestSalesItem,
              )
            : undefined
        }
        icon
      />
    </div>
  );
}

interface TrendSummaryItemProps {
  label: string;
  value: string;
  helper?: string;
  valueClassName?: string;
  icon?: boolean;
}

function TrendSummaryItem({
  label,
  value,
  helper,
  valueClassName = "",
  icon = false,
}: TrendSummaryItemProps) {
  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          {label}
        </p>

        {icon ? (
          <ArrowUpRight className="h-4 w-4 text-primary" />
        ) : null}
      </div>

      <p
        className={[
          "mt-1 truncate text-sm font-semibold",
          valueClassName,
        ].join(" ")}
      >
        {value}
      </p>

      {helper ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

interface TrendLegendProps {
  showSales: boolean;
  showExpenses: boolean;
  showProfit: boolean;
  salesLabel: string;
  expensesLabel: string;
  profitLabel: string;
}

function TrendLegend({
  showSales,
  showExpenses,
  showProfit,
  salesLabel,
  expensesLabel,
  profitLabel,
}: TrendLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {showSales ? (
        <LegendItem
          label={salesLabel}
          indicatorClassName="bg-primary"
        />
      ) : null}

      {showExpenses ? (
        <LegendItem
          label={expensesLabel}
          indicatorClassName="bg-destructive"
        />
      ) : null}

      {showProfit ? (
        <LegendItem
          label={profitLabel}
          indicatorClassName="bg-emerald-600"
        />
      ) : null}
    </div>
  );
}

interface LegendItemProps {
  label: string;
  indicatorClassName: string;
}

function LegendItem({
  label,
  indicatorClassName,
}: LegendItemProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={[
          "h-2.5 w-2.5 rounded-full",
          indicatorClassName,
        ].join(" ")}
      />

      <span>{label}</span>
    </div>
  );
}

function TrendChartTooltip({
  active,
  payload,
  label,
  salesLabel,
  expensesLabel,
  profitLabel,
}: TrendChartTooltipProps) {
  if (
    !active ||
    !payload ||
    payload.length === 0
  ) {
    return null;
  }

  const item = payload[0]?.payload;

  if (!item) {
    return null;
  }

  const tooltipRows = [
    {
      key: "sales",
      label: salesLabel,
      value: item.sales,
      indicatorClassName: "bg-primary",
    },
    {
      key: "expenses",
      label: expensesLabel,
      value: item.expenses,
      indicatorClassName: "bg-destructive",
    },
    {
      key: "profit",
      label: profitLabel,
      value: item.profit,
      indicatorClassName: "bg-emerald-600",
    },
  ];

  return (
    <div className="min-w-56 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="border-b pb-2">
        <p className="text-sm font-semibold">
          {item.date
            ? formatDate(
                item.date,
                "EEEE, dd MMM yyyy",
              )
            : String(label ?? item.label)}
        </p>

        {item.transactionCount !==
        undefined ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.transactionCount} pencatatan
          </p>
        ) : null}
      </div>

      <div className="mt-2 space-y-2">
        {tooltipRows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-5"
          >
            <div className="flex items-center gap-2">
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full",
                  row.indicatorClassName,
                ].join(" ")}
              />

              <span className="text-xs text-muted-foreground">
                {row.label}
              </span>
            </div>

            <span
              className={[
                "text-xs font-semibold",
                row.key === "profit" &&
                row.value < 0
                  ? "text-destructive"
                  : "",
              ].join(" ")}
            >
              {formatRupiah(row.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TrendChartEmptyStateProps {
  title: string;
  description: string;
  height: number;
}

function TrendChartEmptyState({
  title,
  description,
  height,
}: TrendChartEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center"
      style={{
        minHeight: Math.max(height, 280),
      }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <BarChart3 className="h-6 w-6 text-muted-foreground" />
      </div>

      <h3 className="mt-4 text-sm font-semibold">
        {title}
      </h3>

      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

interface TrendChartSkeletonProps {
  height: number;
}

function TrendChartSkeleton({
  height,
}: TrendChartSkeletonProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map(
          (_, index) => (
            <div
              key={index}
              className="rounded-lg border px-4 py-3"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-5 w-32" />
            </div>
          ),
        )}
      </div>

      <div
        className="relative overflow-hidden rounded-lg border"
        style={{ height }}
      >
        <div className="absolute inset-x-4 bottom-8 top-5 flex items-end gap-4">
          {[
            36, 58, 42, 72, 55, 80, 65,
            88, 62, 76,
          ].map((itemHeight, index) => (
            <Skeleton
              key={index}
              className="flex-1 rounded-t-md"
              style={{
                height: `${itemHeight}%`,
              }}
            />
          ))}
        </div>

        <div className="absolute inset-x-4 bottom-3 flex justify-between">
          {Array.from({ length: 6 }).map(
            (_, index) => (
              <Skeleton
                key={index}
                className="h-3 w-9"
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function getTrendItemDateLabel(
  item: TrendChartItem,
): string {
  if (item.date) {
    return formatDate(
      item.date,
      "dd MMM yyyy",
    );
  }

  return item.label;
}

function normalizeNumber(
  value: number | null | undefined,
): number {
  const normalized = Number(value ?? 0);

  return Number.isFinite(normalized)
    ? normalized
    : 0;
}
