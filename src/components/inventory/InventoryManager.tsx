import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, PackagePlus, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { BomManager } from "@/components/inventory/BomManager";
import { InventoryItemManager } from "@/components/inventory/InventoryItemManager";
import { StockOpnameManager } from "@/components/inventory/StockOpnameManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { useInventory } from "@/hooks/useInventory";
import { supabase } from "@/integrations/supabase/client";
import { isLowStock, toInventoryNumber } from "@/lib/inventory";

const ALL = "all";

export function InventoryManager() {
  const queryClient = useQueryClient();
  const { user, canManageFinancialData } = useAuth();
  const { subunits } = useBusinessStructure();
  const { balances, movements, costs, isLoading, error, balancesQuery, movementsQuery, costsQuery } =
    useInventory();
  const [search, setSearch] = useState("");
  const [subunitId, setSubunitId] = useState(ALL);
  const [adjustmentItemId, setAdjustmentItemId] = useState<string | null>(null);
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");

  const subunitMap = useMemo(
    () => new Map(subunits.map((subunit) => [subunit.id, subunit.name])),
    [subunits],
  );
  const itemMap = useMemo(
    () => new Map(balances.map((item) => [item.inventory_item_id, item])),
    [balances],
  );
  const costMap = useMemo(
    () => new Map(costs.map((item) => [item.inventory_item_id, item])),
    [costs],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("id-ID");
    return balances.filter(
      (item) =>
        (subunitId === ALL || item.subunit_id === subunitId) &&
        (!term ||
          item.name?.toLocaleLowerCase("id-ID").includes(term) ||
          item.code?.toLocaleLowerCase("id-ID").includes(term)),
    );
  }, [balances, search, subunitId]);

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      const quantity = Number(adjustmentQuantity);
      if (!adjustmentItemId || !Number.isFinite(quantity) || quantity === 0) {
        throw new Error("Pilih item dan isi perubahan stok selain nol.");
      }
      const { error: mutationError } = await supabase.rpc(
        "create_inventory_adjustment",
        {
          p_inventory_item_id: adjustmentItemId,
          p_quantity_delta: quantity,
          p_notes: adjustmentNotes.trim() || undefined,
        },
      );
      if (mutationError) throw mutationError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setAdjustmentItemId(null);
      setAdjustmentQuantity("");
      setAdjustmentNotes("");
      toast.success("Penyesuaian stok berhasil dicatat.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Penyesuaian stok gagal.",
      );
    },
  });

  const retry = async () => {
    await Promise.all([balancesQuery.refetch(), movementsQuery.refetch(), costsQuery.refetch()]);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Memuat inventory…
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p>Data inventory gagal dimuat.</p>
          <Button variant="outline" onClick={() => void retry()}>
            <RefreshCcw /> Coba Lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory & Stok"
        description="Saldo berasal dari ledger pergerakan stok dan tidak dapat ditimpa langsung."
      />

      <Tabs defaultValue="stock">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="stock">Stok Saat Ini</TabsTrigger>
          <TabsTrigger value="items">Item Inventory</TabsTrigger>
          <TabsTrigger value="movements">Pergerakan</TabsTrigger>
          <TabsTrigger value="opname">Stock Opname</TabsTrigger>
          <TabsTrigger value="bom">BOM / Kebutuhan Produk</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama atau kode item…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={subunitId} onValueChange={setSubunitId}>
              <SelectTrigger><SelectValue placeholder="Semua Subunit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua Subunit</SelectItem>
                {subunits
                  .filter((subunit) => subunit.inventory_enabled)
                  .map((subunit) => (
                    <SelectItem key={subunit.id} value={subunit.id}>
                      {subunit.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader><CardTitle>Inventory Item</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead><TableHead>Kode</TableHead>
                    <TableHead>Subunit</TableHead><TableHead>Unit</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-right">WAC</TableHead>
                    <TableHead className="text-right">Nilai Inventory</TableHead>
                    <TableHead>Status</TableHead><TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length ? filtered.map((item) => (
                    <TableRow key={item.inventory_item_id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.code}</TableCell>
                      <TableCell>{subunitMap.get(item.subunit_id ?? "") ?? "—"}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right">
                        {toInventoryNumber(item.current_stock).toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right">
                        {toInventoryNumber(costMap.get(item.inventory_item_id)?.current_wac ?? 0).toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right">
                        {toInventoryNumber(costMap.get(item.inventory_item_id)?.inventory_value ?? 0).toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell>
                        {isLowStock(item) ? (
                          <Badge variant="destructive">Stok Rendah</Badge>
                        ) : <Badge variant="secondary">Aman</Badge>}
                      </TableCell>
                      <TableCell>
                        {canManageFinancialData && !item.deleted_at ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAdjustmentItemId(item.inventory_item_id)}
                          >
                            <PackagePlus /> Penyesuaian
                          </Button>
                        ) : "Lihat saja"}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={9} className="h-28 text-center text-muted-foreground">
                        Belum ada Inventory Item yang sesuai filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <Card>
            <CardHeader><CardTitle>Kelola Inventory Item</CardTitle></CardHeader>
            <CardContent><InventoryItemManager /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardHeader><CardTitle>Riwayat Pergerakan</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Waktu</TableHead><TableHead>Item</TableHead>
                    <TableHead>Jenis</TableHead><TableHead className="text-right">Delta</TableHead>
                    <TableHead>Catatan</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length ? movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>{new Date(movement.movement_at).toLocaleString("id-ID")}</TableCell>
                      <TableCell>{itemMap.get(movement.inventory_item_id)?.name ?? movement.inventory_item_id}</TableCell>
                      <TableCell>{movementLabel(movement.movement_type)}</TableCell>
                      <TableCell className="text-right">{toInventoryNumber(movement.quantity_delta).toLocaleString("id-ID")}</TableCell>
                      <TableCell>{movement.notes ?? "—"}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                      Belum ada pergerakan stok.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opname">
          <StockOpnameManager />
        </TabsContent>

        <TabsContent value="bom">
          <Card>
            <CardHeader><CardTitle>BOM / Kebutuhan Inventory Product</CardTitle></CardHeader>
            <CardContent><BomManager /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(adjustmentItemId)} onOpenChange={(open) => !open && setAdjustmentItemId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Penyesuaian Stok</DialogTitle>
            <DialogDescription>
              Gunakan angka positif untuk stok masuk dan negatif untuk stok keluar. Saldo negatif tetap ditampilkan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="number" step="0.0001" placeholder="Perubahan quantity"
              value={adjustmentQuantity}
              onChange={(event) => setAdjustmentQuantity(event.target.value)}
            />
            <Input
              placeholder="Alasan/catatan wajib secara operasional"
              value={adjustmentNotes}
              onChange={(event) => setAdjustmentNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentItemId(null)}>Batal</Button>
            <Button
              disabled={adjustmentMutation.isPending || !user}
              onClick={() => adjustmentMutation.mutate()}
            >
              {adjustmentMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              Catat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function movementLabel(type: string): string {
  switch (type) {
    case "purchase_in":
      return "Pembelian";
    case "sale_consumption":
      return "Konsumsi Penjualan";
    case "adjustment":
      return "Penyesuaian";
    case "stock_opname":
      return "Stock Opname";
    case "reversal":
      return "Pembalikan";
    case "opening":
      return "Saldo Awal";
    default:
      return type;
  }
}
