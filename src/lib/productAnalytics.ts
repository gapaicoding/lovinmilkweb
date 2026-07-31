import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { ProductReportRow } from "@/lib/reporting";

export interface ProductAnalyticsSale {
  transaction_date: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface ProductAnalyticsProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  sales_category_id: string;
  selling_price: number;
  is_active: boolean;
  deleted_at: string | null;
}

export interface ProductSalesHistoryRow {
  product_id: string;
  transaction_date: string;
}

export interface ProductRankingItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  categoryName: string;
  quantity: number;
  revenue: number;
  transactionCount: number;
  revenueContribution: number;
}

export type ProductAnalyticsSort =
  | "quantity-desc"
  | "quantity-asc"
  | "name-asc"
  | "name-desc"
  | "revenue-desc"
  | "gross-profit-desc";

export interface RankedProductReportRow extends ProductReportRow {
  rowKey: string;
  rank: number;
  quantityContribution: number;
}

export interface CategoryQuantityItem {
  id: string;
  name: string;
  quantity: number;
  productCount: number;
}

export interface FilterProductRowsOptions {
  search?: string;
  category?: string;
}

export type ProductMovementStatus =
  | "trending"
  | "new"
  | "declining"
  | "not_sold_current";

export interface ProductMovementItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  categoryName: string;
  currentQuantity: number;
  previousQuantity: number;
  currentRevenue: number;
  previousRevenue: number;
  quantityChange: number;
  revenueChange: number;
  quantityGrowth: number | null;
  revenueGrowth: number | null;
  status: ProductMovementStatus;
}

export interface ProductWithoutSalesItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  categoryName: string;
  sellingPrice: number;
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  neverSold: boolean;
}

export interface ProductAnalyticsSummaryData {
  totalQuantity: number;
  totalRevenue: number;
  salesTransactionCount: number;
  productsSold: number;
  activeProductCount: number;
  averageUnitPrice: number;
  productsWithoutSales: number;
}

export interface ProductAnalyticsResult {
  summary: ProductAnalyticsSummaryData;
  ranking: ProductRankingItem[];
  trending: ProductMovementItem[];
  declining: ProductMovementItem[];
  withoutSales: ProductWithoutSalesItem[];
}

export type ProductTrendGranularity =
  | "daily"
  | "weekly"
  | "monthly";

export interface ProductSalesTrendItem {
  key: string;
  label: string;
  date: string;
  quantity: number;
  revenue: number;
  transactionCount: number;
}

export interface ProductSalesTrendResult {
  granularity: ProductTrendGranularity;
  granularityLabel: string;
  data: ProductSalesTrendItem[];
}

interface ProductAggregate {
  quantity: number;
  revenue: number;
  transactionCount: number;
}

interface BuildProductAnalyticsParams {
  products: ProductAnalyticsProduct[];
  currentSales: ProductAnalyticsSale[];
  previousSales: ProductAnalyticsSale[];
  salesHistory: ProductSalesHistoryRow[];
  categoryMap: Map<string, string>;
  selectedRangeTo: string;
}

interface BuildProductSalesTrendParams {
  from: Date;
  to: Date;
  sales: ProductAnalyticsSale[];
}

