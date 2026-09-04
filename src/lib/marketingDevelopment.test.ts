import { describe, expect, it } from "vitest";
import {
  calendarDates,
  googleRating,
  indonesianMarketingDay,
  membershipCount,
  summarizeMarketing,
  validateNonNegativeInteger,
  type MarketingRecap,
} from "./marketingDevelopment";
const recap = (overrides: Partial<MarketingRecap> = {}): MarketingRecap => ({
  id: "r",
  outlet_id: "o",
  business_date: "2026-08-01",
  registered_membership_total: 100,
  promo_claim_count: 2,
  google_star_1_count: 0,
  google_star_2_count: 0,
  google_star_3_count: 0,
  google_star_4_count: 1,
  google_star_5_count: 2,
  customer_engagement_count: 3,
  inputter_name: "Ani",
  inputter_session_id: "s",
  created_at: "",
  created_by: "u",
  updated_at: "",
  updated_by: "u",
  marketing_daily_membership_entries: [],
  marketing_daily_events: [],
  ...overrides,
});
describe("marketing development domain", () => {
  it("uses Indonesian weekdays without local timezone drift", () => {
    expect(indonesianMarketingDay("2026-08-01")).toBe("Sabtu");
    expect(indonesianMarketingDay("2026-08-02")).toBe("Minggu");
    expect(indonesianMarketingDay("2026-08-03")).toBe("Senin");
  });
  it("renders every calendar day for sparse months", () => {
    expect(calendarDates("2026-08")).toHaveLength(31);
    expect(calendarDates("2026-02")).toHaveLength(28);
  });
  it("derives membership counts from detail rows", () => {
    expect(membershipCount([])).toBe(0);
    expect(membershipCount([{ member_name: "A", phone_number: "081" }])).toBe(1);
    expect(
      membershipCount(
        Array.from({ length: 3 }, (_, i) => ({ member_name: `M${i}`, phone_number: `08${i}` })),
      ),
    ).toBe(3);
  });
  it("keeps phone numbers as text and snapshot independent", () => {
    const row = recap({
      registered_membership_total: 99,
      marketing_daily_membership_entries: [{ member_name: "A", phone_number: "081234" }],
    });
    expect(row.marketing_daily_membership_entries[0].phone_number).toBe("081234");
    expect(summarizeMarketing([row]).members).toBe(1);
    expect(summarizeMarketing([row]).latestRegisteredMembershipTotal).toBe(99);
  });
  it("derives Google totals and weighted average", () => {
    expect(googleRating([0, 0, 0, 0, 0])).toEqual({ total: 0, average: null });
    expect(googleRating([0, 0, 0, 1, 2])).toEqual({ total: 3, average: 14 / 3 });
  });
  it("sums manual promo, engagement and multiple events", () => {
    const s = summarizeMarketing([
      recap({
        marketing_daily_events: [
          {
            event_name: "A",
            registration_type: "PAID",
            third_party: null,
            external_participant_count: 2,
          },
          {
            event_name: "B",
            registration_type: "UNPAID",
            third_party: "Mitra",
            external_participant_count: 4,
          },
        ],
      }),
    ]);
    expect(s.promo).toBe(2);
    expect(s.engagement).toBe(3);
    expect(s.eventCount).toBe(2);
    expect(s.participants).toBe(6);
  });
  it("rejects negative and fractional counts", () => {
    expect(() => validateNonNegativeInteger(-1)).toThrow();
    expect(() => validateNonNegativeInteger(1.5)).toThrow();
    expect(validateNonNegativeInteger(0)).toBe(0);
  });
});
