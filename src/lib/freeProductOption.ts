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
const LOVIN_MILK_SUBUNIT_CODE = "LOVIN_MILK";
const FREE_ELIGIBLE_PRODUCT_SKUS = new Set([
  "LM-D589E3AEE2", // Crispy French Fries
  "LM-CCAC0264E2", // Crispy Fried Banana
  "LM-80A8BA9C58", // Zesty Lemon Tea
  "LM-9DDF56CA1E", // Ice Tea
  "LM-A0C9396E6D", // Original Milk
  "LM-81B1B22A3D", // Vanilla Milkshake
  "LM-BF98BE2823", // Butter Rice Ball with Popcorn Chicken
  "LM-3A8E206706", // Katsu Nori Rice Kids Meal
  "LM-F976DC88F7", // Cheese Mix Platter
  "LM-63B15631C3", // Fried Noodle Kids Meal
  "LM-3D867F8D2D", // Date Milk
  "LM-DC11DC406F", // Strawberry Milk
]);

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
  return product.subunitCode === LOVIN_MILK_SUBUNIT_CODE;
}

export function isFreeEligibleProduct(product: SalesProductOption): boolean {
  const sku = product.productSku?.trim();

  return isLovinMilkProduct(product) && sku !== undefined && FREE_ELIGIBLE_PRODUCT_SKUS.has(sku);
}

export function buildProductPickerOptions(
  products: readonly SalesProductOption[],
  query: string,
): SalesProductPickerOption[] {
  const parsed = parseProductSearch(query);
  const candidates = products.filter((product) => {
    if (parsed.pricingMode === "free" && !isFreeEligibleProduct(product)) return false;
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
    ? `FREE ${String.fromCharCode(183)} ${option.product.productName}`
    : option.product.productName;
}
