export interface OperationalExpenseInput {
  expenseDate: string;
  amount: number;
  costCategoryId: string;
  notes?: string;
}

export function validateOperationalExpense(input: OperationalExpenseInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)) return "Tanggal wajib diisi.";
  if (!input.costCategoryId) return "Kategori biaya wajib dipilih.";
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return "Nominal harus lebih besar dari nol.";
  if ((input.notes?.length ?? 0) > 500) return "Catatan maksimal 500 karakter.";
  return null;
}

export function expenseScopeLabel(scope: string, subunitName?: string | null): string {
  return scope === "subunit"
    ? `Biaya langsung · ${subunitName ?? "Subunit"}`
    : "Biaya bersama Outlet";
}
