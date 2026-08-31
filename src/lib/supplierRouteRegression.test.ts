import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/supplier.tsx", "utf8");

describe("supplier route regressions", () => {
  it("shows exact active catalog price text separately from invoice value", () => {
    expect(source).toContain("<TableHead>Harga Produk</TableHead>");
    expect(source).toContain('price: item.price_raw || "—"');
    expect(source).toContain("{line.price}");
    expect(source).toContain('label="Nilai pembelian"');
    expect(source).not.toContain("<TableHead className=\"text-right\">Nilai</TableHead>");
  });
  it("filters inactive or deleted catalog items", () => {
    expect(source).toContain("item.is_active && !item.deleted_at");
  });
  it("preserves hidden supplier fields from editing state", () => {
    expect(source).toContain('source_type: editing?.source_type ?? "manual_web_entry"');
    expect(source).toContain("source_references: editing?.source_references ?? null");
    expect(source).toContain("is_active: editing?.is_active ?? true");
    expect(source).not.toMatch(/source_type:\s*editing\s*\?\s*supplier\?\./);
  });
});
