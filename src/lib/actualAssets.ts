export type CapitalizationStatus = "capitalized" | "tracking_only_expensed";
export type AssetStatus = "active" | "under_repair" | "fully_depreciated" | "disposed" | "lost";

export interface DepreciableAsset {
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  capitalizationStatus: CapitalizationStatus;
  depreciationStartDate?: string | null;
}

export interface DepreciationScheduleRow {
  periodMonth: string;
  depreciationAmount: number;
  accumulatedDepreciation: number;
  endingBookValue: number;
}

export interface FilterableAsset {
  assetName: string;
  assetCode: string;
  brand?: string | null;
  categoryId: string;
  assetStatus: AssetStatus;
  capitalizationStatus: CapitalizationStatus;
  acquisitionDate: string;
  deletedAt?: string | null;
}

export interface AssetFilterValue {
  query?: string;
  categoryId?: string;
  status?: AssetStatus | "all";
  capitalization?: CapitalizationStatus | "all";
  from?: string;
  to?: string;
  deleted?: "active" | "deleted" | "all";
}

export const DEFAULT_CAPITALIZATION_THRESHOLD = 1_000_000;

export function calculateMonthlyDepreciation(asset: DepreciableAsset): number {
  if (
    asset.capitalizationStatus !== "capitalized" ||
    !Number.isFinite(asset.usefulLifeMonths) ||
    asset.usefulLifeMonths <= 0
  ) {
    return 0;
  }

  const depreciableAmount = Math.max(asset.acquisitionCost - asset.residualValue, 0);
  return roundCurrency(depreciableAmount / asset.usefulLifeMonths);
}

export function buildStraightLineSchedule(asset: DepreciableAsset): DepreciationScheduleRow[] {
  if (asset.capitalizationStatus !== "capitalized" || asset.usefulLifeMonths <= 0) {
    return [];
  }

  const start = parseMonthStart(asset.depreciationStartDate || asset.acquisitionDate);

  if (!start) {
    return [];
  }

  const totalDepreciable = Math.max(asset.acquisitionCost - asset.residualValue, 0);
  const monthly = calculateMonthlyDepreciation(asset);
  const rows: DepreciationScheduleRow[] = [];
  let accumulated = 0;

  for (let index = 0; index < asset.usefulLifeMonths; index += 1) {
    const isLast = index === asset.usefulLifeMonths - 1;
    const remaining = roundCurrency(totalDepreciable - accumulated);
    const amount = isLast ? remaining : Math.min(monthly, remaining);
    accumulated = roundCurrency(accumulated + amount);

    rows.push({
      periodMonth: addMonths(start, index),
      depreciationAmount: amount,
      accumulatedDepreciation: accumulated,
      endingBookValue: roundCurrency(
        Math.max(asset.acquisitionCost - accumulated, asset.residualValue),
      ),
    });
  }

  return rows;
}

export function matchesAssetFilters(asset: FilterableAsset, filters: AssetFilterValue): boolean {
  const query = filters.query?.trim().toLocaleLowerCase("id-ID") ?? "";
  const haystack = [asset.assetCode, asset.assetName, asset.brand ?? ""]
    .join(" ")
    .toLocaleLowerCase("id-ID");

  if (query && !haystack.includes(query)) {
    return false;
  }

  if (
    filters.categoryId &&
    filters.categoryId !== "all" &&
    asset.categoryId !== filters.categoryId
  ) {
    return false;
  }

  if (filters.status && filters.status !== "all" && asset.assetStatus !== filters.status) {
    return false;
  }

  if (
    filters.capitalization &&
    filters.capitalization !== "all" &&
    asset.capitalizationStatus !== filters.capitalization
  ) {
    return false;
  }

  if (filters.from && asset.acquisitionDate < filters.from) {
    return false;
  }

  if (filters.to && asset.acquisitionDate > filters.to) {
    return false;
  }

  const deletedFilter = filters.deleted ?? "active";

  if (deletedFilter === "active" && asset.deletedAt) {
    return false;
  }

  if (deletedFilter === "deleted" && !asset.deletedAt) {
    return false;
  }

  return true;
}

function parseMonthStart(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function addMonths(monthStart: string, offset: number): string {
  const [yearText, monthText] = monthStart.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return date.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
