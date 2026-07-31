import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { calculateStockVariance, isValidPhysicalQuantity, toInventoryNumber } from "@/lib/inventory";

type Opname = Tables<"stock_opnames">;
type OpnameLine = Tables<"stock_opname_items">;
type Balance = Tables<"v_inventory_balances">;
type IdentifiedBalance = Balance & { inventory_item_id: string };

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export function StockOpnameManager() {
  const queryClient = useQueryClient();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { outlet, subunits } = useBusinessStructure();
  const canPost = isAdmin || isSuperAdmin;
  const [subunitId, setSubunitId] = useState("");
  const [opnameDate, setOpnameDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [physical, setPhysical] = useState<Record<string, string>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["inventory", "opnames"],
    queryFn: async () => {
      const [opnamesResult, linesResult, balancesResult] = await Promise.all([
        supabase.from("stock_opnames").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("stock_opname_items").select("*").order("line_no"),
        supabase.from("v_inventory_balances").select("*").order("name"),
      ]);
      const error = opnamesResult.error ?? linesResult.error ?? balancesResult.error;
      if (error) throw error;
      return {
        opnames: (opnamesResult.data ?? []) as Opname[],
        lines: (linesResult.data ?? []) as OpnameLine[],
        balances: (balancesResult.data ?? []) as Balance[],
      };
    },
  });

  const balances = query.data?.balances ?? [];
  const opnames = query.data?.opnames ?? [];
  const lines = useMemo(() => query.data?.lines ?? [], [query.data?.lines]);
  const availableItems = balances.filter((row): row is IdentifiedBalance =>
    Boolean(row.inventory_item_id &&
      row.subunit_id === subunitId && row.is_active && !row.deleted_at));
  const selectedLines = availableItems.filter((row) => physical[row.inventory_item_id] !== undefined);
  const detail = opnames.find((row) => row.id === detailId);
  const detailLines = useMemo(
    () => lines.filter((row) => row.stock_opname_id === detailId),
    [detailId, lines],
  );

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!outlet || !subunitId || !opnameDate) throw new Error("Outlet, Subunit, dan tanggal wajib diisi.");
      if (!selectedLines.length) throw new Error("Isi physical quantity minimal satu Inventory Item.");
      const items: Array<Pick<TablesInsert<"stock_opname_items">, "inventory_item_id" | "physical_quantity">> =
        selectedLines.map((row) => {
          const value = Number(physical[row.inventory_item_id]);
          if (!isValidPhysicalQuantity(value)) {
            throw new Error(`Physical quantity ${row.name ?? row.code} harus nol atau lebih.`);
          }
          return { inventory_item_id: row.inventory_item_id, physical_quantity: value };
        });
      const { error } = await supabase.rpc("post_stock_opname", {
        p_outlet_id: outlet.id,
        p_subunit_id: subunitId,
        p_opname_date: opnameDate,
        p_notes: notes.trim() || undefined,
        p_items: items,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory", "opnames"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "movements"] }),
      ]);
      setPhysical({}); setNotes("");
      toast.success("Stock opname berhasil diposting.");
    },
    onError: showError,
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("void_stock_opname", { p_stock_opname_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory", "opnames"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "balances"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "movements"] }),
      ]);
      toast.success("Stock opname di-void; histori dipertahankan dan efek ledger dibatalkan.");
    },
    onError: showError,
  });

  return (
    <div className="space-y-5">
      {canPost ? <Card>
        <CardHeader><CardTitle>Post Stock Opname</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={subunitId} onValueChange={(value) => {
              setSubunitId(value); setPhysical({});
            }}>
              <SelectTrigger><SelectValue placeholder="Pilih Subunit" /></SelectTrigger>
              <SelectContent>{subunits.filter((row) => row.inventory_enabled && row.is_active && !row.deleted_at)
                .map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" value={opnameDate} onChange={(event) => setOpnameDate(event.target.value)} />
            <Input placeholder="Catatan opname" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Inventory Item</TableHead><TableHead>Unit</TableHead>
                <TableHead className="text-right">System Qty</TableHead>
                <TableHead className="w-44">Physical Qty</TableHead>
                <TableHead className="text-right">Variance</TableHead></TableRow></TableHeader>
              <TableBody>
                {availableItems.map((row) => {
                  const value = physical[row.inventory_item_id];
                  const parsed = Number(value);
                  return <TableRow key={row.inventory_item_id}>
                    <TableCell>{row.name}</TableCell><TableCell>{row.unit}</TableCell>
                    <TableCell className="text-right">{toInventoryNumber(row.current_stock)}</TableCell>
                    <TableCell><Input type="number" min="0" step="0.0001"
                      aria-label={`Physical quantity ${row.name}`}
                      placeholder="Kosong = tidak dihitung" value={value ?? ""}
                      onChange={(event) => setPhysical((current) => ({
                        ...current, [row.inventory_item_id]: event.target.value,
                      }))} /></TableCell>
                    <TableCell className="text-right">
                      {value !== undefined && isValidPhysicalQuantity(parsed)
                        ? calculateStockVariance(toInventoryNumber(row.current_stock), parsed) : "—"}
                    </TableCell>
                  </TableRow>;
                })}
                {!availableItems.length ? <TableRow><TableCell colSpan={5}
                  className="h-24 text-center text-muted-foreground">
                  {subunitId ? "Belum ada Inventory Item aktif." : "Pilih Subunit untuk memulai."}
                </TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
          <Button disabled={postMutation.isPending || !selectedLines.length}
            onClick={() => postMutation.mutate()}>
            {postMutation.isPending ? <Loader2 className="animate-spin" /> : null}
            Post Atomik
          </Button>
        </CardContent>
      </Card> : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Subunit</TableHead>
            <TableHead>Status</TableHead><TableHead>Dibuat</TableHead><TableHead>Catatan</TableHead>
            <TableHead>Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {opnames.map((row) => <TableRow key={row.id}>
              <TableCell>{new Date(row.opname_date).toLocaleDateString("id-ID")}</TableCell>
              <TableCell>{subunits.find((unit) => unit.id === row.subunit_id)?.name ?? row.subunit_id}</TableCell>
              <TableCell><Badge variant={row.status === "voided" ? "destructive" : "secondary"}>
                {row.status === "voided" ? "VOID" : row.status.toUpperCase()}
              </Badge></TableCell>
              <TableCell>{new Date(row.created_at).toLocaleString("id-ID")}</TableCell>
              <TableCell>{row.notes ?? "—"}</TableCell>
              <TableCell><div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label="Lihat detail" onClick={() => setDetailId(row.id)}>
                  <Eye />
                </Button>
                {isSuperAdmin && row.status !== "voided" ? <Button size="icon" variant="ghost"
                  aria-label="Void stock opname" disabled={voidMutation.isPending}
                  onClick={() => window.confirm(
                    "Void stock opname? Histori tetap disimpan dan efek stok pada ledger akan dibatalkan.",
                  ) && voidMutation.mutate(row.id)}>
                  <RotateCcw />
                </Button> : null}
              </div></TableCell>
            </TableRow>)}
            {!opnames.length ? <TableRow><TableCell colSpan={6}
              className="h-24 text-center text-muted-foreground">
              {query.isLoading ? "Memuat…" : query.isError ? "Riwayat opname gagal dimuat." :
                "Belum ada Stock Opname."}
            </TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Detail Stock Opname</DialogTitle>
            <DialogDescription>
              Snapshot saat posting; tidak berubah mengikuti nama atau unit master terbaru.
            </DialogDescription></DialogHeader>
          {detail ? <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Tanggal: {new Date(detail.opname_date).toLocaleDateString("id-ID")}</p>
            <p>Status: {detail.status.toUpperCase()}</p>
            <p>Dibuat: {new Date(detail.created_at).toLocaleString("id-ID")}</p>
            <p>Creator: {detail.created_by ?? "—"}</p>
            {detail.voided_at ? <p>Void: {new Date(detail.voided_at).toLocaleString("id-ID")}</p> : null}
            <p>Catatan: {detail.notes ?? "—"}</p>
          </div> : null}
          <div className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Item Snapshot</TableHead><TableHead>Unit</TableHead>
              <TableHead className="text-right">System</TableHead><TableHead className="text-right">Physical</TableHead>
              <TableHead className="text-right">Variance</TableHead></TableRow></TableHeader>
              <TableBody>{detailLines.map((line) => <TableRow key={line.id}>
                <TableCell>{line.item_name_snapshot} ({line.item_code_snapshot})</TableCell>
                <TableCell>{line.unit_snapshot}</TableCell>
                <TableCell className="text-right">{line.system_quantity}</TableCell>
                <TableCell className="text-right">{line.physical_quantity}</TableCell>
                <TableCell className="text-right">{line.variance}</TableCell>
              </TableRow>)}</TableBody></Table>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Operasi Stock Opname gagal.");
}
