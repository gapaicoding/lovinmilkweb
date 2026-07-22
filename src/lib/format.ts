import {
  format,
  isValid,
  parseISO,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";

type NumericValue =
  | number
  | string
  | null
  | undefined;

type DateValue =
  | string
  | Date
  | null
  | undefined;

interface PercentageOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  showSign?: boolean;
}

interface CompactRupiahOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * Mengubah number/string menjadi angka valid.
 * Nilai invalid akan dikembalikan sebagai fallback.
 */
export function toNumber(
  value: NumericValue,
  fallback = 0,
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : fallback;
}

/**
 * Format mata uang Rupiah penuh.
 *
 * Contoh:
 * 58153000 -> Rp58.153.000
 */
export function formatRupiah(
  value: NumericValue,
): string {
  const numericValue = toNumber(value);

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numericValue);
}

/**
 * Format Rupiah ringkas untuk KPI atau sumbu grafik.
 *
 * Contoh:
 * 850         -> Rp850
 * 12500       -> Rp12,5 rb
 * 58153000    -> Rp58,2 jt
 * 1500000000  -> Rp1,5 M
 */
export function formatCompactRupiah(
  value: NumericValue,
  options: CompactRupiahOptions = {},
): string {
  const numericValue = toNumber(value);
  const absoluteValue = Math.abs(numericValue);

  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 1,
  } = options;

  const formatCompactNumber = (
    divisor: number,
    suffix: string,
  ) => {
    const formatted = new Intl.NumberFormat(
      "id-ID",
      {
        minimumFractionDigits,
        maximumFractionDigits,
      },
    ).format(numericValue / divisor);

    return `Rp${formatted} ${suffix}`;
  };

  if (absoluteValue >= 1_000_000_000_000) {
    return formatCompactNumber(
      1_000_000_000_000,
      "T",
    );
  }

  if (absoluteValue >= 1_000_000_000) {
    return formatCompactNumber(
      1_000_000_000,
      "M",
    );
  }

  if (absoluteValue >= 1_000_000) {
    return formatCompactNumber(
      1_000_000,
      "jt",
    );
  }

  if (absoluteValue >= 1_000) {
    return formatCompactNumber(
      1_000,
      "rb",
    );
  }

  return formatRupiah(numericValue);
}

/**
 * Format angka biasa dengan pemisah ribuan Indonesia.
 *
 * Contoh:
 * 12500 -> 12.500
 */
export function formatNumber(
  value: NumericValue,
  maximumFractionDigits = 0,
): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(toNumber(value));
}

/**
 * Format persentase dari nilai yang sudah berbentuk persen.
 *
 * Contoh:
 * 74.123 -> 74,1%
 * -5.25  -> -5,3%
 */
export function formatPercentage(
  value: NumericValue,
  options: PercentageOptions = {},
): string {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 1,
    showSign = false,
  } = options;

  const numericValue = toNumber(value);

  const formatted = new Intl.NumberFormat(
    "id-ID",
    {
      minimumFractionDigits,
      maximumFractionDigits,
    },
  ).format(Math.abs(numericValue));

  if (!showSign) {
    return `${numericValue < 0 ? "-" : ""}${formatted}%`;
  }

  if (numericValue > 0) {
    return `+${formatted}%`;
  }

  if (numericValue < 0) {
    return `-${formatted}%`;
  }

  return `${formatted}%`;
}

/**
 * Formatter khusus pertumbuhan.
 *
 * Contoh:
 * 12.5  -> +12,5%
 * -8.4  -> -8,4%
 * 0     -> 0%
 */
export function formatGrowth(
  value: NumericValue,
  maximumFractionDigits = 1,
): string {
  return formatPercentage(value, {
    maximumFractionDigits,
    showSign: true,
  });
}

/**
 * Menghitung persentase pertumbuhan.
 *
 * Aturan:
 * - previous > 0: hitung pertumbuhan normal;
 * - previous = 0 dan current > 0: hasil 100%;
 * - keduanya 0: hasil 0%;
 */
export function calculateGrowth(
  currentValue: NumericValue,
  previousValue: NumericValue,
): number {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);

  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return (
    ((current - previous) / Math.abs(previous)) *
    100
  );
}

/**
 * Menghitung persentase kontribusi.
 */
export function calculatePercentage(
  value: NumericValue,
  total: NumericValue,
): number {
  const numericValue = toNumber(value);
  const numericTotal = toNumber(total);

  if (numericTotal === 0) {
    return 0;
  }

  return (
    (numericValue / numericTotal) *
    100
  );
}

/**
 * Menghitung profit margin.
 *
 * Rumus:
 * profit / sales × 100
 */
