export interface AssetAccountingInput {
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  acquisitionDate: string;
}

export function validateAssetAccounting(input: AssetAccountingInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquisitionDate)) return "Tanggal perolehan tidak valid.";
  if (!Number.isFinite(input.acquisitionCost) || input.acquisitionCost < 0)
    return "Nilai perolehan tidak valid.";
  if (!Number.isFinite(input.residualValue) || input.residualValue < 0)
    return "Nilai residu tidak valid.";
  if (input.residualValue > input.acquisitionCost)
    return "Nilai residu tidak boleh melebihi nilai perolehan.";
  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths <= 0)
    return "Umur manfaat harus lebih dari 0 bulan.";
  return null;
}

export function depreciationPreview(input: AssetAccountingInput) {
  const base = roundMoney(Math.max(input.acquisitionCost - input.residualValue, 0));
  const monthly = input.usefulLifeMonths > 0 ? roundMoney(base / input.usefulLifeMonths) : 0;
  const finalPeriod = roundMoney(base - monthly * Math.max(input.usefulLifeMonths - 1, 0));
  return { base, monthly, finalPeriod };
}

export function bookValueAt(
  acquisitionCost: number,
  residualValue: number,
  entries: Array<{ period: string; amount: number }>,
  cutoff: string,
) {
  const accumulated = roundMoney(
    entries.filter((entry) => entry.period <= cutoff).reduce((sum, entry) => sum + entry.amount, 0),
  );
  return {
    accumulated,
    bookValue: roundMoney(Math.max(acquisitionCost - accumulated, residualValue)),
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
