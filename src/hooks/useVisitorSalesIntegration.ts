import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ExistingVisitOption } from "@/lib/salesTransactions";
import type { VisitorSearchResult } from "@/lib/visitor";

export const visitorSalesQueryKeys = {
  all: ["visitor-sales-integration"] as const,
  options: (outletId: string | null, visitDate: string) =>
    [...visitorSalesQueryKeys.all, "options", outletId, visitDate] as const,
  profiles: (query: string) =>
    [...visitorSalesQueryKeys.all, "profiles", query.trim().toLocaleLowerCase("id-ID")] as const,
};

export function useVisitorVisitOptions(
  outletId: string | null,
  visitDate: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: visitorSalesQueryKeys.options(outletId, visitDate),
    enabled: enabled && Boolean(outletId) && /^\d{4}-\d{2}-\d{2}$/.test(visitDate),
    staleTime: 15_000,
    queryFn: async (): Promise<ExistingVisitOption[]> => {
      if (!outletId) return [];
      const { data, error } = await supabase.rpc("list_visitor_visit_options", {
        p_outlet_id: outletId,
        p_visit_date: visitDate,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        visitId: row.visit_id,
        visitorId: row.visitor_id,
        visitorName: row.visitor_name,
        visitorPhone: row.visitor_phone,
        adultCount: row.adult_count,
        childCount: row.child_count,
        totalVisitors: row.total_visitors,
        activeTransactionCount: Number(row.active_transaction_count),
        activePurchaseTotal: Number(row.active_purchase_total),
        checkOutAt: row.check_out_at,
      }));
    },
  });
}

export function useVisitorProfileOptions(query: string, enabled: boolean) {
  const normalized = query.trim();
  return useQuery({
    queryKey: visitorSalesQueryKeys.profiles(normalized),
    enabled: enabled && normalized.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<VisitorSearchResult[]> => {
      const { data, error } = await supabase.rpc("search_operational_visitors", {
        p_query: normalized,
        p_limit: 10,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