export function calculateProfitMargin(
  sales: NumericValue,
  profit: NumericValue,
): number {
  const numericSales = toNumber(sales);
  const numericProfit = toNumber(profit);

  if (numericSales === 0) {
    return 0;
  }

  return (
    (numericProfit / numericSales) *
    100
  );
}

/**
 * Format tanggal lokal Indonesia.
 *
 * Contoh:
 * 2026-07-22 -> 22 Jul 2026
 */
export function formatDate(
  input: DateValue,
  pattern = "dd MMM yyyy",
): string {
  const date = parseDateValue(input);

  if (!date) {
    return "-";
  }

  return format(date, pattern, {
    locale: idLocale,
  });
}

/**
 * Format tanggal dan waktu.
 *
 * Contoh:
 * 22 Jul 2026, 18:30
 */
export function formatDateTime(
  input: DateValue,
): string {
  return formatDate(
    input,
    "dd MMM yyyy, HH:mm",
  );
}

/**
 * Format tanggal lengkap.
 *
 * Contoh:
 * Rabu, 22 Juli 2026
 */
export function formatLongDate(
  input: DateValue,
): string {
  return formatDate(
    input,
    "EEEE, dd MMMM yyyy",
  );
}

/**
 * Format bulan dan tahun.
 *
 * Contoh:
 * Juli 2026
 */
export function formatMonthYear(
  input: DateValue,
): string {
  return formatDate(input, "MMMM yyyy");
}

/**
 * Format rentang tanggal.
 *
 * Contoh:
 * 01 Jul 2026 – 22 Jul 2026
 */
export function formatDateRange(
  from: DateValue,
  to: DateValue,
): string {
  const fromDate = parseDateValue(from);
  const toDate = parseDateValue(to);

  if (!fromDate || !toDate) {
    return "-";
  }

  const sameYear =
    fromDate.getFullYear() ===
    toDate.getFullYear();

  const sameMonth =
    sameYear &&
    fromDate.getMonth() ===
      toDate.getMonth();

  if (sameMonth) {
    return `${formatDate(
      fromDate,
      "dd",
    )}–${formatDate(
      toDate,
      "dd MMM yyyy",
    )}`;
  }

  if (sameYear) {
    return `${formatDate(
      fromDate,
      "dd MMM",
    )} – ${formatDate(
      toDate,
      "dd MMM yyyy",
    )}`;
  }

  return `${formatDate(
    fromDate,
  )} – ${formatDate(toDate)}`;
}

/**
 * Mengubah Date menjadi YYYY-MM-DD menggunakan waktu lokal.
 */
export function toDateInput(
  date: Date,
): string {
  if (!isValid(date)) {
    return "";
  }

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Mengubah input YYYY-MM-DD menjadi Date lokal.
 *
 * Tidak memakai new Date("YYYY-MM-DD") untuk menghindari
 * pergeseran tanggal akibat UTC.
 */
export function parseDateInput(
  value: string,
): Date | null {
  const parts = value.split("-");

  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(
    year,
    month - 1,
    day,
  );

  const hasMatchingValues =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return hasMatchingValues
    ? date
    : null;
}

/**
 * Mengambil angka dari input mata uang.
 *
 * Contoh:
 * "Rp 1.250.000" -> 1250000
 */
export function parseCurrencyInput(
  value: string,
): number {
  const cleaned = value.replace(
    /[^\d]/g,
    "",
  );

  return cleaned
    ? Number(cleaned)
    : 0;
}

/**
 * Format angka untuk CurrencyInput.
 *
 * Contoh:
 * 1250000 -> 1.250.000
 */
export function formatCurrencyInput(
  value: number | string,
): string {
  const numericValue =
    typeof value === "string"
      ? parseCurrencyInput(value)
      : toNumber(value);

  if (numericValue === 0) {
    return "";
  }

  return new Intl.NumberFormat(
    "id-ID",
    {
      maximumFractionDigits: 0,
    },
  ).format(numericValue);
}

/**
 * Memotong teks panjang untuk card atau tabel.
 */
export function truncateText(
  value: string | null | undefined,
  maximumLength = 60,
): string {
  const normalizedValue =
    value?.trim() ?? "";

  if (
    normalizedValue.length <=
    maximumLength
  ) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(
    0,
    Math.max(0, maximumLength - 1),
  )}…`;
}

function parseDateValue(
  input: DateValue,
): Date | null {
  if (!input) {
    return null;
  }

  const date =
    typeof input === "string"
      ? parseISO(input)
      : input;

  return isValid(date)
    ? date
    : null;
}