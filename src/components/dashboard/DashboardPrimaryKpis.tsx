import { Boxes, CircleDollarSign, ReceiptText, Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatRupiah } from "@/lib/format";
import type { OutletReport } from "@/lib/reporting";

export function DashboardPrimaryKpis({
  report,
  loading,
  historicalBillsPartial,
}: {
  report?: OutletReport;
  loading: boolean;
  historicalBillsPartial: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-36 rounded-2xl" />;
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      aria-label="Ringkasan utama Outlet"
    >
      <div className="grid lg:grid-cols-[1.35fr_1fr]">
        <div className="relative overflow-hidden px-5 py-5 sm:px-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-primary/8 blur-2xl"
          />

          <div className="relative">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CircleDollarSign className="h-4 w-4" />
              </span>
              Omzet Outlet
            </div>

            <p className="mt-4 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
              {formatRupiah(report?.revenue ?? 0)}
            </p>

            <p className="mt-1.5 text-xs text-muted-foreground">
              Total penjualan pada periode yang dipilih
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 border-t lg:border-l lg:border-t-0">
          <SmallKpi
            icon={ReceiptText}
            label={historicalBillsPartial ? "Struk Tercatat" : "Transaksi"}
            value={formatNumber(report?.bill_count ?? 0)}
            helper={historicalBillsPartial ? "Cakupan struk bisa parsial" : undefined}
          />

          <SmallKpi
            icon={Boxes}
            label="Qty Terjual"
            value={formatNumber(report?.quantity ?? 0)}
          />

          <SmallKpi
            icon={Users}
            label="Pengunjung Tercatat"
            value={formatNumber(report?.visitor_count ?? 0)}
            helper="Kunjungan yang tercatat"
          />
        </div>
      </div>
    </section>
  );
}

function SmallKpi({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center px-3 py-5 sm:px-4">
      <Icon className="h-4 w-4 text-primary" />

      <p className="mt-3 text-xl font-bold tabular-nums sm:text-2xl">
        {value}
      </p>

      <p className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground">
        {label}
      </p>

      {helper ? (
        <p className="mt-1 hidden text-[10px] leading-tight text-muted-foreground/80 sm:block">
          {helper}
        </p>
      ) : null}
    </div>
  );
}