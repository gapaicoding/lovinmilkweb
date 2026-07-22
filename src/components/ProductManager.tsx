import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircle, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CurrencyInput } from "@/components/CurrencyInput";
import { formatDateTime, formatRupiah } from "@/lib/format";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const PAGE_SIZE = 10;
const HARD_DELETE_CONFIRMATION = "HAPUS";

const productSchema = z.object({
  name: z.string().trim().min(1, "Nama produk wajib diisi.").max(150, "Nama produk maksimal 150 karakter."),
  sku: z.string().trim().max(50, "SKU maksimal 50 karakter.").optional(),
  sales_category_id: z.string().uuid("Kategori penjualan wajib dipilih."),
  unit: z.string().trim().min(1, "Satuan wajib diisi.").max(30, "Satuan maksimal 30 karakter."),
  selling_price: z.number({ message: "Harga jual wajib diisi." }).finite().min(0, "Harga jual tidak boleh negatif.").max(999_999_999_999),
  notes: z.string().trim().max(500, "Catatan maksimal 500 karakter.").optional(),
  is_active: z.boolean(),
});

type ProductFormValues = z.infer<typeof productSchema>;
type ProductRow = Tables<"products">;
type CategoryRow = Tables<"sales_categories">;

type ListResult = { rows: ProductRow[]; count: number };
type SaveVariables = { values: ProductFormValues; productId: string | null };
type ActionVariables = { productId: string };
type DbError = { code?: string; message?: string; details?: string };

