import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRupiah } from "@/lib/format";
import type { CategoryQuantityItem, ProductRankingItem } from "@/lib/productAnalytics";
import type { CurrentInventoryReport, OutletReport } from "@/lib/reporting";

export function DashboardOutletCosts({
  report,
  unavailable,
}: {
  report?: OutletReport;
  unavailable: boolean;
}) {
  const revenue = report?.revenue ?? 0;
  const operationalExpense = report?.operational_expense ?? 0;
  const depreciation = report?.depreciation ?? 0;
  const revenueMinusExpense =
    unavailable || !report ? null : revenue - operationalExpense;

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-300">
            <WalletCards className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>Ringkasan Outlet</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Perbandingan omzet dan pengeluaran operasional pada periode terpilih.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {unavailable ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4">
            <p className="text-sm font-medium">
              Rincian pengeluaran belum tersedia.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Biaya historis yang tidak tersedia tidak dipaksakan menjadi nol.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-muted/15">
            <SummaryLine
              icon={CircleDollarSign}
              label="Omzet Outlet"
              value={formatRupiah(revenue)}
              strong
            />

            <SummaryLine
              icon={ReceiptText}
              label="Pengeluaran Operasional"
              value={formatRupiah(operationalExpense)}
            />

            <div className="border-y bg-primary/[0.045] px-3 py-3.5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Selisih Omzet - Pengeluaran
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    Indikator sederhana, bukan laba bersih atau laba operasional.
                  </p>
                </div>

                <p
                  className={`shrink-0 text-lg font-bold tabular-nums ${
                    revenueMinusExpense !== null && revenueMinusExpense >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }`}
                >
                  {revenueMinusExpense === null
                    ? "Belum tersedia"
                    : formatRupiah(revenueMinusExpense)}
                </p>
              </div>
            </div>

            <SummaryLine
              icon={Boxes}
              label="Depresiasi"
              value={formatRupiah(depreciation)}
              muted
            />
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Pengeluaran merupakan biaya bersama Outlet Kadirojo dan tidak dialokasikan
          otomatis ke Lovin Milk atau Arayya.
        </p>

        <DashboardLink to="/laporan-keuangan" label="Lihat Laporan Keuangan" />
      </CardContent>
    </Card>
  );
}

export function DashboardProductInsights({
  products,
  categories,
  loading,
  mixed,
  error,
}: {
  products: ProductRankingItem[];
  categories: CategoryQuantityItem[];
  loading: boolean;
  mixed: boolean;
  error: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Trophy className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>Insight Penjualan</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Preview singkat. Ranking lengkap tetap tersedia di Analitik Produk.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Insight produk belum dapat dimuat.
          </p>
        ) : mixed ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            Ranking lintas sumber tidak digabung karena identitas produk historis dan operasional
            berbeda.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <Ranking
              title="Produk Terlaris"
              rows={products.slice(0, 3).map((item) => ({
                id: item.productId,
                name: item.name,
                value: `${formatNumber(item.quantity)} qty`,
              }))}
            />

            <Ranking
              title="Kategori Terlaris"
              rows={categories.slice(0, 3).map((item) => ({
                id: item.id,
                name: item.name,
                value: `${formatNumber(item.quantity)} qty`,
              }))}
            />
          </div>
        )}

        <DashboardLink to="/analitik-produk" label="Lihat Analitik Produk" />
      </CardContent>
    </Card>
  );
}

export function DashboardOperationalStatus({
  inventory,
  loading,
  error,
  visitors,
  adult,
  child,
}: {
  inventory?: CurrentInventoryReport;
  loading: boolean;
  error: boolean;
  visitors: number;
  adult: number | null;
  child: number | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Operasional Saat Ini</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          <OperationalTile
            icon={PackageSearch}
            label="Nilai Inventory"
            value={
              loading
                ? null
                : error || !inventory
                  ? "Belum tersedia"
                  : formatRupiah(inventory.inventory_value)
            }
            helper="Posisi saat ini, terutama untuk Arayya"
            loading={loading}
          />

          <OperationalTile
            icon={Boxes}
            label="Quantity Inventory"
            value={
              loading
                ? null
                : error || !inventory
                  ? "Belum tersedia"
                  : formatNumber(inventory.quantity)
            }
            helper={
              inventory && !error
                ? `${formatNumber(inventory.items_without_cost_basis)} item tanpa basis biaya`
                : "Posisi inventory belum dapat dimuat"
            }
            loading={loading}
          />

          <OperationalTile
            icon={Users}
            label="Pengunjung Tercatat"
            value={formatNumber(visitors)}
            helper={
              adult !== null && child !== null
                ? `${formatNumber(adult)} dewasa · ${formatNumber(child)} anak`
                : "Berdasarkan kunjungan yang sudah dicatat"
            }
          />
        </div>

        <div className="mt-3 flex justify-end">
          <DashboardLink to="/inventory" label="Lihat Inventory" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardCoverage({ messages }: { messages: string[] }) {
  if (!messages.length) return null;

  return (
    <details className="group rounded-xl border border-amber-500/20 bg-amber-500/[0.035] px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
        Catatan kelengkapan data
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {messages.length} catatan
        </span>
      </summary>

      <ul className="mt-3 space-y-1.5 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
        {messages.map((message) => (
          <li key={message}>• {message}</li>
        ))}
      </ul>
    </details>
  );
}

function SummaryLine({
  icon: Icon,
  label,
  value,
  strong,
  muted,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-3 ${muted ? "opacity-80" : ""}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1 text-sm text-muted-foreground">
        {label}
      </span>

      <span
        className={`tabular-nums ${
          strong ? "text-base font-semibold text-foreground" : "text-sm font-semibold"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Ranking({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; value: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>

      {rows.length ? (
        <ol className="mt-3 space-y-2.5">
          {rows.map((row, index) => (
            <li key={row.id} className="flex min-w-0 items-center gap-2.5 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {index + 1}
              </span>

              <span className="min-w-0 flex-1 truncate font-medium">
                {row.name}
              </span>

              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {row.value}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Belum ada data.
        </p>
      )}
    </div>
  );
}

function OperationalTile({
  icon: Icon,
  label,
  value,
  helper,
  loading,
}: {
  icon: typeof Boxes;
  label: string;
  value: string | null;
  helper: string;
  loading?: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  return (
    <div className="rounded-xl border bg-muted/15 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>

      <p className="mt-3 text-xl font-semibold tabular-nums">
        {value ?? "—"}
      </p>

      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {helper}
      </p>
    </div>
  );
}

function DashboardLink({
  to,
  label,
}: {
  to: "/analitik-produk" | "/laporan-keuangan" | "/inventory";
  label: string;
}) {
  return (
    <Link
      to={to}
      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
    >
      {label}
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}