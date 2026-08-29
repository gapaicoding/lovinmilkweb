export type SalesEntrySource = "manual" | "visitor";

export type SalesVisitMode = "none" | "existing" | "new";

export interface ExistingVisitOption {
  visitId: string;
  visitorId: string | null;
  visitorName: string;
  visitorPhone: string | null;
  adultCount: number;
  childCount: number;
  totalVisitors: number;
  activeTransactionCount: number;
  activePurchaseTotal: number;
  checkOutAt: string | null;
}

export interface NewVisitInput {
  visitorId: string | null;
  adultCount: number;
  childCount: number;
  notes: string | null;
}

export interface LinkedVisitSummary {
  visitId: string;
  visitorId: string | null;
  visitorName: string;
  adultCount: number;
  childCount: number;
  totalVisitors: number;
  visitDate: string;
  deletedAt: string | null;
}

export type SalesVisitSelection =
  | { mode: "none" }
  | { mode: "existing"; existingVisitId: string }
  | { mode: "new"; newVisit: NewVisitInput };

export interface SalesTransactionFormItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
}

export interface SalesProductOption {
  productId: string;
  productName: string;
  productSku: string | null;
  unit: string;
  sellingPrice: number;

  categoryId: string;
  categoryName: string;

  subunitId: string;
  subunitName: string;

  outletId: string;
}

export interface SalesTransactionItem {
  id: string;
  salesTransactionId: string;
  lineNo: number;

  productId: string;
  salesCategoryId: string;
  subunitId: string;

  quantity: number;
  unitPrice: number;
  amount: number;
  unitHpp: number;
  hppAmount: number;
  hppStatus: "final" | "provisional";

  productNameSnapshot: string;
  productSkuSnapshot: string | null;
  categoryNameSnapshot: string;
  subunitNameSnapshot: string;
  unitSnapshot: string;

  notes: string | null;
  createdAt: string;
}

export interface SalesTransaction {
  id: string;
  outletId: string;

  transactionNumber: string;
  transactionDate: string;
  totalAmount: number;
  inputterName?: string | null;

  notes: string | null;
  entrySource: SalesEntrySource;

  createdAt: string;
  updatedAt: string;

  createdBy: string | null;
  updatedBy: string | null;

  deletedAt: string | null;
  deletedBy: string | null;

  visitorVisitId: string | null;
  linkedVisit: LinkedVisitSummary | null;

  items: SalesTransactionItem[];
}

export interface SalesTransactionRpcItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
}

export interface CreateSalesTransactionInput {
  transactionDate: string;
  items: readonly SalesTransactionFormItem[];
  notes?: string | null;
  entrySource?: SalesEntrySource;
  outletId?: string | null;
  visit?: SalesVisitSelection;
}

export interface UpdateSalesTransactionInput {
  transactionId: string;
  transactionDate: string;
  items: readonly SalesTransactionFormItem[];
  notes?: string | null;
  visit?: SalesVisitSelection;
}

export interface CreateSalesTransactionRpcArgs {
  p_transaction_date: string;
  p_items: SalesTransactionRpcItem[];
  p_notes: string | null;
  p_entry_source: SalesEntrySource;
  p_outlet_id: string | null;
  p_existing_visit_id: string | null;
  p_new_visit: NewVisitRpcInput | null;
}

export interface UpdateSalesTransactionRpcArgs {
  p_transaction_id: string;
  p_transaction_date: string;
  p_items: SalesTransactionRpcItem[];
  p_notes: string | null;
  p_existing_visit_id: string | null;
  p_new_visit: NewVisitRpcInput | null;
}

export interface NewVisitRpcInput {
  visitor_id: string | null;
  adult_count: number;
  child_count: number;
  notes: string | null;
}

export interface SalesMoneyLine {
  quantity: number;
  unitPrice: number;
}

export interface SalesSubunitSummaryItem {
  subunitId: string;
  subunitName?: string | null;
  subunitNameSnapshot?: string | null;
}

export const MAX_SALES_TRANSACTION_ITEMS = 200;
export const MAX_SALES_TRANSACTION_NOTES_LENGTH = 500;

