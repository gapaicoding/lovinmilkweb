export type OperationalInputterSection =
  "sales" | "expenses" | "suppliers" | "visitors" | "interviews" | "marketing";
export interface OperationalInputterSession {
  sessionId: string;
  outletId: string;
  section: OperationalInputterSection;
  inputterName: string;
  startedAt: string;
  actorId: string;
}
export const OPERATIONAL_INPUTTER_STORAGE_PREFIX = "lovinmilk.operationalInputterSession.v3";
export const operationalInputterQueryKey = (
  outletId: string | null,
  section: OperationalInputterSection,
) => ["operational-inputter-session", outletId, section] as const;
export function normalizeOperationalInputter(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Nama penginput wajib diisi.");
  if (normalized.length > 100) throw new Error("Nama penginput maksimal 100 karakter.");
  return normalized;
}
export const operationalInputterStorageKey = (
  outletId: string,
  section: OperationalInputterSection,
) => `${OPERATIONAL_INPUTTER_STORAGE_PREFIX}.${outletId}.${section}`;
export function readOperationalInputterSession(
  storage: Pick<Storage, "getItem" | "removeItem">,
  outletId: string,
  section: OperationalInputterSection,
  actorId: string,
): OperationalInputterSession | null {
  const key = operationalInputterStorageKey(outletId, section),
    raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OperationalInputterSession>;
    if (
      typeof value.sessionId !== "string" ||
      value.outletId !== outletId ||
      value.section !== section ||
      typeof value.inputterName !== "string" ||
      typeof value.startedAt !== "string" ||
      value.actorId !== actorId
    )
      throw new Error();
    return value as OperationalInputterSession;
  } catch {
    storage.removeItem(key);
    return null;
  }
}
export function writeOperationalInputterSession(
  storage: Pick<Storage, "setItem">,
  session: OperationalInputterSession,
): void {
  storage.setItem(
    operationalInputterStorageKey(session.outletId, session.section),
    JSON.stringify(session),
  );
}
export function clearOperationalInputterSession(
  storage: Pick<Storage, "removeItem">,
  outletId: string,
  section: OperationalInputterSection,
): void {
  storage.removeItem(operationalInputterStorageKey(outletId, section));
}
export const displayOperationalInputter = (value: string | null | undefined) =>
  value?.trim() || "—";
