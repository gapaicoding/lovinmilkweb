import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { canCreateInventoryRequirement, isValidPositiveQuantity } from "@/lib/inventory";

type Product = Tables<"products">;
type Category = Tables<"sales_categories">;
type InventoryItem = Tables<"inventory_items">;
type Requirement = Tables<"product_inventory_requirements">;

export function BomManager() {
  const queryClient = useQueryClient();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { subunits } = useBusinessStructure();
  const canManage = isAdmin || isSuperAdmin;
  const [subunitId, setSubunitId] = useState("");
  const [productId, setProductId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["inventory", "bom"],
    queryFn: async () => {
      const [productsResult, categoriesResult, itemsResult, requirementsResult] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("sales_categories").select("*").order("name"),
        supabase.from("inventory_items").select("*").order("name"),
        supabase.from("product_inventory_requirements").select("*").order("created_at"),
      ]);
      const error = productsResult.error ?? categoriesResult.error ??
        itemsResult.error ?? requirementsResult.error;
      if (error) throw error;
      return {
        products: (productsResult.data ?? []) as Product[],
        categories: (categoriesResult.data ?? []) as Category[],
        items: (itemsResult.data ?? []) as InventoryItem[],
        requirements: (requirementsResult.data ?? []) as Requirement[],
      };
    },
  });

  const categories = useMemo(() => query.data?.categories ?? [], [query.data?.categories]);
  const products = useMemo(() => query.data?.products ?? [], [query.data?.products]);
  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const requirements = query.data?.requirements ?? [];
  const categoryMap = useMemo(() => new Map(categories.map((row) => [row.id, row])), [categories]);
  const productMap = useMemo(() => new Map(products.map((row) => [row.id, row])), [products]);
  const itemMap = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);
  const selectedProduct = productMap.get(productId);
  const selectedCategory = selectedProduct ? categoryMap.get(selectedProduct.sales_category_id) : undefined;
  const selectedSubunit = subunits.find((row) => row.id === subunitId);
  const selectedItem = itemMap.get(itemId);
  const productOptions = products.filter((product) =>
    categoryMap.get(product.sales_category_id)?.subunit_id === subunitId);
  const itemOptions = items.filter((item) =>
    item.subunit_id === subunitId && item.is_active && !item.deleted_at);
  const visibleRequirements = requirements.filter((row) => !productId || row.product_id === productId);
  const canAdd = canCreateInventoryRequirement({
    productSubunitId: selectedCategory?.subunit_id ?? null,
    inventoryItemSubunitId: selectedItem?.subunit_id ?? null,
    productIsActive: Boolean(selectedProduct?.is_active && !selectedProduct.deleted_at),
    categoryIsActive: Boolean(selectedCategory?.is_active),
    subunitIsActive: Boolean(selectedSubunit?.is_active && !selectedSubunit.deleted_at),
    inventoryItemIsActive: Boolean(selectedItem?.is_active && !selectedItem.deleted_at),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !productId || !itemId) throw new Error("Pilih Product dan Inventory Item.");
      const parsed = Number(quantity);
      if (!isValidPositiveQuantity(parsed)) throw new Error("Quantity requirement harus lebih dari nol.");
      if (!canAdd && !editingId) {
        throw new Error("Product dan Inventory Item harus aktif dan berasal dari Subunit yang sama.");
      }
      const result = editingId
        ? await supabase.from("product_inventory_requirements")
          .update({ quantity_required: parsed, updated_by: user.id }).eq("id", editingId)
        : await supabase.from("product_inventory_requirements").insert({
          product_id: productId, inventory_item_id: itemId, quantity_required: parsed,
          created_by: user.id, updated_by: user.id,
        });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory", "bom"] });
      setItemId(""); setQuantity(""); setEditingId(null);
      toast.success("Kebutuhan inventory Product berhasil disimpan.");
    },
    onError: showError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_inventory_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory", "bom"] });
      toast.success("Relasi kebutuhan inventory dihapus.");
    },
    onError: showError,
  });

  const edit = (row: Requirement) => {
    const product = productMap.get(row.product_id);
    const category = product ? categoryMap.get(product.sales_category_id) : undefined;
    setSubunitId(category?.subunit_id ?? "");
    setProductId(row.product_id);
    setItemId(row.inventory_item_id);
    setQuantity(String(row.quantity_required));
    setEditingId(row.id);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Select value={subunitId} onValueChange={(value) => {
          setSubunitId(value); setProductId(""); setItemId(""); setEditingId(null);
        }}>
          <SelectTrigger><SelectValue placeholder="Pilih Subunit" /></SelectTrigger>
          <SelectContent>{subunits.filter((row) => row.inventory_enabled && row.is_active && !row.deleted_at)
            .map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={productId} onValueChange={(value) => {
          setProductId(value); setItemId(""); setEditingId(null);
        }}>
          <SelectTrigger><SelectValue placeholder="Pilih Product" /></SelectTrigger>
          <SelectContent>{productOptions.map((product) => (
            <SelectItem key={product.id} value={product.id}>
              {product.name}{!product.is_active || product.deleted_at ? " (historis/nonaktif)" : ""}
            </SelectItem>
          ))}</SelectContent>
        </Select>
      </div>

      {canManage && productId ? (
        <div className="grid gap-3 rounded-md border p-4 lg:grid-cols-[1fr_180px_auto]">
          <Select value={itemId} disabled={Boolean(editingId)} onValueChange={setItemId}>
            <SelectTrigger><SelectValue placeholder="Inventory Item aktif" /></SelectTrigger>
            <SelectContent>{itemOptions.map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.name} ({item.unit})</SelectItem>
            ))}</SelectContent>
          </Select>
          <Input type="number" min="0" step="0.0001" placeholder="Quantity"
            value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          <div className="flex gap-2">
            <Button disabled={saveMutation.isPending || (!editingId && !canAdd)}
              onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 className="animate-spin" /> :
                editingId ? <Pencil /> : <Plus />}
              {editingId ? "Perbarui" : "Tambah"}
            </Button>
            {editingId ? <Button variant="outline" onClick={() => {
              setEditingId(null); setItemId(""); setQuantity("");
            }}>Batal</Button> : null}
          </div>
          {selectedProduct && (!selectedProduct.is_active || selectedProduct.deleted_at) ? (
            <p className="text-sm text-muted-foreground lg:col-span-3">
              Product historis tetap dapat dibaca, tetapi tidak dapat menerima mapping baru.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Inventory Item</TableHead>
            <TableHead>Subunit</TableHead><TableHead className="text-right">Qty</TableHead>
            <TableHead>Status Master</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleRequirements.map((row) => {
              const product = productMap.get(row.product_id);
              const category = product ? categoryMap.get(product.sales_category_id) : undefined;
              const item = itemMap.get(row.inventory_item_id);
              const active = Boolean(product?.is_active && !product.deleted_at &&
                category?.is_active && item?.is_active && !item.deleted_at);
              return <TableRow key={row.id}>
                <TableCell>{product?.name ?? row.product_id}</TableCell>
                <TableCell>{item?.name ?? row.inventory_item_id}</TableCell>
                <TableCell>{subunits.find((unit) => unit.id === category?.subunit_id)?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{row.quantity_required} {item?.unit ?? ""}</TableCell>
                <TableCell><Badge variant={active ? "secondary" : "outline"}>
                  {active ? "Aktif" : "Historis"}
                </Badge></TableCell>
                <TableCell>{canManage ? <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Edit quantity" onClick={() => edit(row)}>
                    <Pencil />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Hapus mapping"
                    disabled={deleteMutation.isPending}
                    onClick={() => window.confirm("Hapus relasi kebutuhan inventory ini?") &&
                      deleteMutation.mutate(row.id)}>
                    <Trash2 />
                  </Button>
                </div> : "Lihat saja"}</TableCell>
              </TableRow>;
            })}
            {!visibleRequirements.length ? <TableRow><TableCell colSpan={6}
              className="h-24 text-center text-muted-foreground">
              {query.isLoading ? "Memuat…" : query.isError ? "Data BOM gagal dimuat." :
                "Belum ada kebutuhan inventory untuk pilihan ini."}
            </TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Operasi BOM gagal.");
}