export const MAX_SALES_TRANSACTION_QUANTITY = 999_999_999.99;
export const MAX_SALES_TRANSACTION_UNIT_PRICE = 999_999_999_999.99;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Menghitung subtotal satu baris transaksi dengan pembulatan
 * dua angka desimal, sama seperti amount pada database.
 */
export function calculateLineSubtotal(item: SalesMoneyLine): number {
  return roundSalesCurrency(item.quantity * item.unitPrice);
}

/**
 * Menghitung total transaksi berdasarkan subtotal setiap baris.
 *
 * Setiap line dibulatkan terlebih dahulu sebelum dijumlahkan supaya
 * perilaku frontend konsisten dengan sales_items.amount di database.
 */
export function calculateTransactionTotal(items: readonly SalesMoneyLine[]): number {
  const total = items.reduce((sum, item) => sum + calculateLineSubtotal(item), 0);

  return roundSalesCurrency(total);
}

/**
 * Menghitung jumlah seluruh quantity pada transaksi.
 */
export function calculateTotalQuantity(items: readonly Pick<SalesMoneyLine, "quantity">[]): number {
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return roundSalesQuantity(quantity);
}

/**
 * Membuat label Subunit seperti:
 *
 *   Lovin Milk
 *   Arayya
 *   Lovin Milk + Arayya
 *
 * Duplikasi Subunit dihilangkan dan urutan mengikuti kemunculan
 * pertama pada item transaksi.
 */
export function summarizeSubunits(items: readonly SalesSubunitSummaryItem[]): string {
  const subunits = new Map<string, string>();

  for (const item of items) {
    const subunitId = item.subunitId.trim();

    const subunitName = (
      item.subunitNameSnapshot ??
      item.subunitName ??
      ""
    ).trim();

    if (!subunitId || !subunitName || subunits.has(subunitId)) {
      continue;
    }

    subunits.set(subunitId, subunitName);
  }

  if (subunits.size === 0) {
    return "—";
  }

  return Array.from(subunits.values()).join(" + ");
}

/**
 * Transaction number dibuat oleh database.
 *
 * Frontend hanya melakukan normalisasi untuk display dan tidak pernah
 * membuat nomor transaksi sendiri.
 */
export function formatTransactionNumber(value: string | null | undefined): string {
  const normalized = value?.trim();

  return normalized || "—";
}

/**
 * Mengubah draft frontend menjadi argument create_sales_transaction RPC.
 *
 * Category dan Subunit sengaja TIDAK dikirim frontend karena ownership
 * canonical harus di-resolve oleh database melalui:
 *
 * Product -> Sales Category -> Business Subunit -> Outlet.
 */
export function buildCreateTransactionPayload(
  input: CreateSalesTransactionInput,
): CreateSalesTransactionRpcArgs {
  const transactionDate = normalizeTransactionDate(input.transactionDate);
  const items = normalizeTransactionItems(input.items);

  const outletId =
    input.outletId === null || input.outletId === undefined
      ? null
      : normalizeUuid(input.outletId, "Outlet ID");

  return {
    p_transaction_date: transactionDate,
    p_items: items,
    p_notes: normalizeNotes(input.notes, "Catatan transaksi"),
    p_entry_source: normalizeEntrySource(input.entrySource),
    p_outlet_id: outletId,
    ...normalizeVisitSelection(input.visit),
  };
}

/**
 * Mengubah draft frontend menjadi argument update_sales_transaction RPC.
 *
 * Transaction number dan Outlet tidak dapat diedit dari payload update.
 */
export function buildUpdateTransactionPayload(
  input: UpdateSalesTransactionInput,
): UpdateSalesTransactionRpcArgs {
  return {
    p_transaction_id: normalizeUuid(input.transactionId, "Transaction ID"),
    p_transaction_date: normalizeTransactionDate(input.transactionDate),
    p_items: normalizeTransactionItems(input.items),
    p_notes: normalizeNotes(input.notes, "Catatan transaksi"),
    ...normalizeVisitSelection(input.visit),
  };
}