export function buildProductAnalytics({
  products,
  currentSales,
  previousSales,
  salesHistory,
  categoryMap,
  selectedRangeTo,
}: BuildProductAnalyticsParams): ProductAnalyticsResult {
  const productMap = new Map(
    products.map((product) => [product.id, product]),
  );

  const currentAggregate = aggregateSalesByProduct(
    currentSales,
  );
  const previousAggregate = aggregateSalesByProduct(
    previousSales,
  );

  const totalRevenue = sumAggregate(
    currentAggregate,
    "revenue",
  );
  const totalQuantity = sumAggregate(
    currentAggregate,
    "quantity",
  );

  const ranking = Array.from(
    currentAggregate.entries(),
  )
    .map(([productId, aggregate]) => {
      const product = productMap.get(productId);

      return {
        productId,
        name:
          product?.name ??
          "Produk tidak tersedia",
        sku: product?.sku ?? null,
        unit: product?.unit ?? "unit",
        categoryName: product
          ? categoryMap.get(
              product.sales_category_id,
            ) ?? "Kategori tidak tersedia"
          : "Kategori tidak tersedia",
        quantity: aggregate.quantity,
        revenue: aggregate.revenue,
        transactionCount:
          aggregate.transactionCount,
        revenueContribution:
          totalRevenue > 0
            ? (aggregate.revenue /
                totalRevenue) *
              100
            : 0,
      };
    })
    .sort(
      (first, second) =>
        second.revenue - first.revenue ||
        second.quantity - first.quantity ||
        first.name.localeCompare(
          second.name,
          "id-ID",
        ),
    );

  const movementProductIds = new Set<string>([
    ...currentAggregate.keys(),
    ...previousAggregate.keys(),
  ]);

  const movementItems = Array.from(
    movementProductIds,
  ).map((productId) =>
    buildMovementItem({
      productId,
      product: productMap.get(productId),
      current:
        currentAggregate.get(productId) ??
        emptyAggregate(),
      previous:
        previousAggregate.get(productId) ??
        emptyAggregate(),
      categoryMap,
    }),
  );

  const trending = movementItems
    .filter(
      (item) =>
        item.currentQuantity >
          item.previousQuantity &&
        item.currentQuantity > 0,
    )
    .map((item) => ({
      ...item,
      status:
        item.previousQuantity === 0
          ? ("new" as const)
          : ("trending" as const),
    }))
    .sort(sortTrendingProducts);

  const declining = movementItems
    .filter(
      (item) =>
        item.previousQuantity > 0 &&
        item.currentQuantity <
          item.previousQuantity,
    )
    .map((item) => ({
      ...item,
      status:
        item.currentQuantity === 0
          ? ("not_sold_current" as const)
          : ("declining" as const),
    }))
    .sort(sortDecliningProducts);

  const lastSaleMap =
    buildLastSaleDateMap(salesHistory);

  const activeProducts = products.filter(
    (product) =>
      product.is_active &&
      product.deleted_at === null,
  );

  const selectedRangeEnd = parseISO(
    selectedRangeTo,
  );

  const withoutSales = activeProducts
    .filter(
      (product) =>
        !currentAggregate.has(product.id),
    )
    .map((product) => {
      const lastSaleDate =
        lastSaleMap.get(product.id) ?? null;

      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        categoryName:
          categoryMap.get(
            product.sales_category_id,
          ) ?? "Kategori tidak tersedia",
        sellingPrice: Number(
          product.selling_price,
        ),
        lastSaleDate,
        daysSinceLastSale: lastSaleDate
          ? Math.max(
              differenceInCalendarDays(
                selectedRangeEnd,
                parseISO(lastSaleDate),
              ),
              0,
            )
          : null,
        neverSold: lastSaleDate === null,
      };
    })
    .sort(sortProductsWithoutSales);

  return {
    summary: {
      totalQuantity,
      totalRevenue,
      salesTransactionCount:
        currentSales.length,
      productsSold: currentAggregate.size,
      activeProductCount:
        activeProducts.length,
      averageUnitPrice:
        totalQuantity > 0
          ? totalRevenue / totalQuantity
          : 0,
      productsWithoutSales:
        withoutSales.length,
    },
    ranking,
    trending,
    declining,
    withoutSales,
  };
}

export function filterProductReportRows(
  rows: ProductReportRow[],
  { search = "", category = "all" }: FilterProductRowsOptions,
): ProductReportRow[] {
  const normalizedSearch = search.trim().toLocaleLowerCase("id-ID");
  return rows.filter((row) => {
    const matchesSearch = normalizedSearch.length === 0 || row.product_name.toLocaleLowerCase("id-ID").includes(normalizedSearch);
    const matchesCategory = category === "all" || (row.category_name ?? "Tanpa Kategori") === category;
    return matchesSearch && matchesCategory;
  });
}

export function rankProductReportRows(
  rows: ProductReportRow[],
  sort: ProductAnalyticsSort = "quantity-desc",
): RankedProductReportRow[] {
  const sorted = [...rows].sort((first, second) => {
    switch (sort) {
      case "quantity-asc": return first.quantity - second.quantity || first.product_name.localeCompare(second.product_name, "id-ID");
      case "name-asc": return first.product_name.localeCompare(second.product_name, "id-ID");
      case "name-desc": return second.product_name.localeCompare(first.product_name, "id-ID");
      case "revenue-desc": return (second.revenue ?? Number.NEGATIVE_INFINITY) - (first.revenue ?? Number.NEGATIVE_INFINITY) || second.quantity - first.quantity;
      case "gross-profit-desc": return (second.gross_profit ?? Number.NEGATIVE_INFINITY) - (first.gross_profit ?? Number.NEGATIVE_INFINITY) || second.quantity - first.quantity;
      default: return second.quantity - first.quantity || first.product_name.localeCompare(second.product_name, "id-ID");
    }
  });
  const totalQuantity = sorted.reduce((total, row) => total + row.quantity, 0);
  return sorted.map((row, index) => ({
    ...row,
    rowKey: `${row.source_status}:${row.product_id ?? row.product_name}:${index}`,
    rank: index + 1,
    quantityContribution: totalQuantity > 0 ? (row.quantity / totalQuantity) * 100 : 0,
  }));
}

