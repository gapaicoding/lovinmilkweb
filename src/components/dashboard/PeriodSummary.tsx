import {
  CalendarCheck2,
  CalendarDays,
  CircleDollarSign,
  Gauge,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  formatDate,
  formatNumber,
  formatPercentage,
  formatRupiah,
} from "@/lib/format";

import { Skeleton } from "@/components/ui/skeleton";

export interface PeriodSummaryData {
  profitMargin: number;
  averageDailySales: number;
  averageDailyExpenses: number;
  averageTransactionValue: number;
  activeDays: number;
  totalDays: number;

  highestSalesDay?: {
    date: string | Date;
    amount: number;
  } | null;
}

interface PeriodSummaryProps {
  data?: PeriodSummaryData;
  loading?: boolean;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

interface PeriodSummaryItem {
  id: string;
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone?: PeriodSummaryTone;
}

type PeriodSummaryTone =
  | "primary"
  | "positive"
  | "warning"
  | "negative"
  | "neutral";

export function PeriodSummary({
  data,
  loading = false,
  title = "Ringkasan Periode",
  description = "Indikator tambahan berdasarkan data pada periode terpilih.",
  emptyTitle = "Belum ada ringkasan",
  emptyDescription = "Ringkasan periode akan muncul setelah terdapat pencatatan penjualan atau pengeluaran.",
}: PeriodSummaryProps) {
  const summaryItems = data
    ? createSummaryItems(data)
    : [];

  const hasMeaningfulData =
    data !== undefined &&
    (data.activeDays > 0 ||
      data.averageDailySales > 0 ||
      data.averageDailyExpenses > 0 ||
      data.averageTransactionValue > 0 ||
      data.highestSalesDay !== null);

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gauge className="h-5 w-5" />
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
      </div>

      <div className="p-5">
        {loading ? (
          <PeriodSummarySkeleton />
        ) : !hasMeaningfulData ? (
          <PeriodSummaryEmptyState
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {summaryItems.map((item) => (
              <PeriodSummaryCard
                key={item.id}
                item={item}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface PeriodSummaryCardProps {
  item: PeriodSummaryItem;
}

function PeriodSummaryCard({
  item,
}: PeriodSummaryCardProps) {
  const toneStyle = getToneStyle(
    item.tone ?? "neutral",
  );

  const Icon = item.icon;

  return (
    <article className="rounded-xl border bg-muted/10 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {item.label}
          </p>

          <p className="mt-1 truncate text-lg font-semibold">
            {item.value}
          </p>

          {item.helper ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {item.helper}
            </p>
          ) : null}
        </div>

        <div
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            toneStyle.iconContainer,
          ].join(" ")}
        >
          <Icon
            className={[
              "h-4.5 w-4.5",
              toneStyle.icon,
            ].join(" ")}
          />
        </div>
      </div>
    </article>
  );
}

function createSummaryItems(
  data: PeriodSummaryData,
): PeriodSummaryItem[] {
  const activeDayPercentage =
    data.totalDays > 0
      ? (data.activeDays / data.totalDays) * 100
      : 0;

  return [
    {
      id: "profit-margin",
      label: "Margin Profit",
      value: formatPercentage(
        data.profitMargin,
      ),
      helper:
        data.profitMargin >= 0
          ? "Persentase profit terhadap total penjualan."
          : "Periode ini mengalami margin negatif.",
      icon: Gauge,
      tone:
        data.profitMargin < 0
          ? "negative"
          : data.profitMargin >= 30
            ? "positive"
            : data.profitMargin >= 10
              ? "primary"
              : "warning",
    },
    {
      id: "average-daily-sales",
      label: "Rata-rata Penjualan Harian",
      value: formatRupiah(
        data.averageDailySales,
      ),
      helper:
        data.activeDays > 0
          ? `Dihitung dari ${formatNumber(
              data.activeDays,
            )} hari aktif.`
          : "Belum ada hari aktif.",
      icon: CircleDollarSign,
      tone: "positive",
    },
    {
      id: "average-daily-expenses",
      label: "Rata-rata Pengeluaran Harian",
      value: formatRupiah(
        data.averageDailyExpenses,
      ),
      helper:
        data.activeDays > 0
          ? `Dihitung dari ${formatNumber(
              data.activeDays,
            )} hari aktif.`
          : "Belum ada hari aktif.",
      icon: ReceiptText,
      tone: "warning",
    },
    {
      id: "average-transaction",
      label: "Nilai Pencatatan Rata-rata",
      value: formatRupiah(
        data.averageTransactionValue,
      ),
      helper:
        "Rata-rata nominal dari seluruh penjualan dan pengeluaran.",
      icon: WalletCards,
      tone: "primary",
    },
    {
      id: "active-days",
      label: "Hari Aktif",
      value: `${formatNumber(
        data.activeDays,
      )} dari ${formatNumber(
        data.totalDays,
      )} hari`,
      helper: `${formatPercentage(
        activeDayPercentage,
      )} periode memiliki aktivitas pencatatan.`,
      icon: CalendarCheck2,
      tone:
        activeDayPercentage >= 70
          ? "positive"
          : activeDayPercentage >= 40
            ? "primary"
            : "neutral",
    },
    {
      id: "highest-sales-day",
      label: "Hari Penjualan Terbaik",
      value: data.highestSalesDay
        ? formatRupiah(
            data.highestSalesDay.amount,
          )
        : "-",
      helper: data.highestSalesDay
        ? formatDate(
            data.highestSalesDay.date,
            "EEEE, dd MMM yyyy",
          )
        : "Belum ada data penjualan.",
      icon: CalendarDays,
      tone: "positive",
    },
  ];
}

interface PeriodSummaryEmptyStateProps {
  title: string;
  description: string;
}

function PeriodSummaryEmptyState({
  title,
  description,
}: PeriodSummaryEmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Gauge className="h-6 w-6 text-muted-foreground" />
      </div>

      <h3 className="mt-4 text-sm font-semibold">
        {title}
      </h3>

      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function PeriodSummarySkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map(
        (_, index) => (
          <div
            key={index}
            className="rounded-xl border p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-3 w-full" />
              </div>

              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function getToneStyle(
  tone: PeriodSummaryTone,
) {
  switch (tone) {
    case "positive":
      return {
        iconContainer:
          "bg-emerald-500/10",
        icon:
          "text-emerald-600 dark:text-emerald-400",
      };

    case "warning":
      return {
        iconContainer:
          "bg-amber-500/10",
        icon:
          "text-amber-600 dark:text-amber-400",
      };

    case "negative":
      return {
        iconContainer:
          "bg-destructive/10",
        icon: "text-destructive",
      };

    case "primary":
      return {
        iconContainer:
          "bg-primary/10",
        icon: "text-primary",
      };

    case "neutral":
    default:
      return {
        iconContainer: "bg-muted",
        icon: "text-muted-foreground",
      };
  }
}