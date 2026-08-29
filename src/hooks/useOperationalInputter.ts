import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOperationalInputter, operationalInputterQueryKey, type OperationalInputterSection } from "@/lib/operationalInputter";

export function useOperationalInputter(outletId: string | null, section: OperationalInputterSection) {
  const client = useQueryClient();
  const queryKey = operationalInputterQueryKey(outletId, section);
  const query = useQuery({
    queryKey,
    enabled: Boolean(outletId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_operational_inputter", { p_section: section, p_outlet_id: outletId! });
      if (error) throw error;
      return data?.[0]?.inputter_name ?? null;
    },
  });
  const mutation = useMutation({
    mutationFn: async (value: string) => {
      const name = normalizeOperationalInputter(value);
      const { data, error } = await supabase.rpc("set_operational_inputter", { p_section: section, p_inputter_name: name, p_outlet_id: outletId! });
      if (error) throw error;
      return data?.[0]?.inputter_name ?? name;
    },
    onSuccess: async (name) => {
      client.setQueryData(queryKey, name);
      await client.invalidateQueries({ queryKey });
    },
  });
  return { name: query.data ?? null, query, mutation };
}
