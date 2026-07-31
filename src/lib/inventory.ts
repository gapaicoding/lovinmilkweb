export interface InventoryBalanceLike {
  current_stock: number | string | null;
  minimum_stock: number | string | null;
}

export function toInventoryNumber(value: number | string | null): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isLowStock(item: InventoryBalanceLike): boolean {
  return (
    toInventoryNumber(item.current_stock) <=
    toInventoryNumber(item.minimum_stock)
  );
}

export function calculateStockVariance(
  systemQuantity: number,
  physicalQuantity: number,
): number {
  return Math.round((physicalQuantity - systemQuantity) * 10_000) / 10_000;
}

export function calculateRequiredQuantity(
  soldQuantity: number,
  quantityRequired: number,
): number {
  return Math.round(soldQuantity * quantityRequired * 10_000) / 10_000;
}

export function isValidPositiveQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isValidPhysicalQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function canCreateInventoryRequirement(input: {
  productSubunitId: string | null;
  inventoryItemSubunitId: string | null;
  productIsActive: boolean;
  categoryIsActive: boolean;
  subunitIsActive: boolean;
  inventoryItemIsActive: boolean;
}): boolean {
  return Boolean(
    input.productSubunitId &&
      input.inventoryItemSubunitId &&
      input.productSubunitId === input.inventoryItemSubunitId &&
      input.productIsActive &&
      input.categoryIsActive &&
      input.subunitIsActive &&
      input.inventoryItemIsActive,
  );
}
