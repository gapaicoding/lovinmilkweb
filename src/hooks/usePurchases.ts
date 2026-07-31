import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import type { PurchaseLineInput } from "@/lib/purchases";

export type PurchaseTransaction = Tables<"purchase_transactions">;
export type PurchaseTransactionItem = Tables<"purchase_transaction_items">;
export type PurchaseInventoryItem = Tables<"inventory_items">;
export type PurchaseSupplier = Tables<"suppliers">;
export type PurchaseSubunit = Tables<"business_subunits">;

export interface PurchaseWriteInput {
  id?: string;
  purchaseDate: string;
  supplierId: string | null;
  externalInvoiceNumber: string | null;
  notes: string | null;
  lines: PurchaseLineInput[];
}

export function usePurchases() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !loading && Boolean(user);
  const transactionsQuery = useQuery({
    queryKey: ["purchases", "transactions"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_transactions").select("*")
        .order("purchase_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const itemsQuery = useQuery({
    queryKey: ["purchases", "items"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_transaction_items").select("*")
        .order("revision", { ascending: false }).order("line_no");
      if (error) throw error;
      return data ?? [];
    },
  });
  const inventoryQuery = useQuery({
    queryKey: ["purchases", "inventory-options"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items").select("*").order("name");
      if (error) throw error;
      return (data ?? []).filter((item) => item.is_active && !item.deleted_at);
    },
  });
  const suppliersQuery = useQuery({
    queryKey: ["purchases", "supplier-options"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("supplier_name");
      if (error) throw error;
      return (data ?? []).filter((supplier) => supplier.is_active && !supplier.deleted_at);
    },
  });
  const subunitsQuery = useQuery({
    queryKey: ["purchases", "subunits"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("business_subunits").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchases"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: async (input: PurchaseWriteInput) => {
      const items = input.lines.map((line) => ({
        inventory_item_id: line.inventoryItemId,
        quantity: line.quantity,
        unit_cost: line.unitCost,
        notes: line.notes ?? null,
      })) as Json;
      const args = {
        p_purchase_date: input.purchaseDate,
        p_items: items,
        p_supplier_id: input.supplierId ?? undefined,
        p_external_invoice_number: input.externalInvoiceNumber ?? undefined,
        p_notes: input.notes ?? undefined,
      };
      const result = input.id
        ? await supabase.rpc("update_purchase_transaction", {
            p_transaction_id: input.id, ...args,
          })
        : await supabase.rpc("create_purchase_transaction", args);
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: invalidate,
  });
  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action }: {
      id: string;
      action: "archive" | "restore" | "hard-delete";
    }) => {
      const functionName =
        action === "archive" ? "soft_delete_purchase_transaction"
          : action === "restore" ? "restore_purchase_transaction"
            : "hard_delete_purchase_transaction";
      const { data, error } = await supabase.rpc(functionName, { p_transaction_id: id });
      if (error) throw error;
      if (!data) throw new Error("Transaksi pembelian tidak dapat diproses.");
    },
    onSuccess: invalidate,
  });
  return {
    transactions: transactionsQuery.data ?? [],
    items: itemsQuery.data ?? [],
    inventoryItems: inventoryQuery.data ?? [],
    suppliers: suppliersQuery.data ?? [],
    subunits: subunitsQuery.data ?? [],
    isLoading: loading || transactionsQuery.isLoading || itemsQuery.isLoading,
    error: transactionsQuery.error ?? itemsQuery.error ?? inventoryQuery.error
      ?? suppliersQuery.error ?? subunitsQuery.error ?? null,
    saveMutation,
    lifecycleMutation,
  };
}