export function groupProductRowsByCategory(rows: ProductReportRow[]): CategoryQuantityItem[] {
  const groups = new Map<string, CategoryQuantityItem>();
  for (const row of rows) {
    const name = row.category_name ?? "Tanpa Kategori";
    const current = groups.get(name) ?? { id: name, name, quantity: 0, productCount: 0 };
    groups.set(name, { ...current, quantity: current.quantity + row.quantity, productCount: current.productCount + 1 });
  }
  return [...groups.values()].sort((first, second) => second.quantity - first.quantity || first.name.localeCompare(second.name, "id-ID"));
}

export function productRowsToRankingItems(rows: ProductReportRow[]): ProductRankingItem[] {
  return rankProductReportRows(rows).map((row) => ({
    productId: row.product_id ?? row.rowKey,
    name: row.product_name,
    sku: null,
    unit: "item",
    categoryName: row.category_name ?? "Tanpa Kategori",
    quantity: row.quantity,
    revenue: row.financial_available ? (row.revenue ?? 0) : 0,
    transactionCount: 0,
    revenueContribution: 0,
  }));
}

export function buildProductSalesTrend({
  from,
  to,
  sales,
}: BuildProductSalesTrendParams): ProductSalesTrendResult {
  if (from.getTime() > to.getTime()) {
    return {
      granularity: "daily",
      granularityLabel: "per hari",
      data: [],
    };
  }

  const totalDays = Math.max(
    differenceInCalendarDays(to, from) + 1,
    1,
  );

  if (totalDays <= 31) {
    return {
      granularity: "daily",
      granularityLabel: "per hari",
      data: buildDailyProductTrend({
        from,
        to,
        sales,
      }),
    };
  }

  if (totalDays <= 180) {
    return {
      granularity: "weekly",
      granularityLabel: "per minggu",
      data: buildWeeklyProductTrend({
        from,
        to,
        sales,
      }),
    };
  }

  return {
    granularity: "monthly",
    granularityLabel: "per bulan",
    data: buildMonthlyProductTrend({
      from,
      to,
      sales,
    }),
  };
}

function aggregateSalesByProduct(
  sales: ProductAnalyticsSale[],
): Map<string, ProductAggregate> {
  const aggregate = new Map<
    string,
    ProductAggregate
  >();

  for (const sale of sales) {
    const current =
      aggregate.get(sale.product_id) ??
      emptyAggregate();

    aggregate.set(sale.product_id, {
      quantity:
        current.quantity +
        normalizeNumber(sale.quantity),
      revenue:
        current.revenue +
        resolveRevenue(sale),
      transactionCount:
        current.transactionCount + 1,
    });
  }

  return aggregate;
}

function buildMovementItem({
  productId,
  product,
  current,
  previous,
  categoryMap,
}: {
  productId: string;
  product:
    | ProductAnalyticsProduct
    | undefined;
  current: ProductAggregate;
  previous: ProductAggregate;
  categoryMap: Map<string, string>;
}): ProductMovementItem {
  return {
    productId,
    name:
      product?.name ??
      "Produk tidak tersedia",
    sku: product?.sku ?? null,
    unit: product?.unit ?? "unit",
    categoryName: product
      ? categoryMap.get(
          product.sales_category_id,
        ) ?? "Kategori tidak tersedia"
      : "Kategori tidak tersedia",
    currentQuantity: current.quantity,
    previousQuantity: previous.quantity,
    currentRevenue: current.revenue,
    previousRevenue: previous.revenue,
    quantityChange:
      current.quantity - previous.quantity,
    revenueChange:
      current.revenue - previous.revenue,
    quantityGrowth: calculateComparableGrowth(
      current.quantity,
      previous.quantity,
    ),
    revenueGrowth: calculateComparableGrowth(
      current.revenue,
      previous.revenue,
    ),
    status: "trending",
  };
}

function calculateComparableGrowth(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return (
    ((current - previous) /
      Math.abs(previous)) *
    100
  );
}

function buildLastSaleDateMap(
  salesHistory: ProductSalesHistoryRow[],
): Map<string, string> {
  const lastSaleMap = new Map<
    string,
    string
  >();

  for (const sale of salesHistory) {
    const current =
      lastSaleMap.get(sale.product_id);

    if (
      !current ||
      sale.transaction_date > current
    ) {
      lastSaleMap.set(
        sale.product_id,
        sale.transaction_date,
      );
    }
  }

  return lastSaleMap;
}

function buildDailyProductTrend({
  from,
  to,
  sales,
}: BuildProductSalesTrendParams): ProductSalesTrendItem[] {
  const totals = aggregateSalesByPeriodKey(
    sales,
    (sale) => sale.transaction_date,
  );

  const days = eachDayOfInterval({
    start: from,
    end: to,
  });

  return days.map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const aggregate =
      totals.get(key) ?? emptyAggregate();

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
      quantity: aggregate.quantity,
      revenue: aggregate.revenue,
      transactionCount:
        aggregate.transactionCount,
    };
  });
}

