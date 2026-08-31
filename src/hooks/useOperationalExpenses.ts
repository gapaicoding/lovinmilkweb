import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { OperationalExpenseInput } from "@/lib/operationalExpenses";

export type OperationalExpenseRow = Tables<"operational_expenses">;

type ExpenseMutation =
  | { action: "create"; input: OperationalExpenseInput; inputterSessionId: string }
  | { action: "update"; id: string; input: OperationalExpenseInput }
  | { action: "archive" | "restore" | "delete"; id: string };

export function useOperationalExpenses(showArchived: boolean) {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const enabled = Boolean(user) && !loading;

  const expenses = useQuery({
    queryKey: ["operational-expenses", { showArchived }],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from("operational_expenses")
        .select("*")
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!showArchived) query = query.is("deleted_at", null);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const categories = useQuery({
    queryKey: ["cost-categories", "operational-expense-options"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("id,name,scope,outlet_id,subunit_id")
        .eq("is_active", true)
        .eq("scope", "outlet")
        .is("subunit_id", null)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (request: ExpenseMutation) => {
      if (request.action === "create" || request.action === "update") {
        const args = {
          p_expense_date: request.input.expenseDate,
          p_item_name: request.input.itemName.trim(),
          p_quantity: request.input.quantity,
          p_unit: request.input.unit.trim(),
          p_unit_price: request.input.unitPrice,
          p_amount: request.input.amount,
          p_cost_category_id: request.input.costCategoryId,
          p_receipt_reference: request.input.receiptReference?.trim() || undefined,
          p_vendor_name: request.input.vendorName?.trim() || undefined,
          p_notes: request.input.notes || undefined,
        };
        const result =
          request.action === "create"
            ? await supabase.rpc("create_operational_expense_v3", {
                ...args,
                p_inputter_session_id: request.inputterSessionId,
              })
            : await supabase.rpc("update_operational_expense", { p_id: request.id, ...args });
        if (result.error) throw result.error;
        return;
      }
      const functionName = {
        archive: "archive_operational_expense",
        restore: "restore_operational_expense",
        delete: "hard_delete_operational_expense",
      } as const;
      const { error } = await supabase.rpc(functionName[request.action], { p_id: request.id });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["operational-expenses"] }),
        queryClient.invalidateQueries({ queryKey: ["stage7-reporting"] }),
      ]);
    },
  });

  return { expenses, categories, mutation };
}
