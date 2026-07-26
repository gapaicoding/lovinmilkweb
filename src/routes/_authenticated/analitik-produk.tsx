import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  RefreshCcw,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import { PageHeader } from "@/components/PageHeader";
import { ExportExcelDialog } from "@/components/reports/ExportExcelDialog";
import {
  DateRangeFilter,
  computePreviousRange,
  computeRange,
  type DateRange,
} from "@/components/DateRangeFilter";
import { ProductAnalyticsSummary } from "@/components/dashboard/ProductAnalyticsSummary";
import { ProductSalesTrendChart } from "@/components/dashboard/ProductSalesTrendChart";
import { ProductAnalyticsTabs } from "@/components/dashboard/ProductAnalyticsTabs";

import {
  buildProductAnalytics,
  buildProductSalesTrend,
  type ProductSalesHistoryRow,
} from "@/lib/productAnalytics";
import {
  formatDate,
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
} from "@/components/ui/card";

export const Route = createFileRoute(
  "/_authenticated/analitik-produk",
)({
  component: ProductAnalyticsPage,
});

type ProductAnalyticsSaleRow = Pick<
  Tables<"sales">,
  | "transaction_date"
  | "product_id"
  | "quantity"
  | "unit_price"
  | "amount"
>;

type ProductRow = Pick<
  Tables<"products">,
  | "id"
  | "name"
  | "sku"
  | "unit"
  | "sales_category_id"
  | "selling_price"
  | "is_active"
  | "deleted_at"
>;

type SalesCategoryRow = Pick<
  Tables<"sales_categories">,
  "id" | "name"
>;

interface PeriodRange {
  from: string;
  to: string;
}

interface QueryError {
  message?: string;
  details?: string;
  hint?: string;
}

