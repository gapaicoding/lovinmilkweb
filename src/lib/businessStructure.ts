export interface BusinessSubunitLike {
  id: string;
  outlet_id: string;
  code: string;
  name: string;
  description?: string | null;
  inventory_enabled: boolean;
  is_active: boolean;
  deleted_at?: string | null;
}

export function generateBusinessCode(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getActiveSubunits<T extends BusinessSubunitLike>(
  subunits: T[],
): T[] {
  return subunits.filter(
    (subunit) =>
      subunit.is_active === true &&
      (subunit.deleted_at === null ||
        subunit.deleted_at === undefined),
  );
}

export function sortSubunitsByName<T extends BusinessSubunitLike>(
  subunits: T[],
): T[] {
  return [...subunits].sort((left, right) =>
    left.name.localeCompare(right.name, "id-ID", {
      sensitivity: "base",
    }),
  );
}

export function getInventoryStatusLabel(enabled: boolean): string {
  return enabled ? "Aktif" : "Tidak Aktif";
}

export function getSubunitDisplayLabel(
  subunit: Pick<BusinessSubunitLike, "name"> | null | undefined,
): string {
  return subunit?.name?.trim() || "Subunit tidak tersedia";
}