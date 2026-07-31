export interface PurchaseLineInput {
  inventoryItemId: string;
  subunitId?: string;
  quantity: number;
  unitCost: number;
  notes?: string;
}

export function isValidPurchaseQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isValidUnitCost(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function calculatePurchaseSubtotal(quantity: number, unitCost: number): number {
  if (!isValidPurchaseQuantity(quantity) || !isValidUnitCost(unitCost)) return 0;
  return Math.round(quantity * unitCost * 100) / 100;
}

export function calculatePurchaseTotal(lines: PurchaseLineInput[]): number {
  return Math.round(
    lines.reduce(
      (total, line) => total + calculatePurchaseSubtotal(line.quantity, line.unitCost),
      0,
    ) * 100,
  ) / 100;
}

export function summarizePurchaseSubunits(
  names: Array<string | null | undefined>,
): string {
  const unique = [...new Set(names.filter((name): name is string => Boolean(name?.trim())))];
  return unique.length ? unique.join(" + ") : "Belum tersedia";
}

export function validatePurchaseLines(lines: PurchaseLineInput[]): string | null {
  if (!lines.length) return "Minimal satu item pembelian wajib diisi.";
  const ids = new Set<string>();
  for (const line of lines) {
    if (!line.inventoryItemId) return "Inventory Item wajib dipilih.";
    if (ids.has(line.inventoryItemId)) {
      return "Inventory Item yang sama tidak boleh dipilih dua kali.";
    }
    ids.add(line.inventoryItemId);
    if (!isValidPurchaseQuantity(line.quantity)) return "Quantity harus lebih dari 0.";
    if (!isValidUnitCost(line.unitCost)) return "Unit cost tidak valid.";
  }
  return null;
}

export function calculateGrossProfit(revenue: number, hpp: number): number {
  return Math.round((revenue - hpp) * 100) / 100;
}

export function formatCostStatus(status: string): string {
  return status === "provisional" ? "Provisional" : "Final";
}
