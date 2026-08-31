import { describe, expect, it } from "vitest";
import {
  clearOperationalInputterSession,
  displayOperationalInputter,
  normalizeOperationalInputter,
  operationalInputterQueryKey,
  operationalInputterStorageKey,
  readOperationalInputterSession,
  writeOperationalInputterSession,
  type OperationalInputterSession,
} from "@/lib/operationalInputter";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}
const session: OperationalInputterSession = {
  sessionId: "session-a",
  outletId: "outlet-a",
  section: "sales",
  inputterName: "Keisyah",
  startedAt: "2026-08-31T09:20:00Z",
  actorId: "actor-a",
};

describe("operational inputter browser sessions", () => {
  it("retains name validation and historical display behavior", () => {
    expect(normalizeOperationalInputter(" Budi ")).toBe("Budi");
    expect(() => normalizeOperationalInputter("   ")).toThrow("wajib");
    expect(() => normalizeOperationalInputter("a".repeat(101))).toThrow("100");
    expect(displayOperationalInputter(null)).toBe("—");
  });
  it("includes visitors in independent section state", () => {
    expect(operationalInputterQueryKey("outlet-a", "visitors")).not.toEqual(
      operationalInputterQueryKey("outlet-a", "sales"),
    );
  });
  it("starts empty and persists only in the supplied session storage", () => {
    const storage = memoryStorage();
    expect(readOperationalInputterSession(storage, "outlet-a", "sales", "actor-a")).toBeNull();
    writeOperationalInputterSession(storage, session);
    expect(readOperationalInputterSession(storage, "outlet-a", "sales", "actor-a")).toEqual(
      session,
    );
  });
  it("keeps outlets and sections independent", () => {
    const storage = memoryStorage();
    writeOperationalInputterSession(storage, session);
    expect(readOperationalInputterSession(storage, "outlet-b", "sales", "actor-a")).toBeNull();
    expect(readOperationalInputterSession(storage, "outlet-a", "expenses", "actor-a")).toBeNull();
  });
  it("clears a session inherited by another authenticated actor", () => {
    const storage = memoryStorage();
    writeOperationalInputterSession(storage, session);
    expect(readOperationalInputterSession(storage, "outlet-a", "sales", "actor-b")).toBeNull();
    expect(storage.values.has(operationalInputterStorageKey("outlet-a", "sales"))).toBe(false);
  });
  it("replaces and clears the current section session", () => {
    const storage = memoryStorage();
    writeOperationalInputterSession(storage, session);
    writeOperationalInputterSession(storage, {
      ...session,
      sessionId: "session-b",
      inputterName: "Rina",
    });
    expect(
      readOperationalInputterSession(storage, "outlet-a", "sales", "actor-a")?.inputterName,
    ).toBe("Rina");
    clearOperationalInputterSession(storage, "outlet-a", "sales");
    expect(readOperationalInputterSession(storage, "outlet-a", "sales", "actor-a")).toBeNull();
  });
});
