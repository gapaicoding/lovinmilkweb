import type { Json } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/permissions";

export const VISITOR_ARRIVAL_SLOTS = Array.from({ length: 30 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}) as readonly string[];

export const MAX_VISITOR_RECAP_BATCH = 100;

export interface VisitorRecapEntryInput { arrival_time: string; adult_count: number; child_count: number; notes: string | null }
export interface VisitorRecapEntry extends VisitorRecapEntryInput { id: string; check_in_at: string; created_at: string; updated_at: string }
export interface VisitorDailyRecap { id: string; outlet_id: string; business_date: string; recorder_name: string; entries: VisitorRecapEntry[] }
export interface VisitorRecapPeriodRow { business_date: string; recorder_name: string | null; arrival_time: string | null; adult_count: number; child_count: number }
export interface VisitorHourlySlot { arrival_time: string; adult_count: number; child_count: number; total_visitors: number }

export function aggregateVisitorRecapBySlot(
  entries: ReadonlyArray<Pick<VisitorRecapEntryInput, "arrival_time" | "adult_count" | "child_count">>,
): VisitorHourlySlot[] {
  const totals = new Map(VISITOR_ARRIVAL_SLOTS.map((arrival_time) => [arrival_time, { adult_count: 0, child_count: 0 }]));

  for (const entry of entries) {
    const slot = totals.get(entry.arrival_time);
    if (!slot) continue;
    slot.adult_count += entry.adult_count;
    slot.child_count += entry.child_count;
  }

  return VISITOR_ARRIVAL_SLOTS.map((arrival_time) => {
    const slot = totals.get(arrival_time)!;
    return { arrival_time, ...slot, total_visitors: slot.adult_count + slot.child_count };
  });
}

export function canArchiveVisitorRecapEntry(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function validateVisitorRecapEntries(entries: VisitorRecapEntryInput[]): string | null {
  if (!entries.length) return "Tambahkan minimal satu baris kedatangan.";
  if (entries.length > MAX_VISITOR_RECAP_BATCH) return `Maksimal ${MAX_VISITOR_RECAP_BATCH} baris dapat disimpan sekaligus.`;
  for (const entry of entries) {
    if (!VISITOR_ARRIVAL_SLOTS.includes(entry.arrival_time)) return "Jam kedatangan tidak valid.";
    if (!Number.isInteger(entry.adult_count) || entry.adult_count < 0 || !Number.isInteger(entry.child_count) || entry.child_count < 0) return "Jumlah dewasa dan anak harus berupa bilangan bulat minimal 0.";
    if (entry.adult_count + entry.child_count < 1) return "Jumlah pengunjung minimal satu orang.";
    if ((entry.notes ?? "").length > 500) return "Catatan maksimal 500 karakter.";
  }
  return null;
}

export function parseDailyRecap(value: Json | null): VisitorDailyRecap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Json>;
  if (typeof row.id !== "string") return null;
  const entries = Array.isArray(row.entries) ? row.entries : [];
  return {
    id: row.id, outlet_id: String(row.outlet_id), business_date: String(row.business_date), recorder_name: String(row.recorder_name),
    entries: entries.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const item = value as Record<string, Json>;
      return [{ id: String(item.id), arrival_time: String(item.arrival_time), adult_count: Number(item.adult_count), child_count: Number(item.child_count), notes: typeof item.notes === "string" ? item.notes : null, check_in_at: String(item.check_in_at), created_at: String(item.created_at), updated_at: String(item.updated_at) }];
    }),
  };
}