function ProductAnalyticsPage() {
  const [range, setRange] = useState<DateRange>(() =>
    computeRange("this_month"),
  );

  const previousDateRange = useMemo(
    () => computePreviousRange(range),
    [range],
  );

  const selectedRange = useMemo<PeriodRange>(
    () => ({
      from: toDateInput(range.from),
      to: toDateInput(range.to),
    }),
    [range.from, range.to],
  );

  const previousRange = useMemo<PeriodRange>(
    () => ({
      from: toDateInput(
        previousDateRange.from,
      ),
      to: toDateInput(
        previousDateRange.to,
      ),
    }),
    [
      previousDateRange.from,
      previousDateRange.to,
    ],
  );

  const combinedRange = useMemo<PeriodRange>(
    () => ({
      from: previousRange.from,
      to: selectedRange.to,
    }),
    [
      previousRange.from,
      selectedRange.to,
    ],
  );

  const isRangeValid =
    selectedRange.from <= selectedRange.to;

  const selectedRangeLabel = useMemo(
    () =>
      `${formatDate(
        selectedRange.from,
      )} – ${formatDate(
        selectedRange.to,
      )}`,
    [selectedRange],
  );

  const previousRangeLabel = useMemo(
    () =>
      `${formatDate(
        previousRange.from,
      )} – ${formatDate(
        previousRange.to,
      )}`,
    [previousRange],
  );

  const salesQuery = useQuery({
    queryKey: [
      "dashboard-product-analytics-sales",
      combinedRange.from,
      combinedRange.to,
    ],
    enabled: isRangeValid,
    staleTime: 30_000,
    queryFn: () =>
      fetchProductAnalyticsSales(
        combinedRange,
      ),
  });

  const productsQuery = useQuery({
    queryKey: [
      "products",
      "product-analytics",
    ],
    staleTime: 5 * 60_000,
    queryFn: fetchProducts,
  });

  const salesCategoriesQuery = useQuery({
    queryKey: ["all-sales-categories"],
    staleTime: 5 * 60_000,
    queryFn: fetchSalesCategories,
  });

  const historyQuery = useQuery({
    queryKey: [
      "dashboard-product-sales-history",
      selectedRange.to,
    ],
    enabled: isRangeValid,
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetchProductSalesHistory(
        selectedRange.to,
      ),
  });

  const selectedSales = useMemo(
    () =>
      filterRowsByRange(
        salesQuery.data ?? [],
        selectedRange,
      ),
    [
      salesQuery.data,
      selectedRange,
    ],
  );

  const previousSales = useMemo(
    () =>
      filterRowsByRange(
        salesQuery.data ?? [],
        previousRange,
      ),
    [
      salesQuery.data,
      previousRange,
    ],
  );

  const categoryMap = useMemo(
    () =>
      new Map(
        (
          salesCategoriesQuery.data ?? []
        ).map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [salesCategoriesQuery.data],
  );

  const analytics = useMemo(
    () =>
      buildProductAnalytics({
        products: productsQuery.data ?? [],
        currentSales: selectedSales,
        previousSales,
        salesHistory:
          historyQuery.data ?? [],
        categoryMap,
        selectedRangeTo: selectedRange.to,
      }),
    [
      productsQuery.data,
      selectedSales,
      previousSales,
      historyQuery.data,
      categoryMap,
      selectedRange.to,
    ],
  );

  const trend = useMemo(
    () =>
      buildProductSalesTrend({
        from: range.from,
        to: range.to,
        sales: selectedSales,
      }),
    [
      range.from,
      range.to,
      selectedSales,
    ],
  );

  const loading =
    salesQuery.isLoading ||
    productsQuery.isLoading ||
    salesCategoriesQuery.isLoading ||
    historyQuery.isLoading;

  const queryError =
    salesQuery.error ??
    productsQuery.error ??
    salesCategoriesQuery.error ??
    historyQuery.error;

  const retryAnalytics = () => {
    void Promise.all([
      salesQuery.refetch(),
      productsQuery.refetch(),
      salesCategoriesQuery.refetch(),
      historyQuery.refetch(),
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analitik Produk"
        description="Analisis produk terlaris, trending, menurun, tanpa penjualan, serta tren quantity dan omzet."
        actions={<ExportExcelDialog reportType="products" currentRange={range} />}
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
              Tren ditampilkan{" "}
              {trend.granularityLabel}
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
            Tanggal mulai tidak boleh
            melewati tanggal akhir.
          </AlertDescription>
        </Alert>
      ) : null}

      {queryError ? (
        <AnalyticsError
          error={queryError}
          onRetry={retryAnalytics}
        />
      ) : null}

      <ProductAnalyticsSummary
        data={analytics.summary}
        loading={loading}
        periodLabel={selectedRangeLabel}
      />

      <ProductSalesTrendChart
        data={trend.data}
        granularityLabel={
          trend.granularityLabel
        }
        periodLabel={selectedRangeLabel}
        loading={loading}
        height={380}
      />

      <ProductAnalyticsTabs
        rankingItems={analytics.ranking}
        trendingItems={analytics.trending}
        decliningItems={analytics.declining}
        withoutSalesItems={
          analytics.withoutSales
        }
        currentPeriodLabel={
          selectedRangeLabel
        }
        previousPeriodLabel={
          previousRangeLabel
        }
        loading={loading}
      />
    </div>
  );
}

async function fetchProductAnalyticsSales(
  range: PeriodRange,
): Promise<ProductAnalyticsSaleRow[]> {
  const pageSize = 1000;
  const result: ProductAnalyticsSaleRow[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * pageSize;

    const { data, error } = await supabase
      .from("sales")
      .select(
        "transaction_date, product_id, quantity, unit_price, amount",
      )
      .is("deleted_at", null)
      .gte(
        "transaction_date",
        range.from,
      )
      .lte(
        "transaction_date",
        range.to,
      )
      .order("transaction_date", {
        ascending: true,
      })
      .range(
        from,
        from + pageSize - 1,
      );

    if (error) {
      throw error;
    }

    const rows = (data ?? []).map(
      (row) => ({
        ...row,
        quantity: Number(row.quantity),
        unit_price: Number(
          row.unit_price,
        ),
        amount: Number(row.amount),
      }),
    );

    result.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
  }

  return result;
}

async function fetchProducts(): Promise<
  ProductRow[]
> {
  const pageSize = 1000;
  const result: ProductRow[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * pageSize;

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, sku, unit, sales_category_id, selling_price, is_active, deleted_at",
      )
      .order("name", {
        ascending: true,
      })
      .range(
        from,
        from + pageSize - 1,
      );

    if (error) {
      throw error;
    }

    const rows = (data ?? []).map(
      (product) => ({
        ...product,
        selling_price: Number(
          product.selling_price,
        ),
      }),
    );

    result.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
  }

  return result;
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

async function fetchProductSalesHistory(
  to: string,
): Promise<ProductSalesHistoryRow[]> {
  const pageSize = 1000;
  const result: ProductSalesHistoryRow[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * pageSize;

    const { data, error } = await supabase
      .from("sales")
      .select(
        "product_id, transaction_date",
      )
      .is("deleted_at", null)
      .lte("transaction_date", to)
      .order("transaction_date", {
        ascending: false,
      })
      .range(
        from,
        from + pageSize - 1,
      );

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    result.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
  }

  return result;
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
      row.transaction_date >=
        range.from &&
      row.transaction_date <= range.to,
  );
}

function AnalyticsError({
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
        Analitik produk gagal dimuat
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
    const queryError =
      error as QueryError;

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

  return "Terjadi kesalahan saat mengambil data analitik produk dari Supabase.";
}
