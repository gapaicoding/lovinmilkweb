import { supabase } from "@/integrations/supabase/client";

export interface QueryErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryErrorLike | null;
  count?: number | null;
}

export interface ActualQuery<T = Record<string, unknown>> extends PromiseLike<QueryResult<T[]>> {
  select(
    columns?: string,
    options?: {
      count?: "exact";
      head?: boolean;
    },
  ): ActualQuery<T>;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): ActualQuery<T>;
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: {
      onConflict?: string;
      ignoreDuplicates?: boolean;
    },
  ): ActualQuery<T>;
  update(values: Record<string, unknown>): ActualQuery<T>;
  delete(options?: { count?: "exact" }): ActualQuery<T>;
  eq(column: string, value: unknown): ActualQuery<T>;
  neq(column: string, value: unknown): ActualQuery<T>;
  is(column: string, value: null): ActualQuery<T>;
  in(column: string, values: readonly unknown[]): ActualQuery<T>;
  gte(column: string, value: unknown): ActualQuery<T>;
  lte(column: string, value: unknown): ActualQuery<T>;
  lt(column: string, value: unknown): ActualQuery<T>;
  or(filters: string): ActualQuery<T>;
  ilike(column: string, pattern: string): ActualQuery<T>;
  order(
    column: string,
    options?: {
      ascending?: boolean;
      referencedTable?: string;
    },
  ): ActualQuery<T>;
  range(from: number, to: number): ActualQuery<T>;
  limit(count: number): ActualQuery<T>;
  single(): PromiseLike<QueryResult<T>>;
  maybeSingle(): PromiseLike<QueryResult<T>>;
}

interface ActualClient {
  from<T = Record<string, unknown>>(table: string): ActualQuery<T>;
}

/**
 * Tipe database akan diregenerasi setelah migration diterapkan. Adapter ini
 * menjaga modul actual tetap type-safe tanpa menambahkan tabel sementara ke
 * types.ts yang dihasilkan Supabase.
 */
export const actualClient = supabase as unknown as ActualClient;

export function getActualDataErrorMessage(
  error: unknown,
  fallback = "Data belum dapat diproses. Periksa koneksi lalu coba lagi.",
): string {
  const candidate = typeof error === "object" && error !== null ? (error as QueryErrorLike) : null;
  const message = candidate?.message?.trim();

  if (candidate?.code === "42501" || message?.toLocaleLowerCase("id-ID").includes("permission")) {
    return "Aksi ditolak oleh kebijakan akses database untuk peran Anda.";
  }

  if (candidate?.code === "23503") {
    return "Data masih digunakan oleh catatan lain sehingga tidak aman dihapus permanen.";
  }

  if (candidate?.code === "23505") {
    return "Kode atau nama tersebut sudah digunakan.";
  }

  if (candidate?.code === "23514") {
    return "Nilai yang dimasukkan tidak memenuhi aturan data.";
  }

  return message || fallback;
}

export function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

export function manualSourceKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function toNullableText(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function parseIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return value;
}

export function parsePositivePage(value: unknown): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
