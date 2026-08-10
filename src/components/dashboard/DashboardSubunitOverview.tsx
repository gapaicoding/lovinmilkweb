import { Coffee, Info, Palette } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercentage, formatRupiah } from "@/lib/format";
import type { SubunitReport } from "@/lib/reporting";

export function DashboardSubunitOverview({
  lovinRevenue,
  arayyaRevenue,
  arayyaReport,
  loading,
  historical,
}: {
  lovinRevenue: number | null;
  arayyaRevenue: number | null;
  arayyaReport?: SubunitReport;
  loading: boolean;
  historical: boolean;
}) {
  const resolvedArayyaRevenue =
    typeof arayyaReport?.revenue === "number"
      ? arayyaReport.revenue
      : arayyaRevenue;

  const arayyaFinancialAvailable =
    !historical && Boolean(arayyaReport?.financial_available);

  const arayyaHpp =
    arayyaFinancialAvailable && typeof arayyaReport?.hpp === "number"
      ? arayyaReport.hpp
      : null;

  const arayyaGrossProfit =
    arayyaFinancialAvailable && typeof arayyaReport?.gross_profit === "number"
      ? arayyaReport.gross_profit
      : null;

  const arayyaMargin =
    resolvedArayyaRevenue !== null &&
    resolvedArayyaRevenue > 0 &&
    arayyaGrossProfit !== null
      ? (arayyaGrossProfit / resolvedArayyaRevenue) * 100
      : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div>
          <CardTitle>Performa Subunit</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Omzet dipisahkan berdasarkan item penjualan. Biaya operasional Outlet
            ditampilkan terpisah agar tidak dianggap sebagai biaya khusus Subunit.
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <SubunitPanel
              icon={Coffee}
              title="Lovin Milk"
              accentClassName="bg-primary/10 text-primary"
            >
              <RevenueBlock value={lovinRevenue} />

              <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
                Untuk saat ini Dashboard Lovin Milk berfokus pada omzet penjualan.
                Pengeluaran bersama Outlet ditampilkan pada Ringkasan Outlet di bawah.
              </p>
            </SubunitPanel>

            <SubunitPanel
              icon={Palette}
              title="Arayya"
              accentClassName="bg-violet-500/10 text-violet-600 dark:text-violet-300"
              badge={
                arayyaReport?.has_provisional_hpp ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-amber-700 dark:text-amber-300"
                  >
                    HPP provisional
                  </Badge>
                ) : null
              }
            >
              <RevenueBlock value={resolvedArayyaRevenue} />

              {arayyaFinancialAvailable ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MiniMetric label="HPP" value={money(arayyaHpp)} />
                  <MiniMetric
                    label="Laba Kotor"
                    value={money(arayyaGrossProfit)}
                    positive={Boolean(arayyaGrossProfit && arayyaGrossProfit > 0)}
                  />
                  <MiniMetric
                    label="Margin"
                    value={arayyaMargin === null ? "—" : formatPercentage(arayyaMargin)}
                  />
                </div>
              ) : (
                <div className="mt-4 flex gap-2 rounded-lg border border-dashed bg-background/60 px-3 py-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    HPP dan laba kotor Arayya belum tersedia untuk cakupan historis
                    pada periode ini. Omzet tetap ditampilkan bila sumber penjualan tersedia.
                  </p>
                </div>
              )}
            </SubunitPanel>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SubunitPanel({
  icon: Icon,
  title,
  accentClassName,
  badge,
  children,
}: {
  icon: typeof Coffee;
  title: string;
  accentClassName: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentClassName}`}
          >
            <Icon className="h-4 w-4" />
          </span>

          <p className="text-sm font-semibold">{title}</p>
        </div>

        {badge}
      </div>

      {children}
    </div>
  );
}

function RevenueBlock({ value }: { value: number | null }) {
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground">Omzet</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
        {value === null ? "Belum tersedia" : formatRupiah(value)}
      </p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-background/70 px-3 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-semibold tabular-nums ${
          positive ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function money(value: number | null) {
  return value === null ? "Belum tersedia" : formatRupiah(value);
}