export function ProductManager() {
  const { user, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const canManage = isAdmin || isSuperAdmin;

  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [hardDeleteId, setHardDeleteId] = useState<string | null>(null);
  const [hardConfirmText, setHardConfirmText] = useState("");

  const normalizedSearch = search.trim();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", sku: "", sales_category_id: "", unit: "pcs", selling_price: 0, notes: "", is_active: true },
  });

  const categoriesQuery = useQuery({
    queryKey: ["sales_categories", "all"],
    enabled: !authLoading && canManage,
    queryFn: async (): Promise<CategoryRow[]> => {
      const { data, error } = await supabase.from("sales_categories").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const categories = categoriesQuery.data ?? [];
  const activeCategories = useMemo(() => categories.filter((item) => item.is_active), [categories]);
  const selectableCategories = useMemo(() => {
    if (!editingProduct) return activeCategories;
    const current = categories.find((item) => item.id === editingProduct.sales_category_id);
    return current && !current.is_active
      ? [current, ...activeCategories.filter((item) => item.id !== current.id)]
      : activeCategories;
  }, [activeCategories, categories, editingProduct]);
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);

  const listQuery = useQuery({
    queryKey: ["products", "list", { tab, normalizedSearch, categoryFilter, statusFilter, page }],
    enabled: !authLoading && canManage && !categoriesQuery.isLoading,
    queryFn: async (): Promise<ListResult> => {
      let query = supabase.from("products").select("*", { count: "exact" });
      query = tab === "active" ? query.is("deleted_at", null) : query.not("deleted_at", "is", null);
      if (categoryFilter !== "all") query = query.eq("sales_category_id", categoryFilter);
      if (statusFilter === "active") query = query.eq("is_active", true);
      if (statusFilter === "inactive") query = query.eq("is_active", false);
      if (normalizedSearch) {
        const term = sanitizeSearchTerm(normalizedSearch);
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,notes.ilike.%${term}%`);
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await query.order("name").range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["products"] });

  const saveMutation = useMutation({
    mutationFn: async ({ values, productId }: SaveVariables) => {
      ensureAccess(user?.id, canManage);
      const payload = {
        name: values.name.trim(),
        sku: values.sku?.trim() || null,
        sales_category_id: values.sales_category_id,
        unit: values.unit.trim(),
        selling_price: values.selling_price,
        notes: values.notes?.trim() || null,
        is_active: values.is_active,
        updated_by: user!.id,
      };
      if (productId) {
        const { data, error } = await supabase.from("products").update(payload as TablesUpdate<"products">).eq("id", productId).is("deleted_at", null).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Produk tidak ditemukan.");
        return "update" as const;
      }
      const { data, error } = await supabase.from("products").insert({ ...payload, created_by: user!.id } as TablesInsert<"products">).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Produk gagal ditambahkan.");
      return "create" as const;
    },
    onSuccess: async (mode) => {
      await invalidate();
      toast.success(mode === "update" ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.");
      closeDialog();
    },
    onError: (error) => toast.error("Gagal menyimpan produk.", { description: getErrorMessage(error) }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (product: ProductRow) => {
      ensureAccess(user?.id, canManage);
      const { data, error } = await supabase.from("products").update({ is_active: !product.is_active, updated_by: user!.id }).eq("id", product.id).is("deleted_at", null).select("id, name, is_active").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Produk tidak ditemukan.");
      return data;
    },
    onSuccess: async (data) => {
      await invalidate();
      toast.success(data.is_active ? "Produk berhasil diaktifkan." : "Produk berhasil dinonaktifkan.", { description: data.name });
    },
    onError: (error) => toast.error("Gagal memperbarui status produk.", { description: getErrorMessage(error) }),
  });

  const softDeleteMutation = useMutation({
    mutationFn: async ({ productId }: ActionVariables) => {
      ensureAccess(user?.id, canManage);
      const { data, error } = await supabase.from("products").update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: user!.id, updated_by: user!.id }).eq("id", productId).is("deleted_at", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Produk tidak ditemukan.");
    },
    onSuccess: async () => { await invalidate(); toast.success("Produk berhasil dihapus."); setDeleteId(null); },
    onError: (error) => toast.error("Gagal menghapus produk.", { description: getErrorMessage(error) }),
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ productId }: ActionVariables) => {
      ensureSuperAdmin(user?.id, isSuperAdmin);
      const { data, error } = await supabase.from("products").update({ deleted_at: null, deleted_by: null, updated_by: user!.id }).eq("id", productId).not("deleted_at", "is", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Produk tidak ditemukan.");
    },
    onSuccess: async () => { await invalidate(); toast.success("Produk berhasil dipulihkan."); },
    onError: (error) => toast.error("Gagal memulihkan produk.", { description: getErrorMessage(error) }),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async ({ productId }: ActionVariables) => {
      ensureSuperAdmin(user?.id, isSuperAdmin);
      const { data, error } = await supabase.from("products").delete().eq("id", productId).not("deleted_at", "is", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Produk tidak ditemukan.");
    },
    onSuccess: async () => { await invalidate(); toast.success("Produk berhasil dihapus permanen."); setHardDeleteId(null); setHardConfirmText(""); },
    onError: (error) => toast.error("Gagal menghapus permanen produk.", { description: getErrorMessage(error) }),
  });

  const totalPages = Math.max(1, Math.ceil((listQuery.data?.count ?? 0) / PAGE_SIZE));
  useEffect(() => { if (!isSuperAdmin && tab === "deleted") setTab("active"); }, [isSuperAdmin, tab]);
  useEffect(() => { if (!listQuery.isLoading && page > totalPages) setPage(totalPages); }, [listQuery.isLoading, page, totalPages]);

  const resetForm = () => form.reset({ name: "", sku: "", sales_category_id: "", unit: "pcs", selling_price: 0, notes: "", is_active: true });
  const closeDialog = () => { if (saveMutation.isPending) return; setDialogOpen(false); setEditingProduct(null); resetForm(); };
  const openCreate = () => { setEditingProduct(null); resetForm(); setDialogOpen(true); };
  const openEdit = (product: ProductRow) => {
    setEditingProduct(product);
    form.reset({ name: product.name, sku: product.sku ?? "", sales_category_id: product.sales_category_id, unit: product.unit, selling_price: Number(product.selling_price), notes: product.notes ?? "", is_active: product.is_active });
    setDialogOpen(true);
  };
  const hasFilters = Boolean(normalizedSearch) || categoryFilter !== "all" || statusFilter !== "all";

  if (!authLoading && !canManage) return <AccessDenied />;

  return (
    <div>
      <PageHeader title="Master Produk" description="Kelola produk, kategori penjualan, SKU, satuan, harga jual, dan status aktif." actions={<Button onClick={openCreate} disabled={authLoading || categoriesQuery.isLoading}><Plus className="mr-2 h-4 w-4" />Tambah Produk</Button>} />

      <Tabs value={tab} onValueChange={(value) => { setTab(value as "active" | "deleted"); setPage(1); }}>
        {isSuperAdmin && <TabsList className="mb-4"><TabsTrigger value="active">Data Aktif</TabsTrigger><TabsTrigger value="deleted">Data Terhapus</TabsTrigger></TabsList>}
      </Tabs>

      <Card className="rounded-xl"><CardContent className="space-y-4 p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="relative md:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Cari nama, SKU, atau catatan..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
          <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Semua kategori" /></SelectTrigger><SelectContent><SelectItem value="all">Semua Kategori</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{!item.is_active ? " (Nonaktif)" : ""}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger><SelectContent><SelectItem value="all">Semua Status</SelectItem><SelectItem value="active">Aktif</SelectItem><SelectItem value="inactive">Nonaktif</SelectItem></SelectContent></Select>
        </div>
        {hasFilters && <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); setPage(1); }}><X className="mr-2 h-4 w-4" />Reset Filter</Button></div>}

        {categoriesQuery.isError || listQuery.isError ? <ErrorState onRetry={() => void (categoriesQuery.isError ? categoriesQuery.refetch() : listQuery.refetch())} /> : <>
          <div className="overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>SKU</TableHead><TableHead>Kategori</TableHead><TableHead>Satuan</TableHead><TableHead>Harga</TableHead><TableHead>Status</TableHead><TableHead>Diperbarui</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>
            {listQuery.isLoading || categoriesQuery.isLoading ? <SkeletonRows /> : listQuery.data?.rows.length ? listQuery.data.rows.map((product) => {
              const busy = (toggleMutation.isPending && toggleMutation.variables?.id === product.id) || (softDeleteMutation.isPending && softDeleteMutation.variables?.productId === product.id) || (restoreMutation.isPending && restoreMutation.variables?.productId === product.id) || (hardDeleteMutation.isPending && hardDeleteMutation.variables?.productId === product.id);
              return <TableRow key={product.id}><TableCell><div className="font-medium">{product.name}</div><div className="max-w-[220px] truncate text-xs text-muted-foreground">{product.notes || "-"}</div></TableCell><TableCell className="font-mono text-xs">{product.sku || "-"}</TableCell><TableCell>{categoryMap.get(product.sales_category_id) ?? "-"}</TableCell><TableCell>{product.unit}</TableCell><TableCell>{formatRupiah(Number(product.selling_price))}</TableCell><TableCell>{tab === "active" ? <div className="flex items-center gap-2"><Switch checked={product.is_active} disabled={busy} onCheckedChange={() => toggleMutation.mutate(product)} /><Badge variant={product.is_active ? "default" : "secondary"}>{product.is_active ? "Aktif" : "Nonaktif"}</Badge></div> : <Badge variant="destructive">Terhapus</Badge>}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(product.updated_at)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1">{busy && <Loader2 className="my-auto h-4 w-4 animate-spin" />}{tab === "active" ? <><Button size="icon" variant="ghost" disabled={busy} onClick={() => openEdit(product)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setDeleteId(product.id)}><Trash2 className="h-4 w-4" /></Button></> : <><Button size="icon" variant="ghost" disabled={busy} onClick={() => restoreMutation.mutate({ productId: product.id })}><RotateCcw className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { setHardDeleteId(product.id); setHardConfirmText(""); }}><Trash2 className="h-4 w-4" /></Button></>}</div></TableCell></TableRow>;
            }) : <TableRow><TableCell colSpan={8} className="p-0"><EmptyState title={hasFilters ? "Produk tidak ditemukan" : tab === "deleted" ? "Belum ada produk terhapus" : "Belum ada produk"} description={hasFilters ? "Tidak ada produk yang cocok dengan filter." : "Tambahkan produk pertama melalui tombol di atas."} /></TableCell></TableRow>}
          </TableBody></Table></div>
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Total {listQuery.data?.count ?? 0} produk</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</Button><span>Halaman {page} / {totalPages}</span><Button size="sm" variant="outline" disabled={page >= totalPages || listQuery.isFetching} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Berikutnya</Button></div></div>
        </>}
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editingProduct ? "Edit Produk" : "Tambah Produk"}</DialogTitle><DialogDescription>Isi data master produk.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate({ values, productId: editingProduct?.id ?? null }))}>
        <Field label="Nama Produk" error={form.formState.errors.name?.message}><Input disabled={saveMutation.isPending} {...form.register("name")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="SKU" error={form.formState.errors.sku?.message}><Input disabled={saveMutation.isPending} {...form.register("sku")} /></Field><Field label="Kategori" error={form.formState.errors.sales_category_id?.message}><Select value={form.watch("sales_category_id")} onValueChange={(value) => form.setValue("sales_category_id", value, { shouldValidate: true })}><SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger><SelectContent>{selectableCategories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{!item.is_active ? " (Nonaktif)" : ""}</SelectItem>)}</SelectContent></Select></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Satuan" error={form.formState.errors.unit?.message}><Input disabled={saveMutation.isPending} {...form.register("unit")} /></Field><Field label="Harga Jual" error={form.formState.errors.selling_price?.message}><CurrencyInput value={form.watch("selling_price")} onChange={(value) => form.setValue("selling_price", value, { shouldValidate: true })} /></Field></div>
        <Field label="Catatan" error={form.formState.errors.notes?.message}><Textarea rows={3} maxLength={500} disabled={saveMutation.isPending} {...form.register("notes")} /></Field>
        <div className="flex items-center justify-between rounded-lg border p-3"><div><Label>Status Aktif</Label><p className="text-xs text-muted-foreground">Produk nonaktif tidak dipilih pada transaksi baru.</p></div><Switch checked={form.watch("is_active")} onCheckedChange={(value) => form.setValue("is_active", value)} /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Batal</Button><Button type="submit" disabled={saveMutation.isPending || selectableCategories.length === 0}>{saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingProduct ? "Simpan Perubahan" : "Tambah Produk"}</Button></DialogFooter>
      </form></DialogContent></Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => { if (!open && !softDeleteMutation.isPending) setDeleteId(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hapus produk?</AlertDialogTitle><AlertDialogDescription>Produk akan dinonaktifkan dan dipindahkan ke Data Terhapus.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><Button variant="destructive" disabled={softDeleteMutation.isPending} onClick={() => deleteId && softDeleteMutation.mutate({ productId: deleteId })}>Hapus</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AlertDialog open={Boolean(hardDeleteId)} onOpenChange={(open) => { if (!open && !hardDeleteMutation.isPending) { setHardDeleteId(null); setHardConfirmText(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hapus permanen?</AlertDialogTitle><AlertDialogDescription>Ketik <strong>{HARD_DELETE_CONFIRMATION}</strong> untuk melanjutkan.</AlertDialogDescription></AlertDialogHeader><Input value={hardConfirmText} onChange={(e) => setHardConfirmText(e.target.value)} /><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><Button variant="destructive" disabled={hardConfirmText !== HARD_DELETE_CONFIRMATION || hardDeleteMutation.isPending} onClick={() => hardDeleteId && hardDeleteMutation.mutate({ productId: hardDeleteId })}>Hapus Permanen</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>; }
function SkeletonRows() { return <>{Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)}</>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Data produk gagal dimuat</AlertTitle><AlertDescription><Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>Coba Lagi</Button></AlertDescription></Alert>; }
function AccessDenied() { return <div><PageHeader title="Master Produk" description="Kelola master produk." /><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Akses ditolak</AlertTitle><AlertDescription>Anda tidak memiliki izin mengakses master produk.</AlertDescription></Alert></div>; }
function ensureAccess(userId: string | undefined, allowed: boolean) { if (!userId) throw new Error("Sesi pengguna tidak ditemukan."); if (!allowed) throw new Error("Anda tidak memiliki izin mengelola produk."); }
function ensureSuperAdmin(userId: string | undefined, allowed: boolean) { if (!userId) throw new Error("Sesi pengguna tidak ditemukan."); if (!allowed) throw new Error("Hanya Super Admin yang dapat melakukan tindakan ini."); }
function sanitizeSearchTerm(value: string) { return value.replaceAll(",", " ").replaceAll("(", " ").replaceAll(")", " ").replaceAll("%", "").replaceAll("*", "").trim(); }
function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const dbError = error as DbError;
    if (dbError.code === "23505") return "Nama produk pada kategori tersebut atau SKU sudah digunakan.";
    if (dbError.code === "23503") return "Kategori penjualan atau pengguna audit tidak ditemukan.";
    if (dbError.code === "23514") return "Data produk tidak memenuhi aturan validasi database.";
    if (dbError.code === "42501") return "Anda tidak memiliki izin melakukan perubahan ini.";
    if (dbError.message) return dbError.message;
    if (dbError.details) return dbError.details;
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";
}
