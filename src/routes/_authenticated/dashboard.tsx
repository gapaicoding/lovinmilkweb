import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
  parseISO,
  subDays,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ListChecks,
  PiggyBank,
  ReceiptText,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import { PageHeader } from "@/components/PageHeader";
import {
  DateRangeFilter,
  computeRange,
  type DateRange,
} from "@/components/DateRangeFilter";

import { DashboardKpiCard } from "@/components/dashboard/DashboardKpiCard";
import {
  CategoryRanking,
  type CategoryRankingItem,
} from "@/components/dashboard/CategoryRanking";
import {
  TrendChart,
  type TrendChartItem,
} from "@/components/dashboard/TrendChart";
import {
  BusinessInsights,
  type BusinessInsightsData,
} from "@/components/dashboard/BusinessInsights";
import {
  PeriodSummary,
  type PeriodSummaryData,
} from "@/components/dashboard/PeriodSummary";

import {
  formatDate,
  formatRupiah,
  toDateInput,
} from "@/lib/format";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/dashboard",
)({
  component: DashboardPage,
});

const DAILY_RANGE_LIMIT = 62;
const RECENT_TRANSACTION_LIMIT = 5;

type SaleRow = Pick<
  Tables<"sales">,
  | "id"
  | "transaction_date"
  | "amount"
  | "notes"
  | "created_at"
  | "sales_category_id"
>;

type ExpenseRow = Pick<
  Tables<"expenses">,
  | "id"
  | "transaction_date"
  | "amount"
  | "notes"
  | "created_at"
  | "expense_category_id"
>;

type SalesCategoryRow = Pick<
  Tables<"sales_categories">,
  "id" | "name"
>;

type ExpenseCategoryRow = Pick<
  Tables<"expense_categories">,
  "id" | "name"
>;

interface PeriodRange {
  from: string;
  to: string;
}

interface FinancialSummary {
  sales: number;
  expenses: number;
  profit: number;
  salesCount: number;
  expenseCount: number;
  transactionCount: number;
}

interface HighestSalesDay {
  date: string;
  amount: number;
  transactionCount: number;
}

interface RecentTransactionItem {
  id: string;
  type: "sales" | "expenses";
  date: string;
  createdAt: string;
  categoryName: string;
  amount: number;
  notes: string | null;
}

interface QueryError {
  message?: string;
  details?: string;
  hint?: string;
}

