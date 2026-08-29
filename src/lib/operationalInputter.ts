export type OperationalInputterSection = "sales" | "expenses";

export const operationalInputterQueryKey = (outletId: string | null, section: OperationalInputterSection) =>
  ["operational-inputter", outletId, section] as const;

export function normalizeOperationalInputter(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Nama penginput wajib diisi.");
  if (normalized.length > 100) throw new Error("Nama penginput maksimal 100 karakter.");
  return normalized;
}

export const displayOperationalInputter = (value: string | null | undefined) => value?.trim() || "—";
