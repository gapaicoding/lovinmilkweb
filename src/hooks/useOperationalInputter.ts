import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  clearOperationalInputterSession,
  normalizeOperationalInputter,
  operationalInputterQueryKey,
  readOperationalInputterSession,
  writeOperationalInputterSession,
  type OperationalInputterSection,
  type OperationalInputterSession,
} from "@/lib/operationalInputter";

type SessionRpcRow = {
  session_id: string;
  outlet_id: string;
  section: string;
  inputter_name: string;
  started_at: string;
};
const rpc = supabase as unknown as {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: SessionRpcRow[] | null; error: { message: string } | null }>;
};

export function useOperationalInputter(
  outletId: string | null,
  section: OperationalInputterSection,
) {
  const client = useQueryClient(),
    { user } = useAuth(),
    actorId = user?.id ?? null,
    queryKey = operationalInputterQueryKey(outletId, section);
  const query = useQuery({
    queryKey: [...queryKey, actorId],
    enabled: Boolean(outletId && actorId),
    queryFn: async (): Promise<OperationalInputterSession | null> => {
      const stored = readOperationalInputterSession(sessionStorage, outletId!, section, actorId!);
      if (!stored) return null;
      const { data, error } = await rpc.rpc("validate_operational_inputter_session", {
        p_session_id: stored.sessionId,
        p_section: section,
        p_outlet_id: outletId!,
      });
      if (error || !data?.[0]) {
        clearOperationalInputterSession(sessionStorage, outletId!, section);
        return null;
      }
      return stored;
    },
  });
  const mutation = useMutation({
    mutationFn: async (value: string) => {
      if (!outletId || !actorId) throw new Error("Sesi pengguna atau Outlet tidak tersedia.");
      const { data, error } = await rpc.rpc("start_operational_inputter_session", {
        p_section: section,
        p_inputter_name: normalizeOperationalInputter(value),
        p_outlet_id: outletId,
      });
      if (error || !data?.[0]) throw new Error(error?.message ?? "Sesi penginput gagal dibuat.");
      const row = data[0],
        session: OperationalInputterSession = {
          sessionId: row.session_id,
          outletId: row.outlet_id,
          section,
          inputterName: row.inputter_name,
          startedAt: row.started_at,
          actorId,
        };
      writeOperationalInputterSession(sessionStorage, session);
      return session;
    },
    onSuccess: (session) => client.setQueryData([...queryKey, actorId], session),
  });
  const ensureValidSession = async () => {
    const refreshed = await query.refetch();
    if (!refreshed.data) throw new Error("Atur nama penginput terlebih dahulu.");
    return refreshed.data;
  };
  return {
    session: query.data ?? null,
    sessionId: query.data?.sessionId ?? null,
    name: query.data?.inputterName ?? null,
    query,
    mutation,
    ensureValidSession,
  };
}