function normalizeVisitSelection(
  selection: SalesVisitSelection = { mode: "none" },
): Pick<CreateSalesTransactionRpcArgs, "p_existing_visit_id" | "p_new_visit"> {
  if (selection.mode === "none") {
    return { p_existing_visit_id: null, p_new_visit: null };
  }

  if (selection.mode === "existing") {
    return {
      p_existing_visit_id: normalizeUuid(selection.existingVisitId, "Kunjungan"),
      p_new_visit: null,
    };
  }

  const { newVisit } = selection;
  if (!Number.isInteger(newVisit.adultCount) || newVisit.adultCount < 0) {
    throw new Error("Jumlah pengunjung dewasa harus berupa bilangan bulat minimal 0.");
  }
  if (!Number.isInteger(newVisit.childCount) || newVisit.childCount < 0) {
    throw new Error("Jumlah pengunjung anak harus berupa bilangan bulat minimal 0.");
  }
  if (newVisit.adultCount + newVisit.childCount < 1) {
    throw new Error("Jumlah pengunjung minimal satu orang.");
  }

  return {
    p_existing_visit_id: null,
    p_new_visit: {
      visitor_id: newVisit.visitorId
        ? normalizeUuid(newVisit.visitorId, "Pengunjung")
        : null,
      adult_count: newVisit.adultCount,
      child_count: newVisit.childCount,
      notes: normalizeNotes(newVisit.notes, "Catatan kunjungan"),
    },
  };
}

/**
 * Pembulatan monetary value dua angka desimal.
 */
export function roundSalesCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Pembulatan quantity untuk nilai agregat UI.
 */
export function roundSalesQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeTransactionItems(
  items: readonly SalesTransactionFormItem[],
): SalesTransactionRpcItem[] {
  if (items.length === 0) {
    throw new Error("Transaksi wajib memiliki minimal satu item.");
  }

  if (items.length > MAX_SALES_TRANSACTION_ITEMS) {
    throw new Error(`Satu transaksi maksimal memiliki ${MAX_SALES_TRANSACTION_ITEMS} baris item.`);
  }

  return items.map((item, index) => normalizeTransactionItem(item, index));
}

function normalizeTransactionItem(
  item: SalesTransactionFormItem,
  index: number,
): SalesTransactionRpcItem {
  const lineNumber = index + 1;

  const productId = normalizeUuid(item.productId, `Product ID baris ${lineNumber}`);

  assertFiniteNumber(item.quantity, `Jumlah pada baris ${lineNumber}`);

  if (item.quantity <= 0) {
    throw new Error(`Jumlah pada baris ${lineNumber} harus lebih dari 0.`);
  }

  if (item.quantity > MAX_SALES_TRANSACTION_QUANTITY) {
    throw new Error(`Jumlah pada baris ${lineNumber} terlalu besar.`);
  }

  assertFiniteNumber(item.unitPrice, `Harga satuan pada baris ${lineNumber}`);

  if (item.unitPrice < 0) {
    throw new Error(`Harga satuan pada baris ${lineNumber} tidak boleh negatif.`);
  }

  if (item.unitPrice > MAX_SALES_TRANSACTION_UNIT_PRICE) {
    throw new Error(`Harga satuan pada baris ${lineNumber} terlalu besar.`);
  }

  return {
    product_id: productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    notes: normalizeNotes(item.notes, `Catatan item pada baris ${lineNumber}`),
  };
}

function normalizeTransactionDate(value: string): string {
  const normalized = value.trim();

  if (!isValidIsoDate(normalized)) {
    throw new Error("Tanggal transaksi tidak valid.");
  }

  return normalized;
}

function normalizeEntrySource(value: SalesEntrySource | undefined): SalesEntrySource {
  const normalized = value ?? "manual";

  if (normalized !== "manual" && normalized !== "visitor") {
    throw new Error("Sumber transaksi tidak valid.");
  }

  return normalized;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalized = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} tidak valid.`);
  }

  return normalized;
}

function normalizeNotes(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_SALES_TRANSACTION_NOTES_LENGTH) {
    throw new Error(
      `${fieldName} maksimal ${MAX_SALES_TRANSACTION_NOTES_LENGTH} karakter.`,
    );
  }

  return normalized;
}

function assertFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} wajib berupa angka yang valid.`);
  }
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
