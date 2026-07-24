import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Lightbulb,
  Minus,
  PackageSearch,
  ReceiptText,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  formatDate,
  formatGrowth,
  formatPercentage,
  formatRupiah,
} from "@/lib/format";

import { Skeleton } from "@/components/ui/skeleton";

export type BusinessInsightTone =
  | "positive"
  | "negative"
  | "warning"
  | "neutral"
  | "info";

export interface BusinessInsightItem {
  id: string;
  title: string;
  description: string;
  tone?: BusinessInsightTone;
  icon?: LucideIcon;
}

export interface BusinessInsightsData {
  totalSales: number;
  previousSales: number;
  salesGrowth: number;

  totalExpenses: number;
  previousExpenses: number;
  expensesGrowth: number;

  totalProfit: number;
  previousProfit: number;
  profitGrowth: number;
  profitMargin: number;

  topSalesCategory?: {
    name: string;
    amount: number;
    percentage: number;
    transactionCount?: number;
  } | null;

  topExpenseCategory?: {
    name: string;
    amount: number;
    percentage: number;
    transactionCount?: number;
  } | null;

  highestSalesDay?: {
    date: string | Date;
    amount: number;
    transactionCount?: number;
  } | null;

  averageDailySales?: number;
  activeDays?: number;
}

interface BusinessInsightsProps {
  data?: BusinessInsightsData;
  insights?: BusinessInsightItem[];
  loading?: boolean;
  title?: string;
  description?: string;
  maxItems?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function BusinessInsights({
  data,
  insights,
  loading = false,
  title = "Insight Bisnis",
  description = "Ringkasan otomatis berdasarkan performa pada periode terpilih.",
  maxItems = 6,
  emptyTitle = "Belum ada insight",
  emptyDescription = "Insight akan muncul setelah terdapat data penjualan dan pengeluaran pada periode terpilih.",
}: BusinessInsightsProps) {
  const generatedInsights =
    insights ??
    (data
      ? generateBusinessInsights(data)
      : []);

  const visibleInsights =
    generatedInsights.slice(0, maxItems);

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Lightbulb className="h-5 w-5" />
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
        visibleInsights.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {visibleInsights.length} insight
          </div>
        ) : null}
      </div>

      <div className="p-5">
        {loading ? (
          <BusinessInsightsSkeleton />
        ) : visibleInsights.length === 0 ? (
          <BusinessInsightsEmptyState
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleInsights.map((insight) => (
              <BusinessInsightCard
                key={insight.id}
                insight={insight}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface BusinessInsightCardProps {
  insight: BusinessInsightItem;
}

function BusinessInsightCard({
  insight,
}: BusinessInsightCardProps) {
  const {
    icon: Icon = Lightbulb,
    tone = "neutral",
  } = insight;

  const toneStyle =
    getInsightToneStyle(tone);

  return (
    <article
      className={[
        "group flex items-start gap-3 rounded-xl border p-4 transition-colors",
        toneStyle.container,
      ].join(" ")}
    >
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

      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-5">
          {insight.title}
        </h3>

        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {insight.description}
        </p>
      </div>
    </article>
  );
}

interface BusinessInsightsEmptyStateProps {
  title: string;
  description: string;
}

function BusinessInsightsEmptyState({
  title,
  description,
}: BusinessInsightsEmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lightbulb className="h-6 w-6 text-muted-foreground" />
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

function BusinessInsightsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 6 }).map(
        (_, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-xl border p-4"
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />

            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

export function generateBusinessInsights(
  data: BusinessInsightsData,
): BusinessInsightItem[] {
  const insights: BusinessInsightItem[] = [];

  if (
    data.totalSales > 0 ||
    data.previousSales > 0
  ) {
    insights.push(
      createSalesGrowthInsight(data),
    );
  }

  if (
    data.totalProfit !== 0 ||
    data.previousProfit !== 0
  ) {
    insights.push(
      createProfitInsight(data),
    );
  }

  if (data.topSalesCategory) {
    insights.push({
      id: "top-sales-category",
      title: "Kategori penjualan terbesar",
      description: `${data.topSalesCategory.name} menyumbang ${formatRupiah(
        data.topSalesCategory.amount,
      )} atau ${formatPercentage(
        data.topSalesCategory.percentage,
      )} dari total penjualan${
        data.topSalesCategory
          .transactionCount !== undefined
          ? ` melalui ${data.topSalesCategory.transactionCount} pencatatan`
          : ""
      }.`,
      tone: "positive",
      icon: PackageSearch,
    });
  }

  if (data.topExpenseCategory) {
    insights.push({
      id: "top-expense-category",
      title: "Pengeluaran terbesar",
      description: `${data.topExpenseCategory.name} menjadi sumber pengeluaran terbesar sebesar ${formatRupiah(
        data.topExpenseCategory.amount,
      )} atau ${formatPercentage(
        data.topExpenseCategory.percentage,
      )} dari total pengeluaran${
        data.topExpenseCategory
          .transactionCount !== undefined
          ? ` melalui ${data.topExpenseCategory.transactionCount} pencatatan`
          : ""
      }.`,
      tone:
        data.topExpenseCategory.percentage >=
        50
          ? "warning"
          : "info",
      icon: ReceiptText,
    });
  }

  if (data.highestSalesDay) {
    insights.push({
      id: "highest-sales-day",
      title: "Hari penjualan terbaik",
      description: `${formatDate(
        data.highestSalesDay.date,
        "EEEE, dd MMM yyyy",
      )} mencatat penjualan tertinggi sebesar ${formatRupiah(
        data.highestSalesDay.amount,
      )}${
        data.highestSalesDay
          .transactionCount !== undefined
          ? ` dari ${data.highestSalesDay.transactionCount} pencatatan`
          : ""
      }.`,
      tone: "info",
      icon: CalendarDays,
    });
  }

  if (
    data.averageDailySales !== undefined &&
    data.activeDays !== undefined &&
    data.activeDays > 0
  ) {
    insights.push({
      id: "average-daily-sales",
      title: "Rata-rata penjualan harian",
      description: `Rata-rata penjualan mencapai ${formatRupiah(
        data.averageDailySales,
      )} per hari selama ${data.activeDays} hari aktif pada periode terpilih.`,
      tone: "neutral",
      icon: CircleDollarSign,
    });
  }

  if (
    data.totalExpenses > 0 ||
    data.previousExpenses > 0
  ) {
    insights.push(
      createExpenseGrowthInsight(data),
    );
  }

  return insights;
}

function createSalesGrowthInsight(
  data: BusinessInsightsData,
): BusinessInsightItem {
  if (data.salesGrowth > 0) {
    return {
      id: "sales-growth",
      title: "Penjualan meningkat",
      description: `Total penjualan naik ${formatGrowth(
        data.salesGrowth,
      )} dibanding periode sebelumnya, dari ${formatRupiah(
        data.previousSales,
      )} menjadi ${formatRupiah(
        data.totalSales,
      )}.`,
      tone: "positive",
      icon: TrendingUp,
    };
  }

  if (data.salesGrowth < 0) {
    return {
      id: "sales-growth",
      title: "Penjualan menurun",
      description: `Total penjualan turun ${formatPercentage(
        Math.abs(data.salesGrowth),
      )} dibanding periode sebelumnya, dari ${formatRupiah(
        data.previousSales,
      )} menjadi ${formatRupiah(
        data.totalSales,
      )}.`,
      tone: "negative",
      icon: TrendingDown,
    };
  }

  return {
    id: "sales-growth",
    title: "Penjualan stabil",
    description: `Total penjualan tidak berubah dibanding periode sebelumnya, yaitu ${formatRupiah(
      data.totalSales,
    )}.`,
    tone: "neutral",
    icon: Minus,
  };
}

function createExpenseGrowthInsight(
  data: BusinessInsightsData,
): BusinessInsightItem {
  if (data.expensesGrowth > 0) {
    return {
      id: "expense-growth",
      title: "Pengeluaran meningkat",
      description: `Pengeluaran naik ${formatGrowth(
        data.expensesGrowth,
      )} dibanding periode sebelumnya, dari ${formatRupiah(
        data.previousExpenses,
      )} menjadi ${formatRupiah(
        data.totalExpenses,
      )}.`,
      tone: "warning",
      icon: ArrowUpRight,
    };
  }

  if (data.expensesGrowth < 0) {
    return {
      id: "expense-growth",
      title: "Pengeluaran menurun",
      description: `Pengeluaran turun ${formatPercentage(
        Math.abs(data.expensesGrowth),
      )} dibanding periode sebelumnya, dari ${formatRupiah(
        data.previousExpenses,
      )} menjadi ${formatRupiah(
        data.totalExpenses,
      )}.`,
      tone: "positive",
      icon: ArrowDownRight,
    };
  }

  return {
    id: "expense-growth",
    title: "Pengeluaran stabil",
    description: `Total pengeluaran tidak berubah dibanding periode sebelumnya, yaitu ${formatRupiah(
      data.totalExpenses,
    )}.`,
    tone: "neutral",
    icon: Minus,
  };
}

function createProfitInsight(
  data: BusinessInsightsData,
): BusinessInsightItem {
  if (data.totalProfit < 0) {
    return {
      id: "profit-condition",
      title: "Periode mengalami kerugian",
      description: `Pengeluaran melampaui penjualan sehingga tercatat kerugian sebesar ${formatRupiah(
        Math.abs(data.totalProfit),
      )}. Periksa kategori pengeluaran terbesar untuk menemukan sumber biaya utama.`,
      tone: "negative",
      icon: TrendingDown,
    };
  }

  if (data.profitGrowth > 0) {
    return {
      id: "profit-condition",
      title: "Profit meningkat",
      description: `Profit naik ${formatGrowth(
        data.profitGrowth,
      )} menjadi ${formatRupiah(
        data.totalProfit,
      )}, dengan margin ${formatPercentage(
        data.profitMargin,
      )}.`,
      tone: "positive",
      icon: TrendingUp,
    };
  }

  if (data.profitGrowth < 0) {
    return {
      id: "profit-condition",
      title: "Profit menurun",
      description: `Profit turun ${formatPercentage(
        Math.abs(data.profitGrowth),
      )} menjadi ${formatRupiah(
        data.totalProfit,
      )}, dengan margin ${formatPercentage(
        data.profitMargin,
      )}.`,
      tone: "warning",
      icon: TrendingDown,
    };
  }

  return {
    id: "profit-condition",
    title: "Profit stabil",
    description: `Profit periode ini sebesar ${formatRupiah(
      data.totalProfit,
    )}, dengan margin ${formatPercentage(
      data.profitMargin,
    )}.`,
    tone: "neutral",
    icon: Minus,
  };
}

function getInsightToneStyle(
  tone: BusinessInsightTone,
) {
  switch (tone) {
    case "positive":
      return {
        container:
          "border-emerald-500/20 bg-emerald-500/[0.04]",
        iconContainer:
          "bg-emerald-500/10",
        icon:
          "text-emerald-600 dark:text-emerald-400",
      };

    case "negative":
      return {
        container:
          "border-destructive/20 bg-destructive/[0.04]",
        iconContainer:
          "bg-destructive/10",
        icon: "text-destructive",
      };

    case "warning":
      return {
        container:
          "border-amber-500/20 bg-amber-500/[0.04]",
        iconContainer:
          "bg-amber-500/10",
        icon:
          "text-amber-600 dark:text-amber-400",
      };

    case "info":
      return {
        container:
          "border-blue-500/20 bg-blue-500/[0.04]",
        iconContainer:
          "bg-blue-500/10",
        icon:
          "text-blue-600 dark:text-blue-400",
      };

    case "neutral":
    default:
      return {
        container:
          "border-border bg-muted/20",
        iconContainer: "bg-muted",
        icon: "text-muted-foreground",
      };
  }
}