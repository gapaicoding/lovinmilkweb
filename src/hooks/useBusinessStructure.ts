import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import {
  getActiveSubunits,
  sortSubunitsByName,
} from "@/lib/businessStructure";

export type OutletRow = Tables<"outlets">;
export type BusinessSubunitRow = Tables<"business_subunits">;

export function useBusinessStructure() {
  const { user, loading: authLoading } = useAuth();

  const outletQuery = useQuery({
    queryKey: ["outlet", "default"],

    enabled: !authLoading && Boolean(user),

    staleTime: 5 * 60_000,

    queryFn: async (): Promise<OutletRow> => {
      const { data, error } = await supabase
        .from("outlets")
        .select("*")
        .eq("is_default", true)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Outlet default tidak ditemukan. Pastikan Outlet Kadirojo tersedia.",
        );
      }

      return data;
    },
  });

  const outletId = outletQuery.data?.id ?? null;

  const subunitsQuery = useQuery({
    queryKey: ["business-subunits", outletId],

    enabled:
      !authLoading &&
      Boolean(user) &&
      Boolean(outletId),

    staleTime: 60_000,

    queryFn: async (): Promise<BusinessSubunitRow[]> => {
      if (!outletId) {
        return [];
      }

      const { data, error } = await supabase
        .from("business_subunits")
        .select("*")
        .eq("outlet_id", outletId)
        .order("name", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const subunits = sortSubunitsByName(
    subunitsQuery.data ?? [],
  );

  const activeSubunits = getActiveSubunits(subunits);

  return {
    outlet: outletQuery.data ?? null,

    subunits,
    activeSubunits,

    isLoading:
      authLoading ||
      outletQuery.isLoading ||
      subunitsQuery.isLoading,

    isFetching:
      outletQuery.isFetching ||
      subunitsQuery.isFetching,

    error:
      outletQuery.error ??
      subunitsQuery.error ??
      null,

    outletQuery,
    subunitsQuery,
  };
}
