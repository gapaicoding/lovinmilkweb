import { describe, expect, it } from "vitest";
import {
  buildProductPickerOptions,
  inferPricingMode,
  isFreeEligibleProduct,
  isLovinMilkProduct,
  parseProductSearch,
  productPickerLabel,
  selectProductPickerOption,
} from "@/lib/freeProductOption";
import {
  buildCreateTransactionPayload,
  calculateLineSubtotal,
  calculateTotalQuantity,
  calculateTransactionTotal,
  type SalesProductOption,
} from "@/lib/salesTransactions";

const APPROVED_SKUS = [
  "LM-D589E3AEE2",
  "LM-CCAC0264E2",
  "LM-80A8BA9C58",
  "LM-9DDF56CA1E",
  "LM-A0C9396E6D",
  "LM-81B1B22A3D",
  "LM-BF98BE2823",
  "LM-3A8E206706",
  "LM-F976DC88F7",
  "LM-63B15631C3",
] as const;

const productId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const product = (
  productId: string,
  productName: string,
  productSku: string,
  categoryName: string,
  subunitCode = "LOVIN_MILK",
): SalesProductOption => ({
  productId,
  productName,
  productSku,
  unit: "pcs",
  sellingPrice: 15000,
  categoryId: `category-${productId}`,
  categoryName,
  subunitId: `subunit-${subunitCode}`,
  subunitCode,
  subunitName: subunitCode === "LOVIN_MILK" ? "Lovin Milk" : "Arayya",
  outletId: "outlet-1",
});

const approvedProducts: SalesProductOption[] = [
  product(productId(1), "Crispy French Fries", "LM-D589E3AEE2", "Snack Series"),
  product(productId(2), "Crispy Fried Banana", "LM-CCAC0264E2", "Snack Series"),
  product(productId(3), "Zesty Lemon Tea", "LM-80A8BA9C58", "Ice Tea and Coffee"),
  product(productId(4), "Ice Tea", "LM-9DDF56CA1E", "Ice Tea and Coffee"),
  product(productId(5), "Original Milk", "LM-A0C9396E6D", "Milks Series"),
  product(productId(6), "Vanilla Milkshake", "LM-81B1B22A3D", "Milkshake Series"),
  product(productId(7), "Butter Rice Ball with Popcorn Chicken", "LM-BF98BE2823", "Kids Meal Package"),
  product(productId(8), "Katsu Nori Rice Kids Meal", "LM-3A8E206706", "Kids Meal Package"),
  { ...product(productId(12), "Cheese Mix Platter", "LM-F976DC88F7", "Snack Series"), sellingPrice: 17000 },
  { ...product(productId(13), "Fried Noodle Kids Meal", "LM-63B15631C3", "Kids Meal Package"), sellingPrice: 21000 },
];

const originalMilk = approvedProducts[4];
const mineralWater = product(productId(9), "Mineral Water", "LM-MINERAL", "Complementary Series");
const chocolateIceCreamFloat = product(productId(10), "Chocolate Ice Cream Float", "LM-CHOCFLOAT", "Milks Series");
const arayyaProduct = product(productId(11), "Crispy Fries", "AR-FRIES", "Snack Series", "ARAYYA");
const allProducts = [...approvedProducts, mineralWater, chocolateIceCreamFloat, arayyaProduct];

