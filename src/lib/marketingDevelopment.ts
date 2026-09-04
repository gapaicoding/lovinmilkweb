import { supabase } from "@/integrations/supabase/client";

export type RegistrationType = "PAID" | "UNPAID";
export interface MarketingMember {
  id?: string;
  member_name: string;
  phone_number: string;
  sort_order?: number;
}
export interface MarketingEvent {
  id?: string;
  event_name: string;
  registration_type: RegistrationType;
  third_party: string | null;
  external_participant_count: number;
  sort_order?: number;
}
export interface MarketingRecap {
  id: string;
  outlet_id: string;
  business_date: string;
  registered_membership_total: number | null;
  promo_claim_count: number;
  google_star_1_count: number;
  google_star_2_count: number;
  google_star_3_count: number;
  google_star_4_count: number;
  google_star_5_count: number;
  customer_engagement_count: number;
  inputter_name: string;
  inputter_session_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  marketing_daily_membership_entries: MarketingMember[];
  marketing_daily_events: MarketingEvent[];
}
export interface MarketingDraft {
  registeredMembershipTotal: number | null;
  promoClaimCount: number;
  stars: [number, number, number, number, number];
  customerEngagementCount: number;
  members: MarketingMember[];
  events: MarketingEvent[];
}
// Additive schema is accessed through a narrow adapter until the next remote-generated type refresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export const INDONESIAN_DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;
export function indonesianMarketingDay(dateOnly: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!m) return "—";
  return INDONESIAN_DAY_NAMES[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
}
export function calendarDates(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return [];
  const days = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, i) => `${m[1]}-${m[2]}-${String(i + 1).padStart(2, "0")}`,
  );
}
export function googleRating(stars: readonly number[]) {
  const total = stars.reduce((a, b) => a + b, 0),
    points = stars.reduce((a, b, i) => a + b * (i + 1), 0);
  return { total, average: total ? points / total : null };
}
export function membershipCount(members: readonly MarketingMember[]) {
  return members.length;
}
export function validateNonNegativeInteger(value: number, label = "Jumlah") {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} harus berupa bilangan bulat non-negatif.`);
  return value;
}
export function summarizeMarketing(rows: MarketingRecap[]) {
  const members = rows.reduce((n, r) => n + r.marketing_daily_membership_entries.length, 0),
    promo = rows.reduce((n, r) => n + r.promo_claim_count, 0),
    engagement = rows.reduce((n, r) => n + r.customer_engagement_count, 0),
    events = rows.flatMap((r) => r.marketing_daily_events),
    stars = [
      rows.reduce((n, r) => n + r.google_star_1_count, 0),
      rows.reduce((n, r) => n + r.google_star_2_count, 0),
      rows.reduce((n, r) => n + r.google_star_3_count, 0),
      rows.reduce((n, r) => n + r.google_star_4_count, 0),
      rows.reduce((n, r) => n + r.google_star_5_count, 0),
    ];
  const rating = googleRating(stars);
  const latest =
    [...rows]
      .filter((r) => r.registered_membership_total !== null)
      .sort((a, b) => b.business_date.localeCompare(a.business_date))[0]
      ?.registered_membership_total ?? null;
  return {
    members,
    promo,
    engagement,
    eventCount: events.length,
    participants: events.reduce((n, e) => n + e.external_participant_count, 0),
    stars,
    rating,
    latestRegisteredMembershipTotal: latest,
    savedDates: rows.length,
  };
}
export async function fetchMarketingRecaps(
  outletId: string,
  month: string,
): Promise<MarketingRecap[]> {
  const dates = calendarDates(month);
  if (!dates.length) return [];
  const { data, error } = await db
    .from("marketing_daily_recaps")
    .select("*,marketing_daily_membership_entries(*),marketing_daily_events(*)")
    .eq("outlet_id", outletId)
    .gte("business_date", dates[0])
    .lte("business_date", dates.at(-1))
    .order("business_date");
  if (error) throw error;
  return (data ?? []).map((r: MarketingRecap) => ({
    ...r,
    marketing_daily_membership_entries: [...(r.marketing_daily_membership_entries ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    ),
    marketing_daily_events: [...(r.marketing_daily_events ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    ),
  }));
}
export async function saveMarketingRecap(
  outletId: string,
  date: string,
  sessionId: string,
  draft: MarketingDraft,
) {
  [draft.promoClaimCount, draft.customerEngagementCount, ...draft.stars].forEach((v) =>
    validateNonNegativeInteger(v),
  );
  if (draft.registeredMembershipTotal !== null)
    validateNonNegativeInteger(draft.registeredMembershipTotal);
  draft.events.forEach((e) => validateNonNegativeInteger(e.external_participant_count, "Peserta"));
  const { data, error } = await db.rpc("save_marketing_daily_recap_v1", {
    p_business_date: date,
    p_registered_membership_total: draft.registeredMembershipTotal,
    p_promo_claim_count: draft.promoClaimCount,
    p_google_star_1_count: draft.stars[0],
    p_google_star_2_count: draft.stars[1],
    p_google_star_3_count: draft.stars[2],
    p_google_star_4_count: draft.stars[3],
    p_google_star_5_count: draft.stars[4],
    p_customer_engagement_count: draft.customerEngagementCount,
    p_membership_entries: draft.members.map(({ member_name, phone_number }) => ({
      member_name: member_name.trim(),
      phone_number: phone_number.trim(),
    })),
    p_events: draft.events.map(
      ({ event_name, registration_type, third_party, external_participant_count }) => ({
        event_name: event_name.trim(),
        registration_type,
        third_party: third_party?.trim() || null,
        external_participant_count,
      }),
    ),
    p_inputter_session_id: sessionId,
    p_outlet_id: outletId,
  });
  if (error) throw error;
  return data as string;
}
