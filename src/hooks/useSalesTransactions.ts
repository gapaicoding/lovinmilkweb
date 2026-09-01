import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { visitorSalesQueryKeys } from "@/hooks/useVisitorSalesIntegration";
import {
  buildCreateTransactionPayload,
  buildUpdateTransactionPayload,
  calculateLineSubtotal,
  type CreateSalesTransactionInput,
  type LinkedVisitSummary,
  type SalesEntrySource,
  type SalesProductOption,
  type SalesTransaction,
  type SalesTransactionItem,
  type UpdateSalesTransactionInput,
} from "@/lib/salesTransactions";

export type SalesTransactionRow = Tables<"sales_transactions">;
export type SalesTransactionItemRow = Tables<"sales_items">;
export type SalesProductRow = Tables<"products">;
export type SalesCategoryRow = Tables<"sales_categories">;

export interface SalesCategoryOption {
  categoryId: string;
  categoryName: string;
  subunitId: string;
  subunitName: string;
  outletId: string;
}

export const salesTransactionQueryKeys = {
  all: ["sales-transactions"] as const,

  headers: (outletId: string | null) =>
    [...salesTransactionQueryKeys.all, "headers", outletId] as const,

  items: (outletId: string | null, transactionIds: readonly string[]) =>
    [
      ...salesTransactionQueryKeys.all,
      "items",
      outletId,
      ...transactionIds,
    ] as const,

  linkedVisits: (outletId: string | null, transactionIds: readonly string[]) =>
    [...salesTransactionQueryKeys.all, "linked-visits", outletId, ...transactionIds] as const,

  categories: (outletId: string | null) =>
    [...salesTransactionQueryKeys.all, "categories", outletId] as const,

  products: (outletId: string | null) =>
    [...salesTransactionQueryKeys.all, "products", outletId] as const,
};