function DashboardPage() {
  const [range, setRange] = useState<DateRange>(() =>
    computeRange("this_month"),
  );

  const selectedRange = useMemo<PeriodRange>(
    () => ({
      from: toDateInput(range.from),
      to: toDateInput(range.to),
    }),
    [range.from, range.to],
  );

  const isRangeValid =
    selectedRange.from <= selectedRange.to;

  const previousRange = useMemo(
    () => calculatePreviousRange(selectedRange),
    [selectedRange],
  );

  const combinedRange = useMemo<PeriodRange>(
    () => ({
      from: previousRange.from,
      to: selectedRange.to,
    }),
    [previousRange.from, selectedRange.to],
  );

  const selectedRangeLabel = useMemo(
    () =>
      `${formatDate(
        selectedRange.from,
      )} – ${formatDate(selectedRange.to)}`,
    [selectedRange],
  );

  const previousRangeLabel = useMemo(
    () =>
      `${formatDate(
        previousRange.from,
      )} – ${formatDate(previousRange.to)}`,
    [previousRange],
  );

  const salesQuery = useQuery({
    queryKey: [
      "dashboard-sales",
      combinedRange.from,
      combinedRange.to,
    ],
    enabled: isRangeValid,
    staleTime: 30_000,
    queryFn: () => fetchSales(combinedRange),
  });

  const expensesQuery = useQuery({
    queryKey: [
      "dashboard-expenses",
      combinedRange.from,
      combinedRange.to,
    ],
    enabled: isRangeValid,
    staleTime: 30_000,
    queryFn: () => fetchExpenses(combinedRange),
  });

  const salesCategoriesQuery = useQuery({
    queryKey: ["all-sales-categories"],
    staleTime: 5 * 60_000,
    queryFn: fetchSalesCategories,
  });

  const expenseCategoriesQuery = useQuery({
    queryKey: ["all-expense-categories"],
    staleTime: 5 * 60_000,
    queryFn: fetchExpenseCategories,
  });

  const selectedSales = useMemo(
    () =>
      filterRowsByRange(
        salesQuery.data ?? [],
        selectedRange,
      ),
    [salesQuery.data, selectedRange],
  );

  const previousSales = useMemo(
    () =>
      filterRowsByRange(
        salesQuery.data ?? [],
        previousRange,
      ),
    [salesQuery.data, previousRange],
  );

  const selectedExpenses = useMemo(
    () =>
      filterRowsByRange(
        expensesQuery.data ?? [],
        selectedRange,
      ),
    [expensesQuery.data, selectedRange],
  );

  const previousExpenses = useMemo(
    () =>
      filterRowsByRange(
        expensesQuery.data ?? [],
        previousRange,
      ),
    [expensesQuery.data, previousRange],
  );

  const salesCategoryMap = useMemo(
    () =>
      new Map(
        (salesCategoriesQuery.data ?? []).map(
          (category) => [
            category.id,
            category.name,
          ],
        ),
      ),
    [salesCategoriesQuery.data],
  );

  const expenseCategoryMap = useMemo(
    () =>
      new Map(
        (
          expenseCategoriesQuery.data ?? []
        ).map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [expenseCategoriesQuery.data],
  );

  const selectedSummary = useMemo(
    () =>
      summarizePeriod(
        selectedSales,
        selectedExpenses,
      ),
    [selectedSales, selectedExpenses],
  );

  const previousSummary = useMemo(
    () =>
      summarizePeriod(
        previousSales,
        previousExpenses,
      ),
    [previousSales, previousExpenses],
  );

  const salesGrowth = useMemo(
    () =>
      calculateGrowth(
        selectedSummary.sales,
        previousSummary.sales,
      ),
    [
      selectedSummary.sales,
      previousSummary.sales,
    ],
  );

  const expensesGrowth = useMemo(
    () =>
      calculateGrowth(
        selectedSummary.expenses,
        previousSummary.expenses,
      ),
    [
      selectedSummary.expenses,
      previousSummary.expenses,
    ],
  );

  const profitGrowth = useMemo(
    () =>
      calculateGrowth(
        selectedSummary.profit,
        previousSummary.profit,
      ),
    [
      selectedSummary.profit,
      previousSummary.profit,
    ],
  );

  const transactionGrowth = useMemo(
    () =>
      calculateGrowth(
        selectedSummary.transactionCount,
        previousSummary.transactionCount,
      ),
    [
      selectedSummary.transactionCount,
      previousSummary.transactionCount,
    ],
  );

  const profitMargin = useMemo(
    () =>
      selectedSummary.sales > 0
        ? (selectedSummary.profit /
            selectedSummary.sales) *
          100
        : 0,
    [
      selectedSummary.sales,
      selectedSummary.profit,
    ],
  );

  const trendData = useMemo(
    () =>
      buildTrendData({
        range,
        sales: selectedSales,
        expenses: selectedExpenses,
      }),
    [range, selectedSales, selectedExpenses],
  );

  const salesRanking = useMemo(
    () =>
      buildCategoryRanking({
        rows: selectedSales,
        categoryMap: salesCategoryMap,
        getCategoryId: (row) =>
          row.sales_category_id,
      }),
    [selectedSales, salesCategoryMap],
  );

  const expensesRanking = useMemo(
    () =>
      buildCategoryRanking({
        rows: selectedExpenses,
        categoryMap: expenseCategoryMap,
        getCategoryId: (row) =>
          row.expense_category_id,
      }),
    [selectedExpenses, expenseCategoryMap],
  );

  const highestSalesDay = useMemo(
    () => findHighestSalesDay(selectedSales),
    [selectedSales],
  );

  const totalDays = useMemo(
    () =>
      Math.max(
        differenceInCalendarDays(
          range.to,
          range.from,
        ) + 1,
        1,
      ),
    [range.from, range.to],
  );

  const activeDays = useMemo(
    () =>
      countActiveDays(
        selectedSales,
        selectedExpenses,
      ),
    [selectedSales, selectedExpenses],
  );

  const averageDailySales =
    activeDays > 0
      ? selectedSummary.sales / activeDays
      : 0;

  const averageDailyExpenses =
    activeDays > 0
      ? selectedSummary.expenses / activeDays
      : 0;

  const averageTransactionValue =
    selectedSummary.transactionCount > 0
      ? (selectedSummary.sales +
          selectedSummary.expenses) /
        selectedSummary.transactionCount
      : 0;

  const businessInsightsData =
    useMemo<BusinessInsightsData>(
      () => ({
        totalSales: selectedSummary.sales,
        previousSales:
          previousSummary.sales,
        salesGrowth,

        totalExpenses:
          selectedSummary.expenses,
        previousExpenses:
          previousSummary.expenses,
        expensesGrowth,

        totalProfit: selectedSummary.profit,
        previousProfit:
          previousSummary.profit,
        profitGrowth,
        profitMargin,

        topSalesCategory:
          salesRanking[0]
            ? {
                name: salesRanking[0].name,
                amount:
                  salesRanking[0].amount,
                percentage:
                  salesRanking[0]
                    .percentage,
                transactionCount:
                  salesRanking[0]
                    .transactionCount,
              }
            : null,

        topExpenseCategory:
          expensesRanking[0]
            ? {
                name:
                  expensesRanking[0].name,
                amount:
                  expensesRanking[0].amount,
                percentage:
                  expensesRanking[0]
                    .percentage,
                transactionCount:
                  expensesRanking[0]
                    .transactionCount,
              }
            : null,

        highestSalesDay:
          highestSalesDay
            ? {
                date:
                  highestSalesDay.date,
                amount:
                  highestSalesDay.amount,
                transactionCount:
                  highestSalesDay
                    .transactionCount,
              }
            : null,

        averageDailySales,
        activeDays,
      }),
      [
        selectedSummary,
        previousSummary,
        salesGrowth,
        expensesGrowth,
        profitGrowth,
        profitMargin,
        salesRanking,
        expensesRanking,
        highestSalesDay,
        averageDailySales,
        activeDays,
      ],
    );

  const periodSummaryData =
    useMemo<PeriodSummaryData>(
      () => ({
        profitMargin,
        averageDailySales,
        averageDailyExpenses,
        averageTransactionValue,
        activeDays,
        totalDays,
        highestSalesDay:
          highestSalesDay
            ? {
                date:
                  highestSalesDay.date,
                amount:
                  highestSalesDay.amount,
              }
            : null,
      }),
      [
        profitMargin,
        averageDailySales,
        averageDailyExpenses,
        averageTransactionValue,
        activeDays,
        totalDays,
        highestSalesDay,
      ],
    );

  const recentSales = useMemo(
    () =>
      buildRecentSales(
        selectedSales,
        salesCategoryMap,
      ),
    [selectedSales, salesCategoryMap],
  );

  const recentExpenses = useMemo(
    () =>
      buildRecentExpenses(
        selectedExpenses,
        expenseCategoryMap,
      ),
    [selectedExpenses, expenseCategoryMap],
  );

  const mainLoading =
    salesQuery.isLoading ||
    expensesQuery.isLoading;

  const categoryLoading =
    mainLoading ||
    salesCategoriesQuery.isLoading ||
    expenseCategoriesQuery.isLoading;

  const recentLoading = categoryLoading;

  const queryError =
    salesQuery.error ??
    expensesQuery.error ??
    salesCategoriesQuery.error ??
    expenseCategoriesQuery.error;

  const usesMonthlyTrend =
    totalDays > DAILY_RANGE_LIMIT;

  const retryDashboard = () => {
    void Promise.all([
      salesQuery.refetch(),
      expensesQuery.refetch(),
      salesCategoriesQuery.refetch(),
      expenseCategoriesQuery.refetch(),
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Analisis penjualan, pengeluaran, profit, dan performa operasional Lovin Milk."
      />

      <Card className="rounded-xl">
        <CardContent className="space-y-3 p-4">
          <DateRangeFilter
            value={range}
            onChange={setRange}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">
              Periode analisis
            </Badge>

            <span>{selectedRangeLabel}</span>

            <span aria-hidden="true">•</span>

            <span>
              Dibandingkan dengan{" "}
              {previousRangeLabel}
            </span>

            <span aria-hidden="true">•</span>

            <span>
              Grafik dikelompokkan{" "}
              {usesMonthlyTrend
                ? "per bulan"
                : "per hari"}
            </span>
          </div>
        </CardContent>
      </Card>

      {!isRangeValid ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />

          <AlertTitle>
            Rentang tanggal tidak valid
          </AlertTitle>

          <AlertDescription>
            Tanggal mulai tidak boleh melewati
            tanggal akhir.
          </AlertDescription>
        </Alert>
      ) : null}

      {queryError ? (
        <DashboardError
          error={queryError}
          onRetry={retryDashboard}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpiCard
          title="Total Penjualan"
          value={formatRupiah(
            selectedSummary.sales,
          )}
          helper={`${selectedSummary.salesCount} pencatatan penjualan`}
          icon={TrendingUp}
          loading={mainLoading}
          growth={salesGrowth}
          iconBackground="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />

        <DashboardKpiCard
          title="Total Pengeluaran"
          value={formatRupiah(
            selectedSummary.expenses,
          )}
          helper={`${selectedSummary.expenseCount} pencatatan pengeluaran`}
          icon={Wallet}
          loading={mainLoading}
          growth={expensesGrowth}
          iconBackground="bg-destructive/10 text-destructive"
        />

        <DashboardKpiCard
          title="Estimasi Profit"
          value={formatRupiah(
            selectedSummary.profit,
          )}
          helper={
            selectedSummary.profit >= 0
              ? `Margin profit ${profitMargin.toLocaleString(
                  "id-ID",
                  {
                    maximumFractionDigits: 1,
                  },
                )}%`
              : "Pengeluaran melebihi penjualan"
          }
          icon={
            selectedSummary.profit >= 0
              ? PiggyBank
              : TrendingDown
          }
          loading={mainLoading}
          growth={profitGrowth}
          iconBackground={
            selectedSummary.profit >= 0
              ? "bg-primary/10 text-primary"
              : "bg-destructive/10 text-destructive"
          }
          valueClassName={
            selectedSummary.profit < 0
              ? "text-destructive"
              : ""
          }
        />

        <DashboardKpiCard
          title="Jumlah Pencatatan"
          value={selectedSummary.transactionCount.toLocaleString(
            "id-ID",
          )}
          helper={`${selectedSummary.salesCount} penjualan · ${selectedSummary.expenseCount} pengeluaran`}
          icon={ListChecks}
          loading={mainLoading}
          growth={transactionGrowth}
          iconBackground="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
      </section>

      <TrendChart
        title="Tren Penjualan, Pengeluaran, dan Profit"
        description={`Pergerakan nilai keuangan pada periode ${selectedRangeLabel}.`}
        data={trendData}
        loading={mainLoading}
        height={380}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <CategoryRanking
          title="Ranking Kategori Penjualan"
          description="Kategori dengan kontribusi omzet terbesar pada periode terpilih."
          items={salesRanking}
          totalAmount={selectedSummary.sales}
          loading={categoryLoading}
          emptyTitle="Belum ada kategori penjualan"
          emptyDescription="Ranking akan muncul setelah terdapat pencatatan penjualan pada periode ini."
          valueLabel="penjualan"
          maxItems={6}
        />

        <CategoryRanking
          title="Ranking Kategori Pengeluaran"
          description="Kategori dengan kontribusi biaya terbesar pada periode terpilih."
          items={expensesRanking}
          totalAmount={
            selectedSummary.expenses
          }
          loading={categoryLoading}
          emptyTitle="Belum ada kategori pengeluaran"
          emptyDescription="Ranking akan muncul setelah terdapat pencatatan pengeluaran pada periode ini."
          valueLabel="pengeluaran"
          maxItems={6}
        />
      </section>

      <BusinessInsights
        data={businessInsightsData}
        loading={categoryLoading}
        maxItems={6}
      />

      <PeriodSummary
        data={periodSummaryData}
        loading={mainLoading}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <RecentTransactionCard
          title="Penjualan Terbaru"
          description="Lima pencatatan penjualan terbaru dalam periode terpilih."
          type="sales"
          data={recentSales}
          loading={recentLoading}
        />

        <RecentTransactionCard
          title="Pengeluaran Terbaru"
          description="Lima pencatatan pengeluaran terbaru dalam periode terpilih."
          type="expenses"
          data={recentExpenses}
          loading={recentLoading}
        />
      </section>
    </div>
  );
}

async function fetchSales(
  range: PeriodRange,
): Promise<SaleRow[]> {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, transaction_date, amount, notes, created_at, sales_category_id",
    )
    .is("deleted_at", null)
    .gte("transaction_date", range.from)
    .lte("transaction_date", range.to)
    .order("transaction_date", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

async function fetchExpenses(
  range: PeriodRange,
): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, transaction_date, amount, notes, created_at, expense_category_id",
    )
    .is("deleted_at", null)
    .gte("transaction_date", range.from)
    .lte("transaction_date", range.to)
    .order("transaction_date", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

async function fetchSalesCategories(): Promise<
  SalesCategoryRow[]
> {
  const { data, error } = await supabase
    .from("sales_categories")
    .select("id, name")
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchExpenseCategories(): Promise<
  ExpenseCategoryRow[]
> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name")
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data ?? [];
}

function calculatePreviousRange(
  range: PeriodRange,
): PeriodRange {
  const currentFrom = parseISO(range.from);
  const currentTo = parseISO(range.to);

  const duration =
    differenceInCalendarDays(
      currentTo,
      currentFrom,
    ) + 1;

  const previousTo = subDays(currentFrom, 1);
  const previousFrom = subDays(
    previousTo,
    duration - 1,
  );

  return {
    from: toDateInput(previousFrom),
    to: toDateInput(previousTo),
  };
}

function filterRowsByRange<
  T extends {
    transaction_date: string;
  },
>(
  rows: T[],
  range: PeriodRange,
): T[] {
  return rows.filter(
    (row) =>
      row.transaction_date >= range.from &&
      row.transaction_date <= range.to,
  );
}

function summarizePeriod(
  sales: SaleRow[],
  expenses: ExpenseRow[],
): FinancialSummary {
  const totalSales = sales.reduce(
    (total, row) => total + row.amount,
    0,
  );

  const totalExpenses = expenses.reduce(
    (total, row) => total + row.amount,
    0,
  );

  return {
    sales: totalSales,
    expenses: totalExpenses,
    profit: totalSales - totalExpenses,
    salesCount: sales.length,
    expenseCount: expenses.length,
    transactionCount:
      sales.length + expenses.length,
  };
}

function calculateGrowth(
  currentValue: number,
  previousValue: number,
): number {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0;
  }

  return (
    ((currentValue - previousValue) /
      Math.abs(previousValue)) *
    100
  );
}

function buildTrendData({
  range,
  sales,
  expenses,
}: {
  range: DateRange;
  sales: SaleRow[];
  expenses: ExpenseRow[];
}): TrendChartItem[] {
  const days = eachDayOfInterval({
    start: range.from,
    end: range.to,
  });

  if (days.length > DAILY_RANGE_LIMIT) {
    return buildMonthlyTrendData({
      range,
      sales,
      expenses,
    });
  }

  return buildDailyTrendData({
    range,
    sales,
    expenses,
  });
}

function buildDailyTrendData({
  range,
  sales,
  expenses,
}: {
  range: DateRange;
  sales: SaleRow[];
  expenses: ExpenseRow[];
}): TrendChartItem[] {
  const salesTotals = new Map<
    string,
    {
      amount: number;
      count: number;
    }
  >();

  const expenseTotals = new Map<
    string,
    {
      amount: number;
      count: number;
    }
  >();

  for (const row of sales) {
    const current = salesTotals.get(
      row.transaction_date,
    ) ?? {
      amount: 0,
      count: 0,
    };

    salesTotals.set(row.transaction_date, {
      amount: current.amount + row.amount,
      count: current.count + 1,
    });
  }

  for (const row of expenses) {
    const current = expenseTotals.get(
      row.transaction_date,
    ) ?? {
      amount: 0,
      count: 0,
    };

    expenseTotals.set(row.transaction_date, {
      amount: current.amount + row.amount,
      count: current.count + 1,
    });
  }

  const days = eachDayOfInterval({
    start: range.from,
    end: range.to,
  });

  return days.map((day) => {
    const key = toDateInput(day);

    const salesValue = salesTotals.get(
      key,
    ) ?? {
      amount: 0,
      count: 0,
    };

    const expenseValue =
      expenseTotals.get(key) ?? {
        amount: 0,
        count: 0,
      };

    return {
      key,
      label: format(
        day,
        days.length > 14
          ? "dd/MM"
          : "dd MMM",
        {
          locale: idLocale,
        },
      ),
      date: key,
      sales: salesValue.amount,
      expenses: expenseValue.amount,
      profit:
        salesValue.amount -
        expenseValue.amount,
      transactionCount:
        salesValue.count +
        expenseValue.count,
    };
  });
}

function buildMonthlyTrendData({
  range,
  sales,
  expenses,
}: {
  range: DateRange;
  sales: SaleRow[];
  expenses: ExpenseRow[];
}): TrendChartItem[] {
  const salesTotals = new Map<
    string,
    {
      amount: number;
      count: number;
    }
  >();

  const expenseTotals = new Map<
    string,
    {
      amount: number;
      count: number;
    }
  >();

  for (const row of sales) {
    const key = row.transaction_date.slice(
      0,
      7,
    );

    const current = salesTotals.get(key) ?? {
      amount: 0,
      count: 0,
    };

    salesTotals.set(key, {
      amount: current.amount + row.amount,
      count: current.count + 1,
    });
  }

  for (const row of expenses) {
    const key = row.transaction_date.slice(
      0,
      7,
    );

    const current =
      expenseTotals.get(key) ?? {
        amount: 0,
        count: 0,
      };

    expenseTotals.set(key, {
      amount: current.amount + row.amount,
      count: current.count + 1,
    });
  }

  return eachMonthOfInterval({
    start: range.from,
    end: range.to,
  }).map((month) => {
    const key = format(month, "yyyy-MM");

    const salesValue = salesTotals.get(
      key,
    ) ?? {
      amount: 0,
      count: 0,
    };

    const expenseValue =
      expenseTotals.get(key) ?? {
        amount: 0,
        count: 0,
      };

    return {
      key,
      label: format(month, "MMM yy", {
        locale: idLocale,
      }),
      date: `${key}-01`,
      sales: salesValue.amount,
      expenses: expenseValue.amount,
      profit:
        salesValue.amount -
        expenseValue.amount,
      transactionCount:
        salesValue.count +
        expenseValue.count,
    };
  });
}

function buildCategoryRanking<
  T extends {
    amount: number;
  },
>({
  rows,
  categoryMap,
  getCategoryId,
}: {
  rows: T[];
  categoryMap: Map<string, string>;
  getCategoryId: (
    row: T,
  ) => string | null;
}): (CategoryRankingItem & {
  percentage: number;
})[] {
  const totals = new Map<
    string,
    {
      amount: number;
      transactionCount: number;
    }
  >();

  for (const row of rows) {
    const categoryId =
      getCategoryId(row) ??
      "__uncategorized__";

    const current = totals.get(categoryId) ?? {
      amount: 0,
      transactionCount: 0,
    };

    totals.set(categoryId, {
      amount:
        current.amount +
        Number(row.amount),
      transactionCount:
        current.transactionCount + 1,
    });
  }

  const grandTotal = Array.from(
    totals.values(),
  ).reduce(
    (total, item) => total + item.amount,
    0,
  );

  return Array.from(totals.entries())
    .map(([id, item]) => ({
      id,
      name:
        id === "__uncategorized__"
          ? "Tanpa kategori"
          : categoryMap.get(id) ??
            "Kategori tidak tersedia",
      amount: item.amount,
      percentage:
        grandTotal > 0
          ? (item.amount / grandTotal) *
            100
          : 0,
      transactionCount:
        item.transactionCount,
    }))
    .sort(
      (first, second) =>
        second.amount - first.amount,
    );
}

function findHighestSalesDay(
  sales: SaleRow[],
): HighestSalesDay | null {
  if (sales.length === 0) {
    return null;
  }

  const totals = new Map<
    string,
    {
      amount: number;
      transactionCount: number;
    }
  >();

  for (const row of sales) {
    const current = totals.get(
      row.transaction_date,
    ) ?? {
      amount: 0,
      transactionCount: 0,
    };

    totals.set(row.transaction_date, {
      amount: current.amount + row.amount,
      transactionCount:
        current.transactionCount + 1,
    });
  }

  let result: HighestSalesDay | null =
    null;

  for (const [date, item] of totals) {
    if (
      result === null ||
      item.amount > result.amount
    ) {
      result = {
        date,
        amount: item.amount,
        transactionCount:
          item.transactionCount,
      };
    }
  }

  return result;
}

function countActiveDays(
  sales: SaleRow[],
  expenses: ExpenseRow[],
): number {
  const dates = new Set<string>();

  for (const row of sales) {
    dates.add(row.transaction_date);
  }

  for (const row of expenses) {
    dates.add(row.transaction_date);
  }

  return dates.size;
}

function buildRecentSales(
  sales: SaleRow[],
  categoryMap: Map<string, string>,
): RecentTransactionItem[] {
  return sales
    .map((row) => ({
      id: row.id,
      type: "sales" as const,
      date: row.transaction_date,
      createdAt: row.created_at,
      categoryName:
        categoryMap.get(
          row.sales_category_id,
        ) ?? "Kategori tidak tersedia",
      amount: row.amount,
      notes: row.notes,
    }))
    .sort(sortRecentTransactions)
    .slice(0, RECENT_TRANSACTION_LIMIT);
}

function buildRecentExpenses(
  expenses: ExpenseRow[],
  categoryMap: Map<string, string>,
): RecentTransactionItem[] {
  return expenses
    .map((row) => ({
      id: row.id,
      type: "expenses" as const,
      date: row.transaction_date,
      createdAt: row.created_at,
      categoryName:
        categoryMap.get(
          row.expense_category_id,
        ) ?? "Kategori tidak tersedia",
      amount: row.amount,
      notes: row.notes,
    }))
    .sort(sortRecentTransactions)
    .slice(0, RECENT_TRANSACTION_LIMIT);
}

function sortRecentTransactions(
  first: RecentTransactionItem,
  second: RecentTransactionItem,
): number {
  const firstTimestamp =
    new Date(
      `${first.date}T00:00:00`,
    ).getTime();

  const secondTimestamp =
    new Date(
      `${second.date}T00:00:00`,
    ).getTime();

  if (firstTimestamp !== secondTimestamp) {
    return secondTimestamp - firstTimestamp;
  }

  return (
    new Date(second.createdAt).getTime() -
    new Date(first.createdAt).getTime()
  );
}

function RecentTransactionCard({
  title,
  description,
  type,
  data,
  loading,
}: {
  title: string;
  description: string;
  type: "sales" | "expenses";
  data: RecentTransactionItem[];
  loading: boolean;
}) {
  const isSales = type === "sales";

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <div
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              isSales
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            ].join(" ")}
          >
            {isSales ? (
              <ArrowUpRight className="h-5 w-5" />
            ) : (
              <ArrowDownRight className="h-5 w-5" />
            )}
          </div>

          <div>
            <CardTitle className="text-base">
              {title}
            </CardTitle>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <RecentTransactionSkeleton />
        ) : data.length === 0 ? (
          <RecentTransactionEmptyState
            type={type}
          />
        ) : (
          <ul className="divide-y">
            {data.map((transaction) => (
              <li
                key={transaction.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium"
                    title={
                      transaction.categoryName
                    }
                  >
                    {transaction.categoryName}
                  </p>

                  <p
                    className="mt-0.5 truncate text-xs text-muted-foreground"
                    title={
                      transaction.notes ??
                      undefined
                    }
                  >
                    {formatDate(
                      transaction.date,
                    )}

                    {transaction.notes
                      ? ` · ${transaction.notes}`
                      : ""}
                  </p>
                </div>

                <p
                  className={[
                    "shrink-0 text-sm font-semibold",
                    isSales
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive",
                  ].join(" ")}
                >
                  {formatRupiah(
                    transaction.amount,
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentTransactionEmptyState({
  type,
}: {
  type: "sales" | "expenses";
}) {
  const isSales = type === "sales";

  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        {isSales ? (
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ReceiptText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <h3 className="mt-3 text-sm font-semibold">
        Belum ada{" "}
        {isSales
          ? "penjualan"
          : "pengeluaran"}
      </h3>

      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        Pencatatan{" "}
        {isSales
          ? "penjualan"
          : "pengeluaran"}{" "}
        terbaru pada periode terpilih akan
        muncul di sini.
      </p>
    </div>
  );
}

function RecentTransactionSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({
        length: RECENT_TRANSACTION_LIMIT,
      }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-4"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>

          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function DashboardError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />

      <AlertTitle>
        Dashboard gagal dimuat
      </AlertTitle>

      <AlertDescription>
        <p>{getErrorMessage(error)}</p>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={onRetry}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Coba Lagi
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null
  ) {
    const queryError = error as QueryError;

    if (queryError.message) {
      return queryError.message;
    }

    if (queryError.details) {
      return queryError.details;
    }

    if (queryError.hint) {
      return queryError.hint;
    }
  }

  return "Terjadi kesalahan saat mengambil data dashboard dari Supabase.";
}
