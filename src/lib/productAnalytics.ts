import type { ProductReportRow } from "@/lib/reporting";

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

export function filterProductReportRows(
  rows: ProductReportRow[],
  { search = "", category = "all" }: FilterProductRowsOptions,
): ProductReportRow[] {
  const normalizedSearch = search.trim().toLocaleLowerCase("id-ID");
  return rows.filter((row) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      row.product_name.toLocaleLowerCase("id-ID").includes(normalizedSearch);
    const matchesCategory =
      category === "all" || (row.category_name ?? "Tanpa Kategori") === category;
    return matchesSearch && matchesCategory;
  });
}

export function rankProductReportRows(
  rows: ProductReportRow[],
  sort: ProductAnalyticsSort = "quantity-desc",
): RankedProductReportRow[] {
  const sorted = [...rows].sort((first, second) => {
    switch (sort) {
      case "quantity-asc":
        return first.quantity - second.quantity || first.product_name.localeCompare(second.product_name, "id-ID");
      case "name-asc":
        return first.product_name.localeCompare(second.product_name, "id-ID");
      case "name-desc":
        return second.product_name.localeCompare(first.product_name, "id-ID");
      case "revenue-desc":
        return (second.revenue ?? Number.NEGATIVE_INFINITY) - (first.revenue ?? Number.NEGATIVE_INFINITY) || second.quantity - first.quantity;
      case "gross-profit-desc":
        return (second.gross_profit ?? Number.NEGATIVE_INFINITY) - (first.gross_profit ?? Number.NEGATIVE_INFINITY) || second.quantity - first.quantity;
      default:
        return second.quantity - first.quantity || first.product_name.localeCompare(second.product_name, "id-ID");
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
    groups.set(name, {
      ...current,
      quantity: current.quantity + row.quantity,
      productCount: current.productCount + 1,
    });
  }
  return [...groups.values()].sort(
    (first, second) => second.quantity - first.quantity || first.name.localeCompare(second.name, "id-ID"),
  );
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
