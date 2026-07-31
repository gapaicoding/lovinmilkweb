import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type InventoryItem = Tables<"inventory_items">;
type StatusFilter = "active" | "inactive" | "archived" | "all";

interface FormState {
  subunitId: string;
  code: string;
  name: string;
  unit: string;
  minimumStock: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  subunitId: "", code: "", name: "", unit: "pcs",
  minimumStock: "0", notes: "", isActive: true,
};

export function InventoryItemManager() {
  const queryClient = useQueryClient();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { outlet, subunits } = useBusinessStructure();
  const [status, setStatus] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const canManage = isAdmin || isSuperAdmin;

  const itemsQuery = useQuery({
    queryKey: ["inventory", "items", status],
    queryFn: async (): Promise<InventoryItem[]> => {
      let query = supabase.from("inventory_items").select("*").order("name");
      if (status === "archived") query = query.not("deleted_at", "is", null);
      else {
        query = query.is("deleted_at", null);
        if (status !== "all") query = query.eq("is_active", status === "active");
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("id-ID");
    return (itemsQuery.data ?? []).filter((item) =>
      !term || item.name.toLocaleLowerCase("id-ID").includes(term)
      || item.code.toLocaleLowerCase("id-ID").includes(term));
  }, [itemsQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !outlet || !form.subunitId || !form.code.trim()
        || !form.name.trim() || !form.unit.trim()) {
        throw new Error("Subunit, kode, nama, dan unit wajib diisi.");
      }
      const minimumStock = Number(form.minimumStock);
      if (!Number.isFinite(minimumStock) || minimumStock < 0) {
        throw new Error("Minimum stok harus nol atau lebih.");
      }
      const payload = {
        outlet_id: outlet.id,
        subunit_id: form.subunitId,
        code: form.code.trim(),
        name: form.name.trim(),
        unit: form.unit.trim(),
        minimum_stock: minimumStock,
        notes: form.notes.trim() || null,
        is_active: form.isActive,
        updated_by: user.id,
      };
      const result = editing
        ? await supabase.from("inventory_items").update(payload).eq("id", editing.id)
        : await supabase.from("inventory_items").insert({ ...payload, created_by: user.id });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setDialogOpen(false);
      toast.success(editing ? "Inventory Item diperbarui." : "Inventory Item dibuat.");
    },
    onError: showError,
  });

  const lifecycleMutation = useMutation({
    mutationFn: async ({ item, action }: {
      item: InventoryItem; action: "archive" | "restore" | "delete";
    }) => {
      if (!user) throw new Error("Sesi pengguna tidak tersedia.");
      if (action === "delete") {
        const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
        if (error) throw error;
        return;
      }
      if (action === "archive") {
        const { error } = await supabase.rpc("archive_inventory_item", {
          p_inventory_item_id: item.id,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("inventory_items").update(
        { deleted_at: null, deleted_by: null, updated_by: user.id },
      ).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(variables.action === "archive" ? "Item diarsipkan."
        : variables.action === "restore" ? "Item dipulihkan." : "Item dihapus permanen.");
    },
    onError: (error) => showError(
      error, "Item yang memiliki histori ledger, BOM, atau opname tidak dapat dihapus permanen.",
    ),
  });

  const openCreate = () => {
    setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true);
  };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      subunitId: item.subunit_id, code: item.code, name: item.name,
      unit: item.unit, minimumStock: String(item.minimum_stock),
      notes: item.notes ?? "", isActive: item.is_active,
    });
    setDialogOpen(true);
  };
  const act = (item: InventoryItem, action: "archive" | "restore" | "delete") => {
    const message = action === "archive" ? `Arsipkan ${item.name}?`
      : action === "restore" ? `Pulihkan ${item.name}?`
      : `Hapus permanen ${item.name}? Tindakan ini ditolak bila item mempunyai histori.`;
    if (window.confirm(message)) lifecycleMutation.mutate({ item, action });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input placeholder="Cari item…" value={search}
          onChange={(event) => setSearch(event.target.value)} />
        <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="inactive">Nonaktif</SelectItem>
            <SelectItem value="all">Semua Current</SelectItem>
            {isSuperAdmin ? <SelectItem value="archived">Diarsipkan</SelectItem> : null}
          </SelectContent>
        </Select>
        {canManage ? <Button onClick={openCreate}><Plus /> Tambah Item</Button> : null}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Kode</TableHead>
            <TableHead>Subunit</TableHead><TableHead>Unit</TableHead>
            <TableHead>Minimum</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell><TableCell>{item.code}</TableCell>
                <TableCell>{subunits.find((row) => row.id === item.subunit_id)?.name ?? "—"}</TableCell>
                <TableCell>{item.unit}</TableCell><TableCell>{item.minimum_stock}</TableCell>
                <TableCell><div className="flex gap-1">
                  {!item.deleted_at && canManage ? <>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(item)} aria-label="Edit">
                      <Pencil />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => act(item, "archive")} aria-label="Arsipkan">
                      <Archive />
                    </Button>
                  </> : null}
                  {item.deleted_at && isSuperAdmin ? <>
                    <Button size="icon" variant="ghost" onClick={() => act(item, "restore")} aria-label="Pulihkan">
                      <RotateCcw />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => act(item, "delete")} aria-label="Hapus permanen">
                      <Trash2 />
                    </Button>
                  </> : null}
                </div></TableCell>
              </TableRow>
            ))}
            {!visibleItems.length ? <TableRow><TableCell colSpan={6} className="h-24 text-center">
              {itemsQuery.isLoading ? "Memuat…" : "Belum ada Inventory Item."}
            </TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} Inventory Item</DialogTitle>
            <DialogDescription>Ownership mengikuti Subunit dengan inventory aktif.</DialogDescription>
          </DialogHeader>
          <Select value={form.subunitId} onValueChange={(value) => setForm({ ...form, subunitId: value })}>
            <SelectTrigger><SelectValue placeholder="Pilih Subunit" /></SelectTrigger>
            <SelectContent>{subunits.filter((row) => row.inventory_enabled && row.is_active && !row.deleted_at)
              .map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Kode" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <Input type="number" min="0" step="0.0001" placeholder="Minimum stok"
              value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
          </div>
          <Input placeholder="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.isActive}
            onCheckedChange={(value) => setForm({ ...form, isActive: value })} /> Aktif</label>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(undefined)}>
              {saveMutation.isPending ? <Loader2 className="animate-spin" /> : null} Simpan
            </Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function showError(error: unknown, fallback = "Operasi Inventory Item gagal.") {
  toast.error(error instanceof Error ? error.message : fallback);
}
