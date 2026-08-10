import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDate,
  formatNumber,
  formatRupiah,
} from "@/lib/format";
import type { DashboardDailyPoint } from "@/lib/dashboardSemantics";

type Metric =
  | "outlet_revenue"
  | "bill_count"
  | "quantity"
  | "visitor_count";

const METRICS: {
  value: Metric;
  label: string;
}[] = [
  {
    value: "outlet_revenue",
    label: "Omzet",
  },
  {
    value: "bill_count",
    label: "Transaksi",
  },
  {
    value: "quantity",
    label: "Qty",
  },
  {
    value: "visitor_count",
    label: "Pengunjung",
  },
];

export function DashboardBusinessTrend({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: DashboardDailyPoint[];
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
}) {
  const [metric, setMetric] =
    useState<Metric>("outlet_revenue");

  const safeRows = Array.isArray(rows)
    ? rows
    : [];

  const total = useMemo(
    () =>
      safeRows.reduce(
        (sum, row) =>
          sum +
          finiteNumber(
            row?.[metric],
          ),
        0,
      ),
    [metric, safeRows],
  );

  const activeMetric =
    METRICS.find(
      (item) =>
        item.value === metric,
    ) ?? METRICS[0];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </span>

            <CardTitle>
              Tren Bisnis
            </CardTitle>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            Pergerakan harian pada periode
            yang dipilih.
          </p>
        </div>

        <div
          className="inline-flex w-fit flex-wrap gap-1 rounded-xl border bg-muted/30 p-1"
          aria-label="Pilih metrik tren"
        >
          {METRICS.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={
                metric === item.value
                  ? "default"
                  : "ghost"
              }
              className="h-7 rounded-lg px-2.5 text-xs"
              onClick={() =>
                setMetric(item.value)
              }
            >
              {item.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
            <p className="text-sm font-medium">
              Tren harian belum dapat dimuat.
            </p>

            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Ringkasan utama tetap tersedia.
              Coba muat ulang tren tanpa
              memuat ulang seluruh halaman.
            </p>

            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={onRetry}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Muat ulang tren
              </Button>
            ) : null}
          </div>
        ) : safeRows.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed bg-muted/20 text-sm text-muted-foreground">
            Belum ada data tren pada periode
            ini.
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total {activeMetric.label}
                </p>

                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatMetric(
                    metric,
                    total,
                  )}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                {safeRows.length} hari data
              </p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={safeRows}
                  margin={{
                    top: 10,
                    right: 8,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="dashboardTrendFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.28}
                      />

                      <stop
                        offset="100%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.015}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDayTick}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={18}
                    tick={{
                      fill:
                        "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />

                  <YAxis
                    width={
                      metric ===
                      "outlet_revenue"
                        ? 54
                        : 38
                    }
                    tickFormatter={(
                      value: number,
                    ) =>
                      metric ===
                      "outlet_revenue"
                        ? formatCurrencyAxis(
                            value,
                          )
                        : formatNumber(value)
                    }
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill:
                        "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />

                  <Tooltip
                    cursor={{
                      stroke:
                        "hsl(var(--border))",
                    }}
                    content={({
                      active,
                      payload,
                    }) => {
                      const point =
                        payload?.[0]
                          ?.payload as
                          | DashboardDailyPoint
                          | undefined;

                      return active &&
                        point ? (
                        <TrendTooltip
                          point={point}
                        />
                      ) : null;
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke="hsl(var(--primary))"
                    fill="url(#dashboardTrendFill)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TrendTooltip({
  point,
}: {
  point: DashboardDailyPoint;
}) {
  const date =
    typeof point?.date === "string"
      ? point.date
      : null;

  return (
    <div className="min-w-52 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="font-semibold">
        {date
          ? formatDate(
              date,
              "dd MMMM yyyy",
            )
          : "Tanggal tidak tersedia"}
      </p>

      <div className="mt-2 space-y-1.5">
        <TooltipRow
          label="Omzet"
          value={formatRupiah(
            point?.outlet_revenue,
          )}
        />

        <TooltipRow
          label="Transaksi"
          value={formatNumber(
            point?.bill_count,
          )}
        />

        <TooltipRow
          label="Qty"
          value={formatNumber(
            point?.quantity,
          )}
        />

        <TooltipRow
          label="Pengunjung"
          value={formatNumber(
            point?.visitor_count,
          )}
        />
      </div>

      <div className="mt-2 border-t pt-2 text-muted-foreground">
        <TooltipRow
          label="Lovin Milk"
          value={formatRupiah(
            point?.lovin_revenue,
          )}
        />

        <TooltipRow
          label="Arayya"
          value={formatRupiah(
            point?.arayya_revenue,
          )}
        />
      </div>
    </div>
  );
}

function TooltipRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>

      <span className="font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function formatMetric(
  metric: Metric,
  value: number,
) {
  return metric === "outlet_revenue"
    ? formatRupiah(value)
    : formatNumber(value);
}

function formatCurrencyAxis(
  value: number,
) {
  const numeric =
    finiteNumber(value);

  const absolute =
    Math.abs(numeric);

  if (absolute >= 1_000_000) {
    return `${new Intl.NumberFormat(
      "id-ID",
      {
        maximumFractionDigits: 1,
      },
    ).format(
      numeric / 1_000_000,
    )} jt`;
  }

  if (absolute >= 1_000) {
    return `${new Intl.NumberFormat(
      "id-ID",
      {
        maximumFractionDigits: 0,
      },
    ).format(
      numeric / 1_000,
    )} rb`;
  }

  return formatNumber(numeric);
}

function formatDayTick(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !value
  ) {
    return "";
  }

  const match =
    /^\d{4}-\d{2}-(\d{2})$/.exec(
      value,
    );

  if (!match) {
    return value;
  }

  return String(Number(match[1]));
}

function finiteNumber(
  value: unknown,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : 0;
}