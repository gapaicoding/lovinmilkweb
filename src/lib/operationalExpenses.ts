export const FINAL_EXPENSE_CATEGORIES = [
  "Bahan Makanan/Minuman",
  "Bahan Non Makan/Minum",
  "Gas untuk Masak",
  "Perlengkapan",
  "Transport",
  "Administrasi",
  "Listrik",
] as const;

export interface OperationalExpenseInput {
  expenseDate: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  costCategoryId: string;
  receiptReference?: string;
  vendorName?: string;
  notes?: string;
}

export function validateOperationalExpense(input: OperationalExpenseInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)) return "Tanggal wajib diisi.";
  if (!input.itemName.trim()) return "Nama barang wajib diisi.";
  if (input.itemName.trim().length > 200) return "Nama barang maksimal 200 karakter.";
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return "Jumlah harus lebih dari 0.";
  if (!input.unit.trim()) return "Satuan ukuran wajib diisi.";
  if (input.unit.trim().length > 50) return "Satuan ukuran maksimal 50 karakter.";
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) return "Harga satuan tidak valid.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Harga total harus lebih dari 0.";
  if (!input.costCategoryId) return "Kategori pengeluaran tidak valid.";
  if ((input.receiptReference?.trim().length ?? 0) > 100) return "Nota maksimal 100 karakter.";
  if ((input.vendorName?.trim().length ?? 0) > 150) return "Nama toko maksimal 150 karakter.";
  if ((input.notes?.trim().length ?? 0) > 500) return "Catatan maksimal 500 karakter.";
  return null;
}

export function suggestedExpenseAmount(quantity: number, unitPrice: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  return Math.round(quantity * unitPrice * 100) / 100;
}
