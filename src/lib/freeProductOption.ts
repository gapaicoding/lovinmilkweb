import type { SalesProductOption } from "@/lib/salesTransactions";

export type PricingMode = "normal" | "free";

export interface SalesProductPickerOption {
  optionId: `${PricingMode}:${string}`;
  product: SalesProductOption;
  pricingMode: PricingMode;
}

export interface ParsedProductSearch {
  pricingMode: PricingMode;
  productQuery: string;
}

const FREE_KEYWORDS = new Set(["free", "gratis"]);
const LOVIN_MILK_SUBUNIT = "lovin milk";

export function parseProductSearch(query: string): ParsedProductSearch {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const hasFreeKeyword = terms.some((term) => FREE_KEYWORDS.has(term.toLocaleLowerCase("id-ID")));

  return {
    pricingMode: hasFreeKeyword ? "free" : "normal",
    productQuery: terms
      .filter((term) => !FREE_KEYWORDS.has(term.toLocaleLowerCase("id-ID")))
      .join(" "),
  };
}

export function isLovinMilkProduct(product: SalesProductOption): boolean {
  return product.subunitName.trim().toLocaleLowerCase("id-ID") === LOVIN_MILK_SUBUNIT;
}

export function buildProductPickerOptions(
  products: readonly SalesProductOption[],
  query: string,
): SalesProductPickerOption[] {
  const parsed = parseProductSearch(query);
  const candidates = products.filter((product) => {
    if (parsed.pricingMode === "free" && !isLovinMilkProduct(product)) return false;
    if (!parsed.productQuery) return true;

    const haystack = [
      product.productName,
      product.productSku ?? "",
      product.categoryName,
      product.subunitName,
    ]
      .join(" ")
      .toLocaleLowerCase("id-ID");

    return haystack.includes(parsed.productQuery.toLocaleLowerCase("id-ID"));
  });

  return candidates.slice(0, 30).map((product) => ({
    optionId: `${parsed.pricingMode}:${product.productId}`,
    product,
    pricingMode: parsed.pricingMode,
  }));
}

export function selectProductPickerOption(option: SalesProductPickerOption) {
  return {
    productId: option.product.productId,
    pricingMode: option.pricingMode,
    unitPriceText: String(option.pricingMode === "free" ? 0 : option.product.sellingPrice),
  } as const;
}

export function inferPricingMode(
  product: SalesProductOption | null | undefined,
  unitPrice: number,
): PricingMode {
  return product && unitPrice === 0 && isLovinMilkProduct(product) ? "free" : "normal";
}

export function productPickerLabel(option: SalesProductPickerOption): string {
  return option.pricingMode === "free"
    ? `FREE · ${option.product.productName}`
    : option.product.productName;
}