function buildWeeklyProductTrend({
  from,
  to,
  sales,
}: BuildProductSalesTrendParams): ProductSalesTrendItem[] {
  const totals = aggregateSalesByPeriodKey(
    sales,
    (sale) =>
      format(
        startOfWeek(
          parseISO(sale.transaction_date),
          {
            weekStartsOn: 1,
          },
        ),
        "yyyy-MM-dd",
      ),
  );

  const weeks = eachWeekOfInterval(
    {
      start: from,
      end: to,
    },
    {
      weekStartsOn: 1,
    },
  );

  return weeks.map((weekStart) => {
    const key = format(
      startOfWeek(weekStart, {
        weekStartsOn: 1,
      }),
      "yyyy-MM-dd",
    );
    const aggregate =
      totals.get(key) ?? emptyAggregate();

    return {
      key,
      label: format(
        weekStart,
        "dd MMM",
        {
          locale: idLocale,
        },
      ),
      date: key,
      quantity: aggregate.quantity,
      revenue: aggregate.revenue,
      transactionCount:
        aggregate.transactionCount,
    };
  });
}

function buildMonthlyProductTrend({
  from,
  to,
  sales,
}: BuildProductSalesTrendParams): ProductSalesTrendItem[] {
  const totals = aggregateSalesByPeriodKey(
    sales,
    (sale) =>
      format(
        startOfMonth(
          parseISO(sale.transaction_date),
        ),
        "yyyy-MM",
      ),
  );

  return eachMonthOfInterval({
    start: from,
    end: to,
  }).map((month) => {
    const key = format(month, "yyyy-MM");
    const aggregate =
      totals.get(key) ?? emptyAggregate();

    return {
      key,
      label: format(
        month,
        "MMM yy",
        {
          locale: idLocale,
        },
      ),
      date: `${key}-01`,
      quantity: aggregate.quantity,
      revenue: aggregate.revenue,
      transactionCount:
        aggregate.transactionCount,
    };
  });
}

function aggregateSalesByPeriodKey(
  sales: ProductAnalyticsSale[],
  getKey: (
    sale: ProductAnalyticsSale,
  ) => string,
): Map<string, ProductAggregate> {
  const totals = new Map<
    string,
    ProductAggregate
  >();

  for (const sale of sales) {
    const key = getKey(sale);
    const current =
      totals.get(key) ?? emptyAggregate();

    totals.set(key, {
      quantity:
        current.quantity +
        normalizeNumber(sale.quantity),
      revenue:
        current.revenue +
        resolveRevenue(sale),
      transactionCount:
        current.transactionCount + 1,
    });
  }

  return totals;
}

function resolveRevenue(
  sale: ProductAnalyticsSale,
): number {
  const amount = normalizeNumber(sale.amount);

  if (amount > 0) {
    return amount;
  }

  return (
    normalizeNumber(sale.quantity) *
    normalizeNumber(sale.unit_price)
  );
}

function sumAggregate(
  aggregate: Map<
    string,
    ProductAggregate
  >,
  field: "quantity" | "revenue",
): number {
  return Array.from(
    aggregate.values(),
  ).reduce(
    (total, item) =>
      total + item[field],
    0,
  );
}

function sortTrendingProducts(
  first: ProductMovementItem,
  second: ProductMovementItem,
): number {
  if (
    first.status !== second.status
  ) {
    return first.status === "new" ? -1 : 1;
  }

  return (
    second.quantityChange -
      first.quantityChange ||
    second.revenueChange -
      first.revenueChange ||
    first.name.localeCompare(
      second.name,
      "id-ID",
    )
  );
}

function sortDecliningProducts(
  first: ProductMovementItem,
  second: ProductMovementItem,
): number {
  if (
    first.status !== second.status
  ) {
    return first.status ===
      "not_sold_current"
      ? -1
      : 1;
  }

  return (
    first.quantityChange -
      second.quantityChange ||
    first.revenueChange -
      second.revenueChange ||
    first.name.localeCompare(
      second.name,
      "id-ID",
    )
  );
}

function sortProductsWithoutSales(
  first: ProductWithoutSalesItem,
  second: ProductWithoutSalesItem,
): number {
  if (first.neverSold !== second.neverSold) {
    return first.neverSold ? -1 : 1;
  }

  const firstDays =
    first.daysSinceLastSale ?? 0;
  const secondDays =
    second.daysSinceLastSale ?? 0;

  return (
    secondDays - firstDays ||
    first.name.localeCompare(
      second.name,
      "id-ID",
    )
  );
}

function emptyAggregate(): ProductAggregate {
  return {
    quantity: 0,
    revenue: 0,
    transactionCount: 0,
  };
}

function normalizeNumber(
  value: number,
): number {
  return Number.isFinite(Number(value))
    ? Number(value)
    : 0;
}
