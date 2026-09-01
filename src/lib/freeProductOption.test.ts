import { describe, expect, it } from "vitest";
import {
  buildProductPickerOptions,
  inferPricingMode,
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

const lovinProduct: SalesProductOption = {
  productId: "11111111-1111-4111-8111-111111111111",
  productName: "Original Milk",
  productSku: "MILK-ORIGINAL",
  unit: "cup",
  sellingPrice: 15000,
  categoryId: "22222222-2222-4222-8222-222222222222",
  categoryName: "Milks Series",
  subunitId: "33333333-3333-4333-8333-333333333333",
  subunitName: "Lovin Milk",
  outletId: "44444444-4444-4444-8444-444444444444",
};
const arayyaProduct = { ...lovinProduct, productId: "55555555-5555-4555-8555-555555555555", productName: "Crispy Fries", subunitId: "66666666-6666-4666-8666-666666666666", subunitName: "Arayya" };

describe("virtual free product option", () => {
  it("parses free and gratis as mode tokens", () => {
    expect(parseProductSearch("free")).toEqual({ pricingMode: "free", productQuery: "" });
    expect(parseProductSearch(" GRATIS original milk ")).toEqual({ pricingMode: "free", productQuery: "original milk" });
    expect(parseProductSearch("original")).toEqual({ pricingMode: "normal", productQuery: "original" });
  });

  it("offers only Lovin products as free virtual options", () => {
    const options = buildProductPickerOptions([lovinProduct, arayyaProduct], "free");
    expect(options).toHaveLength(1);
    expect(options[0].optionId).toBe(`free:${lovinProduct.productId}`);
    expect(options[0].product.productId).toBe(lovinProduct.productId);
    expect(isLovinMilkProduct(arayyaProduct)).toBe(false);
  });

  it("keeps normal and free variants on the same canonical product", () => {
    const normal = buildProductPickerOptions([lovinProduct], "original")[0];
    const free = buildProductPickerOptions([lovinProduct], "free original")[0];
    expect(normal.optionId).toBe(`normal:${lovinProduct.productId}`);
    expect(free.optionId).toBe(`free:${lovinProduct.productId}`);
    expect(selectProductPickerOption(normal)).toEqual({ productId: lovinProduct.productId, pricingMode: "normal", unitPriceText: "15000" });
    expect(selectProductPickerOption(free)).toEqual({ productId: lovinProduct.productId, pricingMode: "free", unitPriceText: "0" });
    expect(productPickerLabel(free)).toBe("FREE · Original Milk");
  });

  it("infers existing zero-price Lovin lines without changing other lines", () => {
    expect(inferPricingMode(lovinProduct, 0)).toBe("free");
    expect(inferPricingMode(lovinProduct, 15000)).toBe("normal");
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
      items: [{ productId: lovinProduct.productId, quantity: 1, unitPrice: 0, notes: "Bawa pulang" }],
    });
    expect(payload.p_items).toEqual([{ product_id: lovinProduct.productId, quantity: 1, unit_price: 0, notes: "Bawa pulang" }]);
    expect(JSON.stringify(payload)).not.toContain("free:");
  });

  it("retains the normal picker limit", () => {
    const products = Array.from({ length: 31 }, (_, index) => ({ ...lovinProduct, productId: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`, productName: `Milk ${index}` }));
    expect(buildProductPickerOptions(products, "")).toHaveLength(30);
    expect(buildProductPickerOptions(products, "free")).toHaveLength(30);
  });
});
