import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  ReceiptText,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import type { ProductSalesTrendItem } from "@/lib/productAnalytics";
import {
  formatCompactRupiah,
  formatDate,
  formatNumber,
  formatRupiah,
} from "@/lib/format";

import { Skeleton } from "@/components/ui/skeleton";

interface ProductSalesTrendChartProps {
  data: ProductSalesTrendItem[];
  granularityLabel: string;
  periodLabel: string;
  loading?: boolean;
  height?: number;
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number | string;
  payload?: ProductSalesTrendItem;
}

interface ProductTrendTooltipProps {
  active?: boolean;
  payload?: readonly TooltipPayloadItem[];
}

export function ProductSalesTrendChart({
  data,
  granularityLabel,
  periodLabel,
  loading = false,
  height = 380,
}: ProductSalesTrendChartProps) {
  const normalizedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        quantity: normalizeNumber(
          item.quantity,
        ),
        revenue: normalizeNumber(
          item.revenue,
        ),
        transactionCount: normalizeNumber(
          item.transactionCount,
        ),
      })),
    [data],
  );

  const summary = useMemo(
    () =>
      normalizedData.reduce(
        (result, item) => ({
          quantity:
            result.quantity +
            normalizeNumber(item.quantity),
          revenue:
            result.revenue +
            normalizeNumber(item.revenue),
          transactionCount:
            result.transactionCount +
            normalizeNumber(
              item.transactionCount,
            ),
        }),
        {
          quantity: 0,
          revenue: 0,
          transactionCount: 0,
        },
      ),
    [normalizedData],
  );

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-semibold">
              Tren Quantity dan Omzet
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Penjualan produk {granularityLabel} pada periode{" "}
              {periodLabel}.
            </p>
          </div>
        </div>

        {!loading && normalizedData.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-blue-500/10 px-2.5 py-1 font-medium text-blue-700 dark:text-blue-400">
              Quantity
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              Omzet
            </span>
          </div>
        ) : null}
      </div>

      <div className="bg-white p-4 dark:bg-card sm:p-5">
        {loading ? (
          <ProductTrendSkeleton
            height={height}
          />
        ) : normalizedData.length === 0 ? (
          <ProductTrendEmptyState
            height={height}
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryItem
                icon={BarChart3}
                label="Total Quantity"
                value={formatNumber(
                  summary.quantity,
                  2,
                )}
              />
              <SummaryItem
                icon={ReceiptText}
                label="Total Omzet"
                value={formatRupiah(
                  summary.revenue,
                )}
              />
              <SummaryItem
                icon={TrendingUp}
                label="Transaksi"
                value={formatNumber(
                  summary.transactionCount,
                )}
              />
            </div>

            <div
              className="h-[280px] w-full sm:h-[320px] lg:h-[350px]"
              style={{
                height:
                  height === 380
                    ? undefined
                    : height,
              }}
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
                    left: 8,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="product-revenue-gradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.12}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 5"
                    vertical={false}
                    stroke="hsl(var(--border) / 0.7)"
                  />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={32}
                    tickMargin={10}
                    tick={{
                      fill:
                        "hsl(var(--muted-foreground))",
                      fontSize: 12,
                    }}
                  />

                  <YAxis
                    yAxisId="quantity"
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    allowDecimals={false}
                    tickMargin={8}
                    tickFormatter={(value) =>
                      formatNumber(
                        Number(value),
                      )
                    }
                    tick={{
                      fill:
                        "hsl(var(--muted-foreground))",
                      fontSize: 12,
                    }}
                  />

                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={84}
                    tickMargin={8}
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
                      fill:
                        "hsl(var(--muted) / 0.35)",
                    }}
                    content={(props) => (
                      <ProductTrendTooltip
                        active={props.active}
                        payload={
                          props.payload as readonly TooltipPayloadItem[]
                        }
                      />
                    )}
                  />

                  <Bar
                    yAxisId="quantity"
                    dataKey="quantity"
                    name="Quantity"
                    fill="#74cde8"
                    radius={[7, 7, 0, 0]}
                    maxBarSize={32}
                  />

                  <Area
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="revenue"
                    fill="url(#product-revenue-gradient)"
                    stroke="none"
                    connectNulls
                    legendType="none"
                    tooltipType="none"
                  />

                  <Line
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="revenue"
                    name="Omzet"
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
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ProductTrendTooltip({
  active,
  payload,
}: ProductTrendTooltipProps) {
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

  return (
    <div className="min-w-[200px] rounded-xl border border-border/80 bg-popover p-3 text-popover-foreground shadow-lg">
      <p className="text-sm font-semibold">
        {formatDate(item.date)}
      </p>

      <div className="mt-2 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-[#74cde8]" />
            Quantity
          </span>
          <span className="font-medium">
            {formatNumber(
              item.quantity,
              2,
            )}
          </span>
        </div>

        <div className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            Omzet
          </span>
          <span className="font-medium">
            {formatRupiah(item.revenue)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-5">
          <span className="text-muted-foreground">
            Transaksi
          </span>
          <span className="font-medium">
            {formatNumber(
              item.transactionCount,
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold">
          {value}
        </p>
      </div>
    </div>
  );
}

function ProductTrendSkeleton({
  height,
}: {
  height: number;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map(
          (_, index) => (
            <Skeleton
              key={index}
              className="h-16 rounded-lg"
            />
          ),
        )}
      </div>

      <Skeleton
        className="w-full rounded-lg"
        style={{ height }}
      />
    </div>
  );
}

function ProductTrendEmptyState({
  height,
}: {
  height: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed text-center"
      style={{ minHeight: height }}
    >
      <BarChart3 className="h-9 w-9 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">
        Belum ada tren penjualan produk
      </h3>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        Grafik quantity dan omzet akan muncul setelah terdapat
        transaksi penjualan pada periode terpilih.
      </p>
    </div>
  );
}

function normalizeNumber(
  value: number | undefined,
): number {
  return Number.isFinite(Number(value))
    ? Number(value)
    : 0;
}
