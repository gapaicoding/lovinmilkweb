import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";

export type AssetRow = Tables<"assets"> & {
  asset_categories: { name: string } | null;
  business_subunits: { name: string } | null;
};
export type DepreciationRow = Tables<"asset_depreciation_entries">;

export function useOperationalAssets(asOf: string) {
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const enabled = Boolean(user) && !loading;
  const assets = useQuery({
    queryKey: ["operational-assets", asOf],
    enabled,
    queryFn: async () => {
      const [assetResult, valueResult] = await Promise.all([
        supabase.from("assets").select("*,asset_categories(name),business_subunits(name)").order("asset_code"),
        supabase.rpc("get_asset_book_values", { p_as_of_period: asOf }),
      ]);
      if (assetResult.error) throw assetResult.error;
      if (valueResult.error) throw valueResult.error;
      const values = new Map((valueResult.data ?? []).map((row) => [row.asset_id, row]));
      return (assetResult.data as AssetRow[]).map((asset) => ({ ...asset, valuation: values.get(asset.id) }));
    },
  });
  const depreciation = useQuery({
    queryKey: ["asset-depreciation", asOf],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_depreciation_entries").select("*").lte("period_month", asOf)
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const mutate = useMutation({
    mutationFn: async (input: { action: "create" | "update" | "archive" | "restore" | "delete" | "generate"; id?: string; payload?: Json }) => {
      let result;
      if (input.action === "create") result = await supabase.rpc("create_operational_asset", { p_asset: input.payload ?? {} });
      else if (input.action === "update") result = await supabase.rpc("update_operational_asset", { p_asset_id: input.id!, p_asset: input.payload ?? {} });
      else if (input.action === "archive") result = await supabase.rpc("archive_operational_asset", { p_asset_id: input.id! });
      else if (input.action === "restore") result = await supabase.rpc("restore_operational_asset", { p_asset_id: input.id! });
      else if (input.action === "delete") result = await supabase.rpc("hard_delete_operational_asset", { p_asset_id: input.id! });
      else result = await supabase.rpc("generate_asset_depreciation", { p_asset_id: input.id!, p_through_period: asOf });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["operational-assets"] }),
        client.invalidateQueries({ queryKey: ["asset-depreciation"] }),
      ]);
    },
  });
  return { assets, depreciation, mutate };
}