export function useSalesTransactions() {
  const queryClient = useQueryClient();

  const {
    user,
    loading: authLoading,
  } = useAuth();

  const {
    outlet,
    activeSubunits,
    isLoading: businessStructureLoading,
    isFetching: businessStructureFetching,
    error: businessStructureError,
  } = useBusinessStructure();

  const outletId = outlet?.id ?? null;

  // ==========================================================
  // ACTIVE SUBUNITS
  // ==========================================================

  const activeSubunitIds = useMemo(
    () => activeSubunits.map((subunit) => subunit.id),
    [activeSubunits],
  );

  const activeSubunitIdKey = activeSubunitIds.join(",");

  // ==========================================================
  // SALES CATEGORIES
  //
  // sales_categories tidak memiliki outlet_id.
  //
  // Ownership:
  //
  // Category
  //   -> Business Subunit
  //   -> Outlet
  // ==========================================================

  const categoriesQuery = useQuery({
    queryKey: [
      ...salesTransactionQueryKeys.categories(outletId),
      activeSubunitIdKey,
    ],

    enabled:
      !authLoading &&
      Boolean(user) &&
      Boolean(outletId) &&
      activeSubunitIds.length > 0,

    staleTime: 60_000,

    queryFn: async (): Promise<SalesCategoryRow[]> => {
      if (activeSubunitIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("sales_categories")
        .select("*")
        .in("subunit_id", activeSubunitIds)
        .eq("is_active", true)
        .order("name", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );

  const categoryIds = useMemo(
    () => categories.map((category) => category.id),
    [categories],
  );

  const categoryIdKey = categoryIds.join(",");

  // ==========================================================
  // PRODUCTS
  //
  // Hanya Product aktif dari Category/Subunit aktif pada
  // default Outlet.
  //
  // Product yang sudah soft-deleted tidak digunakan untuk
  // membuat transaksi baru.
  // ==========================================================

  const productsQuery = useQuery({
    queryKey: [
      ...salesTransactionQueryKeys.products(outletId),
      categoryIdKey,
    ],

    enabled:
      !authLoading &&
      Boolean(user) &&
      Boolean(outletId) &&
      !categoriesQuery.isLoading &&
      categoryIds.length > 0,

    staleTime: 60_000,

    queryFn: async (): Promise<SalesProductRow[]> => {
      if (categoryIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("sales_category_id", categoryIds)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );

  // ==========================================================
  // TRANSACTION HEADERS
  //
  // deleted_at sengaja tidak difilter di frontend.
  //
  // PostgreSQL RLS:
  //
  // Staff/Admin
  //   -> active only
  //
  // Super Admin
  //   -> active + soft-deleted
  // ==========================================================

  const transactionRowsQuery = useQuery({
    queryKey: salesTransactionQueryKeys.headers(outletId),

    enabled:
      !authLoading &&
      Boolean(user) &&
      Boolean(outletId),

    staleTime: 15_000,

    queryFn: async (): Promise<SalesTransactionRow[]> => {
      if (!outletId) {
        return [];
      }

      const { data, error } = await supabase
        .from("sales_transactions")
        .select("*")
        .eq("outlet_id", outletId)
        .order("transaction_date", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const transactionRows = useMemo(
    () => transactionRowsQuery.data ?? [],
    [transactionRowsQuery.data],
  );

  const transactionIds = useMemo(
    () => transactionRows.map((transaction) => transaction.id),
    [transactionRows],
  );

  const transactionIdKey = transactionIds.join(",");

  // ==========================================================
  // TRANSACTION ITEMS
  //
  // Item hanya diambil untuk header yang visible melalui RLS.
  //
  // Detail histori menggunakan snapshot sales_items.
  // ==========================================================

  const transactionItemsQuery = useQuery({
    queryKey: [
      ...salesTransactionQueryKeys.items(outletId, []),
      transactionIdKey,
    ],

    enabled:
      !authLoading &&
      Boolean(user) &&
      Boolean(outletId) &&
      !transactionRowsQuery.isLoading,

    staleTime: 15_000,

    queryFn: async (): Promise<SalesTransactionItemRow[]> => {
      if (transactionIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("sales_items")
        .select("*")
        .in("sales_transaction_id", transactionIds)
        .order("sales_transaction_id", {
          ascending: true,
        })
        .order("line_no", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const transactionItemRows = useMemo(
    () => transactionItemsQuery.data ?? [],
    [transactionItemsQuery.data],
  );

  const linkedVisitsQuery = useQuery({
    queryKey: salesTransactionQueryKeys.linkedVisits(outletId, transactionIds),
    enabled:
      !authLoading && Boolean(user) && Boolean(outletId) && transactionIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_linked_visit_summaries", {
        p_transaction_ids: transactionIds,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const linkedVisitByTransactionId = useMemo(() => {
    const result = new Map<string, LinkedVisitSummary>();
    for (const row of linkedVisitsQuery.data ?? []) {
      result.set(row.sales_transaction_id, {
        visitId: row.visit_id,
        visitorId: row.visitor_id,
        visitorName: row.visitor_name,
        adultCount: row.adult_count,
        childCount: row.child_count,
        totalVisitors: row.total_visitors,
        visitDate: row.visit_date,
        deletedAt: row.visit_deleted_at,
      });
    }
    return result;
  }, [linkedVisitsQuery.data]);

  // ==========================================================
  // LOOKUP MAPS
  // ==========================================================

  const subunitMap = useMemo(
    () =>
      new Map(
        activeSubunits.map((subunit) => [
          subunit.id,
          subunit,
        ]),
      ),
    [activeSubunits],
  );

  const categoryMap = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          category,
        ]),
      ),
    [categories],
  );

  // ==========================================================
  // CATEGORY OPTIONS
  // ==========================================================

  const categoryOptions = useMemo<SalesCategoryOption[]>(() => {
    if (!outletId) {
      return [];
    }

    return categories
      .map((category): SalesCategoryOption | null => {
        const subunit = subunitMap.get(
          category.subunit_id,
        );

        if (!subunit) {
          return null;
        }

        return {
          categoryId: category.id,
          categoryName: category.name,

          subunitId: subunit.id,
          subunitName: subunit.name,

          outletId,
        };
      })
      .filter(
        (category): category is SalesCategoryOption =>
          category !== null,
      )
      .sort((left, right) => {
        const subunitComparison =
          left.subunitName.localeCompare(
            right.subunitName,
            "id-ID",
          );

        if (subunitComparison !== 0) {
          return subunitComparison;
        }

        return left.categoryName.localeCompare(
          right.categoryName,
          "id-ID",
        );
      });
  }, [
    categories,
    outletId,
    subunitMap,
  ]);

  // ==========================================================
  // PRODUCT OPTIONS
  //
  // Product menentukan Category + Subunit.
  //
  // Category/Subunit hanya metadata display di frontend.
  // Canonical ownership tetap divalidasi database.
  // ==========================================================

  const productOptions = useMemo<SalesProductOption[]>(() => {
    if (!outletId) {
      return [];
    }

    return products
      .map((product): SalesProductOption | null => {
        const category = categoryMap.get(
          product.sales_category_id,
        );

        if (!category) {
          return null;
        }

        const subunit = subunitMap.get(
          category.subunit_id,
        );

        if (!subunit) {
          return null;
        }

        return {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,

          unit: product.unit,
          sellingPrice: product.selling_price,

          categoryId: category.id,
          categoryName: category.name,

          subunitId: subunit.id,
          subunitCode: subunit.code,
          subunitName: subunit.name,

          outletId,
        };
      })
      .filter(
        (product): product is SalesProductOption =>
          product !== null,
      )
      .sort((left, right) => {
        const subunitComparison =
          left.subunitName.localeCompare(
            right.subunitName,
            "id-ID",
          );

        if (subunitComparison !== 0) {
          return subunitComparison;
        }

        const categoryComparison =
          left.categoryName.localeCompare(
            right.categoryName,
            "id-ID",
          );

        if (categoryComparison !== 0) {
          return categoryComparison;
        }

        return left.productName.localeCompare(
          right.productName,
          "id-ID",
        );
      });
  }, [
    categoryMap,
    outletId,
    products,
    subunitMap,
  ]);

  // ==========================================================
  // TRANSACTION ITEM DOMAIN MODEL
  // ==========================================================

  const transactionItems = useMemo<SalesTransactionItem[]>(
    () =>
      transactionItemRows.map(
        mapSalesTransactionItem,
      ),
    [transactionItemRows],
  );

  const itemsByTransactionId = useMemo(() => {
    const map = new Map<
      string,
      SalesTransactionItem[]
    >();

    for (const item of transactionItems) {
      const current =
        map.get(item.salesTransactionId) ?? [];

      current.push(item);

      map.set(
        item.salesTransactionId,
        current,
      );
    }

    for (const items of map.values()) {
      items.sort(
        (left, right) =>
          left.lineNo - right.lineNo,
      );
    }

    return map;
  }, [transactionItems]);

  // ==========================================================
  // TRANSACTION DOMAIN MODEL
  // ==========================================================

  const transactions = useMemo<SalesTransaction[]>(
    () =>
      transactionRows.map((row) =>
        mapSalesTransaction(
          row,
          itemsByTransactionId.get(row.id) ?? [],
          linkedVisitByTransactionId.get(row.id) ?? null,
        ),
      ),
    [
      itemsByTransactionId,
      linkedVisitByTransactionId,
      transactionRows,
    ],
  );

  // ==========================================================
  // QUERY INVALIDATION
  // ==========================================================

  const invalidateSalesTransactions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: salesTransactionQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: visitorSalesQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["visitor-visits"] }),
      queryClient.invalidateQueries({ queryKey: ["visitors"] }),
    ]);
  };

  // ==========================================================
  // CREATE
  //
  // p_notes dan p_outlet_id adalah optional pada generated
  // Supabase RPC types.
  //
  // null pada domain berarti parameter tidak dikirim.
  // ==========================================================

  const createMutation = useMutation({
    mutationFn: async ({ input, inputterSessionId }: {
      input: CreateSalesTransactionInput;
      inputterSessionId: string;
    },
    ): Promise<string> => {
      const payload =
        buildCreateTransactionPayload({
          ...input,

          outletId:
            input.outletId ??
            outletId,
        });

      const rpcArgs = {
        p_transaction_date:
          payload.p_transaction_date,

        p_items:
          payload.p_items as unknown as Json,

        p_entry_source:
          payload.p_entry_source,

        ...(payload.p_notes !== null
          ? {
              p_notes:
                payload.p_notes,
            }
          : {}),

        ...(payload.p_outlet_id !== null
          ? {
              p_outlet_id:
                payload.p_outlet_id,
            }
          : {}),
      };

      const { data, error } =
        await supabase.rpc("create_sales_transaction_with_visit_v3", {
          ...rpcArgs,
          p_inputter_session_id: inputterSessionId,
          ...(payload.p_existing_visit_id
            ? { p_existing_visit_id: payload.p_existing_visit_id }
            : {}),
          ...(payload.p_new_visit
            ? { p_new_visit: payload.p_new_visit as unknown as Json }
            : {}),
        });

      if (error) {
        throw error;
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(
          "Transaksi berhasil diproses, tetapi ID transaksi tidak dikembalikan.",
        );
      }

      const transactionId = data.sales_transaction_id;
      if (typeof transactionId !== "string") {
        throw new Error("ID transaksi tidak dikembalikan oleh server.");
      }
      return transactionId;
    },

    onSuccess:
      invalidateSalesTransactions,
  });

  // ==========================================================
  // UPDATE
  //
  // p_notes optional.
  // Null berarti parameter tidak dikirim.
  // ==========================================================

  const updateMutation = useMutation({
    mutationFn: async ({ input, inputterSessionId }: {
      input: UpdateSalesTransactionInput;
      inputterSessionId: string | null;
    }): Promise<boolean> => {
      const payload =
        buildUpdateTransactionPayload(
          input,
        );

      const rpcArgs = {
        p_transaction_id:
          payload.p_transaction_id,

        p_transaction_date:
          payload.p_transaction_date,

        p_items:
          payload.p_items as unknown as Json,

        ...(payload.p_notes !== null
          ? {
              p_notes:
                payload.p_notes,
            }
          : {}),
      };

      const { data, error } =
        await supabase.rpc("update_sales_transaction_with_visit_v3", {
          ...rpcArgs,
          ...(inputterSessionId ? { p_inputter_session_id: inputterSessionId } : {}),
          ...(payload.p_existing_visit_id
            ? { p_existing_visit_id: payload.p_existing_visit_id }
            : {}),
          ...(payload.p_new_visit
            ? { p_new_visit: payload.p_new_visit as unknown as Json }
            : {}),
        });

      if (error) {
        throw error;
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(
          "Transaksi tidak dapat diperbarui.",
        );
      }

      return true;
    },

    onSuccess:
      invalidateSalesTransactions,
  });

  // ==========================================================
  // SOFT DELETE
  // ==========================================================

  const softDeleteMutation = useMutation({
    mutationFn: async (
      transactionId: string,
    ): Promise<boolean> => {
      const { data, error } =
        await supabase.rpc(
          "soft_delete_sales_transaction",
          {
            p_transaction_id:
              transactionId,
          },
        );

      if (error) {
        throw error;
      }

      if (data !== true) {
        throw new Error(
          "Transaksi tidak dapat dihapus.",
        );
      }

      return true;
    },

    onSuccess:
      invalidateSalesTransactions,
  });

  // ==========================================================
  // RESTORE
  // ==========================================================

  const restoreMutation = useMutation({
    mutationFn: async (
      transactionId: string,
    ): Promise<boolean> => {
      const { data, error } =
        await supabase.rpc(
          "restore_sales_transaction",
          {
            p_transaction_id:
              transactionId,
          },
        );

      if (error) {
        throw error;
      }

      if (data !== true) {
        throw new Error(
          "Transaksi tidak dapat dipulihkan.",
        );
      }

      return true;
    },

    onSuccess:
      invalidateSalesTransactions,
  });

  // ==========================================================
  // HARD DELETE
  // ==========================================================

  const hardDeleteMutation = useMutation({
    mutationFn: async (
      transactionId: string,
    ): Promise<boolean> => {
      const { data, error } =
        await supabase.rpc(
          "hard_delete_sales_transaction",
          {
            p_transaction_id:
              transactionId,
          },
        );

      if (error) {
        throw error;
      }

      if (data !== true) {
        throw new Error(
          "Transaksi tidak dapat dihapus permanen.",
        );
      }

      return true;
    },

    onSuccess:
      invalidateSalesTransactions,
  });

  // ==========================================================
  // COMBINED STATUS
  // ==========================================================

  const isLoading =
    authLoading ||
    businessStructureLoading ||
    categoriesQuery.isLoading ||
    productsQuery.isLoading ||
    transactionRowsQuery.isLoading ||
    transactionItemsQuery.isLoading ||
    linkedVisitsQuery.isLoading;

  const isFetching =
    businessStructureFetching ||
    categoriesQuery.isFetching ||
    productsQuery.isFetching ||
    transactionRowsQuery.isFetching ||
    transactionItemsQuery.isFetching ||
    linkedVisitsQuery.isFetching;

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    softDeleteMutation.isPending ||
    restoreMutation.isPending ||
    hardDeleteMutation.isPending;

  const error =
    businessStructureError ??
    categoriesQuery.error ??
    productsQuery.error ??
    transactionRowsQuery.error ??
    transactionItemsQuery.error ??
    linkedVisitsQuery.error ??
    null;

  return {
    // --------------------------------------------------------
    // Business structure
    // --------------------------------------------------------

    outlet,

    subunits:
      activeSubunits,

    categories:
      categoryOptions,

    products:
      productOptions,

    // --------------------------------------------------------
    // Transactions
    // --------------------------------------------------------

    transactions,
    transactionItems,

    // --------------------------------------------------------
    // Status
    // --------------------------------------------------------

    isLoading,
    isFetching,
    isMutating,
    error,

    // --------------------------------------------------------
    // Queries
    // --------------------------------------------------------

    categoriesQuery,
    productsQuery,
    transactionRowsQuery,
    transactionItemsQuery,
    linkedVisitsQuery,

    // --------------------------------------------------------
    // Mutations
    // --------------------------------------------------------

    createMutation,
    updateMutation,
    softDeleteMutation,
    restoreMutation,
    hardDeleteMutation,

    createSalesTransaction: (input: CreateSalesTransactionInput, inputterSessionId: string) =>
      createMutation.mutateAsync({ input, inputterSessionId }),

    updateSalesTransaction: (input: UpdateSalesTransactionInput, inputterSessionId: string | null = null) =>
      updateMutation.mutateAsync({ input, inputterSessionId }),

    softDeleteSalesTransaction:
      softDeleteMutation.mutateAsync,

    restoreSalesTransaction:
      restoreMutation.mutateAsync,

    hardDeleteSalesTransaction:
      hardDeleteMutation.mutateAsync,

    // --------------------------------------------------------
    // Manual refresh
    // --------------------------------------------------------

    refresh:
      invalidateSalesTransactions,
  };
}

function mapSalesTransactionItem(
  row: SalesTransactionItemRow,
): SalesTransactionItem {
  return {
    id:
      row.id,

    salesTransactionId:
      row.sales_transaction_id,

    lineNo:
      row.line_no,

    productId:
      row.product_id,

    salesCategoryId:
      row.sales_category_id,

    subunitId:
      row.subunit_id,

    quantity:
      row.quantity,

    unitPrice:
      row.unit_price,

    // Generated Supabase type membaca generated amount sebagai
    // number | null.
    //
    // Canonical DB value tetap dipakai saat tersedia.
    amount:
      row.amount ??
      calculateLineSubtotal({
        quantity:
          row.quantity,

        unitPrice:
          row.unit_price,
      }),

    unitHpp: row.unit_hpp,

    hppAmount: row.hpp_amount,

    hppStatus:
      row.hpp_status === "provisional"
        ? "provisional"
        : "final",

    productNameSnapshot:
      row.product_name_snapshot,

    productSkuSnapshot:
      row.product_sku_snapshot,

    categoryNameSnapshot:
      row.category_name_snapshot,

    subunitNameSnapshot:
      row.subunit_name_snapshot,

    unitSnapshot:
      row.unit_snapshot,

    notes:
      row.notes,

    createdAt:
      row.created_at,
  };
}

function mapSalesTransaction(
  row: SalesTransactionRow,
  items: SalesTransactionItem[],
  linkedVisit: LinkedVisitSummary | null,
): SalesTransaction {
  return {
    id:
      row.id,

    outletId:
      row.outlet_id,

    transactionNumber:
      row.transaction_number,

    transactionDate:
      row.transaction_date,

    totalAmount:
      row.total_amount,

    inputterName: row.inputter_name,

    notes:
      row.notes,

    entrySource:
      normalizeSalesEntrySource(
        row.entry_source,
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    createdBy:
      row.created_by,

    updatedBy:
      row.updated_by,

    deletedAt:
      row.deleted_at,

    deletedBy:
      row.deleted_by,

    visitorVisitId: row.visitor_visit_id,

    linkedVisit,

    items,
  };
}

function normalizeSalesEntrySource(
  value: string,
): SalesEntrySource {
  if (value === "visitor") {
    return "visitor";
  }

  return "manual";
}
