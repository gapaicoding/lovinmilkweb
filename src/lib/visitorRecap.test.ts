import { describe, expect, it } from "vitest";
import { MAX_VISITOR_RECAP_BATCH, VISITOR_ARRIVAL_SLOTS, canArchiveVisitorRecapEntry, validateVisitorRecapEntries } from "./visitorRecap";

describe("visitor recap slots", () => {
  it("contains exactly the 30 half-hour arrival slots", () => {
    expect(VISITOR_ARRIVAL_SLOTS).toHaveLength(30);
    expect(VISITOR_ARRIVAL_SLOTS[0]).toBe("07:00");
    expect(VISITOR_ARRIVAL_SLOTS.at(-1)).toBe("21:30");
    expect(VISITOR_ARRIVAL_SLOTS).not.toContain("22:00");
  });
  it.each(["06:30", "22:00", "08:15", "foo"])("rejects %s", (arrival_time) => {
    expect(validateVisitorRecapEntries([{ arrival_time, adult_count: 1, child_count: 0, notes: null }])).toBe("Jam kedatangan tidak valid.");
  });
  it("validates people and batch size", () => {
    expect(validateVisitorRecapEntries([{ arrival_time: "07:00", adult_count: 0, child_count: 0, notes: null }])).toContain("minimal satu");
    expect(validateVisitorRecapEntries(Array.from({ length: MAX_VISITOR_RECAP_BATCH + 1 }, () => ({ arrival_time: "07:00", adult_count: 1, child_count: 0, notes: null })))).toContain("Maksimal");
  });
  it("matches archive visibility to the backend role rule", () => {
    expect(canArchiveVisitorRecapEntry("staff")).toBe(false);
    expect(canArchiveVisitorRecapEntry("admin")).toBe(true);
    expect(canArchiveVisitorRecapEntry("super_admin")).toBe(true);
  });
  it("validates corrected entry counts and changed slots", () => {
    expect(validateVisitorRecapEntries([{ arrival_time: "13:30", adult_count: 2, child_count: 1, notes: "koreksi" }])).toBeNull();
    expect(validateVisitorRecapEntries([{ arrival_time: "13:30", adult_count: -1, child_count: 2, notes: null }])).toContain("bilangan bulat");
  });
});