describe("virtual free product option", () => {
  it("parses free and gratis as mode tokens", () => {
    expect(parseProductSearch("free")).toEqual({ pricingMode: "free", productQuery: "" });
    expect(parseProductSearch(" GRATIS original milk ")).toEqual({ pricingMode: "free", productQuery: "original milk" });
    expect(parseProductSearch("original")).toEqual({ pricingMode: "normal", productQuery: "original" });
  });

  it("offers exactly the ten approved SKUs as free options", () => {
    const options = buildProductPickerOptions(allProducts, "free");

    expect(options).toHaveLength(10);
    expect(options.map(({ product: item }) => item.productSku)).toEqual(APPROVED_SKUS);
    expect(new Set(options.map(({ product: item }) => item.productSku))).toEqual(new Set(APPROVED_SKUS));
    expect(options.every(({ pricingMode }) => pricingMode === "free")).toBe(true);
    expect(isFreeEligibleProduct(mineralWater)).toBe(false);
    expect(isFreeEligibleProduct(arayyaProduct)).toBe(false);
  });

  it("keeps gratis eligibility identical to free", () => {
    const freeIds = buildProductPickerOptions(allProducts, "free").map(({ optionId }) => optionId);
    const gratisIds = buildProductPickerOptions(allProducts, "gratis").map(({ optionId }) => optionId);

    expect(gratisIds).toEqual(freeIds);
  });

  it("keeps Lovin membership separate from the approved free allowlist", () => {
    expect(isLovinMilkProduct({ ...mineralWater, subunitName: "Renamed Milk" })).toBe(true);
    expect(isFreeEligibleProduct({ ...mineralWater, productSku: APPROVED_SKUS[0] })).toBe(true);
    expect(isLovinMilkProduct({ ...mineralWater, subunitCode: "ARAYYA", subunitName: "Lovin Milk" })).toBe(false);
  });

  it("keeps non-approved products available normally but not for free", () => {
    expect(buildProductPickerOptions(allProducts, "mineral water").map(({ product: item }) => item.productName)).toEqual(["Mineral Water"]);
    expect(buildProductPickerOptions(allProducts, "free mineral water")).toEqual([]);
    expect(buildProductPickerOptions(allProducts, "chocolate ice cream").map(({ product: item }) => item.productName)).toEqual(["Chocolate Ice Cream Float"]);
    expect(buildProductPickerOptions(allProducts, "free chocolate ice cream")).toEqual([]);
    expect(buildProductPickerOptions(allProducts, "free milk ice")).toEqual([]);
  });

  it("supports targeted searches only within the approved catalog", () => {
    expect(buildProductPickerOptions(allProducts, "free french").map(({ product: item }) => item.productName)).toEqual(["Crispy French Fries"]);
    expect(buildProductPickerOptions(allProducts, "free lemon").map(({ product: item }) => item.productName)).toEqual(["Zesty Lemon Tea"]);
    expect(buildProductPickerOptions(allProducts, "free ice tea").map(({ product: item }) => item.productName)).toEqual(["Zesty Lemon Tea", "Ice Tea"]);
    expect(buildProductPickerOptions(allProducts, "free original milk").map(({ product: item }) => item.productName)).toEqual(["Original Milk"]);
    expect(buildProductPickerOptions(allProducts, "gratis original").map(({ product: item }) => item.productName)).toEqual(["Original Milk"]);
    expect(buildProductPickerOptions(allProducts, "gratis vanilla").map(({ product: item }) => item.productName)).toEqual(["Vanilla Milkshake"]);
    expect(buildProductPickerOptions(allProducts, "free butter rice").map(({ product: item }) => item.productName)).toEqual(["Butter Rice Ball with Popcorn Chicken"]);
    expect(buildProductPickerOptions(allProducts, "free katsu nori").map(({ product: item }) => item.productName)).toEqual(["Katsu Nori Rice Kids Meal"]);
    expect(buildProductPickerOptions(allProducts, "free cheese").map(({ product: item }) => item.productName)).toEqual(["Cheese Mix Platter"]);
    expect(buildProductPickerOptions(allProducts, "free cheese mix").map(({ product: item }) => item.productName)).toEqual(["Cheese Mix Platter"]);
    expect(buildProductPickerOptions(allProducts, "free cheese mix platter").map(({ product: item }) => item.productName)).toEqual(["Cheese Mix Platter"]);
    expect(buildProductPickerOptions(allProducts, "gratis cheese").map(({ product: item }) => item.productName)).toEqual(["Cheese Mix Platter"]);
    expect(buildProductPickerOptions(allProducts, "free fried noodle").map(({ product: item }) => item.productName)).toEqual(["Fried Noodle Kids Meal"]);
    expect(buildProductPickerOptions(allProducts, "free fried noodle kids meal").map(({ product: item }) => item.productName)).toEqual(["Fried Noodle Kids Meal"]);
    expect(buildProductPickerOptions(allProducts, "gratis fried noodle").map(({ product: item }) => item.productName)).toEqual(["Fried Noodle Kids Meal"]);
  });

  it("keeps the new normal and free variants on canonical products", () => {
    const cheese = approvedProducts[8];
    const normalCheese = buildProductPickerOptions([cheese], "cheese mix platter")[0];
    const freeCheese = buildProductPickerOptions([cheese], "free cheese mix platter")[0];
    expect(normalCheese.optionId).toBe(`normal:${cheese.productId}`);
    expect(freeCheese.optionId).toBe(`free:${cheese.productId}`);
    expect(selectProductPickerOption(normalCheese)).toEqual({ productId: cheese.productId, pricingMode: "normal", unitPriceText: "17000" });
    expect(selectProductPickerOption(freeCheese)).toEqual({ productId: cheese.productId, pricingMode: "free", unitPriceText: "0" });
    expect(productPickerLabel(freeCheese)).toBe(`FREE ${String.fromCharCode(183)} Cheese Mix Platter`);

    const noodle = approvedProducts[9];
    const normalNoodle = buildProductPickerOptions([noodle], "fried noodle kids meal")[0];
    const freeNoodle = buildProductPickerOptions([noodle], "free fried noodle kids meal")[0];
    expect(normalNoodle.optionId).toBe(`normal:${noodle.productId}`);
    expect(freeNoodle.optionId).toBe(`free:${noodle.productId}`);
    expect(selectProductPickerOption(normalNoodle)).toEqual({ productId: noodle.productId, pricingMode: "normal", unitPriceText: "21000" });
    expect(selectProductPickerOption(freeNoodle)).toEqual({ productId: noodle.productId, pricingMode: "free", unitPriceText: "0" });
    expect(productPickerLabel(freeNoodle)).toBe(`FREE ${String.fromCharCode(183)} Fried Noodle Kids Meal`);
  });

  it("keeps Original Milk normal and free variants on the same canonical product", () => {
    const normal = buildProductPickerOptions([originalMilk], "original milk")[0];
    const free = buildProductPickerOptions([originalMilk], "free original milk")[0];

    expect(normal.optionId).toBe(`normal:${originalMilk.productId}`);
    expect(free.optionId).toBe(`free:${originalMilk.productId}`);
    expect(selectProductPickerOption(normal)).toEqual({ productId: originalMilk.productId, pricingMode: "normal", unitPriceText: "15000" });
    expect(selectProductPickerOption(free)).toEqual({ productId: originalMilk.productId, pricingMode: "free", unitPriceText: "0" });
    expect(productPickerLabel(free)).toBe("FREE · Original Milk");
  });

  it("infers existing zero-price Lovin lines without applying the new allowlist", () => {
    expect(inferPricingMode(mineralWater, 0)).toBe("free");
    expect(inferPricingMode(mineralWater, 5000)).toBe("normal");
    expect(inferPricingMode(arayyaProduct, 0)).toBe("normal");
    expect(inferPricingMode(null, 0)).toBe("normal");
  });

  it("preserves zero-price totals and canonical submit payloads", () => {
    const lines = [{ quantity: 1, unitPrice: 0 }, { quantity: 2, unitPrice: 15000 }];
    expect(calculateLineSubtotal(lines[0])).toBe(0);
    expect(calculateTransactionTotal(lines)).toBe(30000);
    expect(calculateTotalQuantity(lines)).toBe(3);
    const payload = buildCreateTransactionPayload({
      transactionDate: "2026-09-01",
      items: [{ productId: approvedProducts[0].productId, quantity: 1, unitPrice: 0, notes: "Bawa pulang" }],
    });
    expect(payload.p_items).toEqual([{ product_id: approvedProducts[0].productId, quantity: 1, unit_price: 0, notes: "Bawa pulang" }]);
    expect(JSON.stringify(payload)).not.toContain("free:");
  });

  it("retains the normal picker limit while free results max at ten", () => {
    const normalProducts = Array.from({ length: 31 }, (_, index) => product(productId(index + 20), `Milk ${index}`, `LM-NORMAL-${index}`, "Milks Series"));

    expect(buildProductPickerOptions(normalProducts, "")).toHaveLength(30);
    expect(buildProductPickerOptions(allProducts, "free")).toHaveLength(10);
  });
});
