import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type InventoryBalanceRow = Tables<"v_inventory_balances">;
export type InventoryMovementRow = Tables<"inventory_movements">;
export type InventoryItemRow = Tables<"inventory_items">;
export type InventoryCostBalanceRow = Tables<"v_inventory_cost_balances">;

export function useInventory() {
  const { user, loading } = useAuth();

  const balancesQuery = useQuery({
    queryKey: ["inventory", "balances"],
    enabled: !loading && Boolean(user),
    queryFn: async (): Promise<InventoryBalanceRow[]> => {
      const { data, error } = await supabase
        .from("v_inventory_balances")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const movementsQuery = useQuery({
    queryKey: ["inventory", "movements"],
    enabled: !loading && Boolean(user),
    queryFn: async (): Promise<InventoryMovementRow[]> => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*")
        .order("movement_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const costsQuery = useQuery({
    queryKey: ["inventory", "cost-balances"],
    enabled: !loading && Boolean(user),
    queryFn: async (): Promise<InventoryCostBalanceRow[]> => {
      const { data, error } = await supabase
        .from("v_inventory_cost_balances")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return {
    balances: balancesQuery.data ?? [],
    movements: movementsQuery.data ?? [],
    costs: costsQuery.data ?? [],
    isLoading: loading || balancesQuery.isLoading || movementsQuery.isLoading || costsQuery.isLoading,
    error: balancesQuery.error ?? movementsQuery.error ?? costsQuery.error ?? null,
    balancesQuery,
    movementsQuery,
    costsQuery,
  };
}
