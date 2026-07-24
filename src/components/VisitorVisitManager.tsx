import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Route } from "@/routes/_authenticated/kunjungan";
import { Loader2, Plus, Search, ShoppingBag, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import {
  formatJakartaDateTime,
  formatJakartaTime,
  formatVisitDuration,
  jakartaToday,
  parseVisitPage,
  type VisitorSearchResult,
  type VisitorVisitRow,
} from "@/lib/visitor";
import { formatRupiah } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { VisitorStatusBadge } from "@/components/visitor/VisitorStatusBadge";
import { VisitorDateFilter } from "@/components/visitor/VisitorDateFilter";
import {
  resolveVisitorDateRange,
  normalizeVisitorDateFilter,
  type VisitorDateFilterValue,
} from "@/lib/visitorDatePeriod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const PAGE_SIZE = 15;
type Product = Pick<Tables<"products">, "id" | "name" | "unit" | "selling_price">;
interface PurchaseItem {
  product_id: string;
  quantity: number;
}

export function VisitorVisitManager() {
  const { canManageVisitorVisits } = useAuth();
  const queryClient = useQueryClient();
  const dateFilter = normalizeVisitorDateFilter(Route.useSearch());
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [search, setSearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<VisitorVisitRow | null>(null);
  const [checkoutVisit, setCheckoutVisit] = useState<VisitorVisitRow | null>(null);
  const [visitorSearch, setVisitorSearch] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorSearchResult | null>(null);
  const [createNew, setCreateNew] = useState(true);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([{ product_id: "", quantity: 1 }]);

  const summaryActiveQuery = useVisitQuery("active", "", 1, { period: "all" });
  const summaryHistoryQuery = useVisitQuery("history", "", 1, { period: "all" });
  const activeQuery = useVisitQuery("active", search, 1, dateFilter);
  const historyQuery = useVisitQuery("history", search, historyPage, dateFilter);
  const updateDateFilter = (next: VisitorDateFilterValue) => {
    setHistoryPage(1);
    void navigate({ search: next });
  };
  const productsQuery = useQuery({
    queryKey: ["products", "visitor-options"],
    enabled: canManageVisitorVisits && (formOpen || Boolean(addingTo)),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, selling_price")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const visitorSearchQuery = useQuery({
    queryKey: ["visitor-search", visitorSearch.trim()],
    enabled: formOpen && !createNew && visitorSearch.trim().length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<VisitorSearchResult[]> => {
      const { data, error } = await supabase.rpc("search_operational_visitors", {
        p_query: visitorSearch.trim(),
        p_limit: 10,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const productMap = useMemo(
    () => new Map((productsQuery.data ?? []).map((product) => [product.id, product])),
    [productsQuery.data],
  );
  const total = items.reduce((sum, item) => {
    const product = productMap.get(item.product_id);
    return sum + item.quantity * Number(product?.selling_price ?? 0);
  }, 0);

  const invalidateVisitorData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["visitor-visits"] }),
      queryClient.invalidateQueries({ queryKey: ["visitors"] }),
      queryClient.invalidateQueries({ queryKey: ["sales"] }),
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("dashboard-"),
      }),
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).includes("product"),
      }),
    ]);
  };

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const payload = buildItems(items, productMap);
      if (addingTo) {
        const { error } = await supabase.rpc("add_visitor_purchase", {
          p_visit_id: addingTo.id,
          p_items: payload,
        });
        if (error) throw error;
        return;
      }
      if (!createNew && !selectedVisitor) throw new Error("Pilih pengunjung lama.");
      if (createNew && fullName.trim().length < 2) throw new Error("Nama pengunjung wajib diisi.");
      if (selectedVisitor?.has_active_visit) {
        throw new Error("Pengunjung masih berada di lokasi. Gunakan Tambah Pembelian.");
      }
      const { error } = await supabase.rpc("record_visitor_purchase", {
        p_items: payload,
        p_visitor_id: createNew ? undefined : selectedVisitor?.id,
        p_full_name: createNew ? fullName.trim() : undefined,
        p_phone: createNew ? phone.trim() : undefined,
        p_visit_notes: notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(
        addingTo ? "Pembelian berhasil ditambahkan." : "Kunjungan dan penjualan berhasil dicatat.",
      );
      closeForm();
      await invalidateVisitorData();
    },
    onError: (error: Error) => toast.error("Gagal menyimpan data.", { description: error.message }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase.rpc("check_out_visitor", { p_visit_id: visitId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Pengunjung berhasil ditandai pulang.");
      setCheckoutVisit(null);
      await invalidateVisitorData();
    },
    onError: (error: Error) =>
      toast.error("Gagal menandai pulang.", { description: error.message }),
  });

  const openNew = () => {
    resetForm();
    setFormOpen(true);
  };
  const openAdd = (visit: VisitorVisitRow) => {
    resetForm();
    setAddingTo(visit);
  };
  const closeForm = () => {
    setFormOpen(false);
    setAddingTo(null);
    resetForm();
  };
  const resetForm = () => {
    setVisitorSearch("");
    setSelectedVisitor(null);
    setCreateNew(true);
    setFullName("");
    setPhone("");
    setNotes("");
    setItems([{ product_id: "", quantity: 1 }]);
  };

  if (!canManageVisitorVisits) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>Role Anda tidak dapat mengelola kunjungan.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kunjungan Pengunjung"
        description="Catat pengunjung, pembelian, waktu masuk, dan waktu pulang."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Catat Pengunjung
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard title="Sedang Berkunjung" value={summaryActiveQuery.data?.total ?? 0} />
        <SummaryCard
          title="Pengunjung Hari Ini"
          value={
            (summaryActiveQuery.data?.rows ?? []).filter(isToday).length +
            (summaryHistoryQuery.data?.rows ?? []).filter(isToday).length
          }
        />
        <SummaryCard
          title="Sudah Pulang Hari Ini"
          value={
            (summaryHistoryQuery.data?.rows ?? []).filter(
              (row) => row.check_out_at && jakartaDate(row.check_out_at) === jakartaToday(),
            ).length
          }
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama, kode, atau nomor telepon..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setHistoryPage(1);
                }}
              />
            </div>
            <VisitorDateFilter
              idPrefix="visit-list"
              value={dateFilter}
              onChange={updateDateFilter}
              disabled={activeQuery.isFetching || historyQuery.isFetching}
            />
          </div>
          <Tabs value={tab} onValueChange={(value) => setTab(value as "active" | "history")}>
            <TabsList>
              <TabsTrigger value="active">Sedang Berkunjung</TabsTrigger>
              <TabsTrigger value="history">Riwayat Kunjungan</TabsTrigger>
            </TabsList>
            <TabsContent value="active">
              <VisitTable
                rows={activeQuery.data?.rows ?? []}
                loading={activeQuery.isLoading}
                active
                filtered={dateFilter.period !== "all" || Boolean(search.trim())}
                onAdd={openAdd}
                onCheckout={setCheckoutVisit}
              />
            </TabsContent>
            <TabsContent value="history">
              <VisitTable
                rows={historyQuery.data?.rows ?? []}
                loading={historyQuery.isLoading}
                filtered={dateFilter.period !== "all" || Boolean(search.trim())}
              />
              <Pagination
                page={historyPage}
                total={historyQuery.data?.total ?? 0}
                onPage={setHistoryPage}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={formOpen || Boolean(addingTo)}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{addingTo ? "Tambah Pembelian" : "Catat Pengunjung"}</DialogTitle>
            <DialogDescription>
              {addingTo
                ? `${addingTo.visitor_code} · ${addingTo.full_name}`
                : "Kunjungan dan sales disimpan atomik oleh database."}
            </DialogDescription>
          </DialogHeader>
          {!addingTo ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={createNew ? "default" : "outline"}
                  onClick={() => {
                    setCreateNew(true);
                    setSelectedVisitor(null);
                  }}
                >
                  Pengunjung Baru
                </Button>
                <Button
                  type="button"
                  variant={!createNew ? "default" : "outline"}
                  onClick={() => setCreateNew(false)}
                >
                  Cari Pengunjung Lama
                </Button>
              </div>
              {createNew ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nama pengunjung">
                    <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </Field>
                  <Field label="Nomor telepon (opsional)">
                    <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </Field>
                </div>
              ) : (
                <div className="space-y-2">
                  <Field label="Cari nama, kode, atau telepon">
                    <Input
                      value={visitorSearch}
                      onChange={(event) => {
                        setVisitorSearch(event.target.value);
                        setSelectedVisitor(null);
                      }}
                    />
                  </Field>
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                    {visitorSearchQuery.isLoading ? (
                      <Skeleton className="h-12" />
                    ) : (
                      (visitorSearchQuery.data ?? []).map((visitor) => (
                        <button
                          type="button"
                          key={visitor.id}
                          onClick={() => setSelectedVisitor(visitor)}
                          className={`w-full rounded-md border p-2 text-left text-sm ${selectedVisitor?.id === visitor.id ? "border-primary bg-primary/10" : ""}`}
                        >
                          <div className="font-medium">
                            {visitor.visitor_code} · {visitor.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {visitor.phone || "Tanpa telepon"}{" "}
                            {visitor.has_active_visit ? "· Sedang Berkunjung" : ""}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              <Field label="Catatan kunjungan (opsional)">
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>
            </div>
          ) : null}

          <PurchaseItems items={items} setItems={setItems} products={productsQuery.data ?? []} />
          <div className="rounded-lg bg-muted p-3 text-right font-semibold">
            Total: {formatRupiah(total)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>
              Batal
            </Button>
            <Button
              disabled={purchaseMutation.isPending || productsQuery.isLoading}
              onClick={() => purchaseMutation.mutate()}
            >
              {purchaseMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShoppingBag className="mr-2 h-4 w-4" />
              )}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(checkoutVisit)}
        onOpenChange={(open) => {
          if (!open) setCheckoutVisit(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tandai pengunjung ini sudah pulang?</AlertDialogTitle>
            <AlertDialogDescription>
              {checkoutVisit?.visitor_code} · {checkoutVisit?.full_name}
              <br />
              Masuk {checkoutVisit ? formatJakartaDateTime(checkoutVisit.check_in_at) : ""} ·{" "}
              {checkoutVisit ? formatVisitDuration(checkoutVisit.check_in_at) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <Button
              disabled={checkoutMutation.isPending}
              onClick={() => checkoutVisit && checkoutMutation.mutate(checkoutVisit.id)}
            >
              {checkoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tandai Pulang
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useVisitQuery(
  status: "active" | "history",
  search: string,
  page: number,
  dateFilter: VisitorDateFilterValue,
) {
  const range = resolveVisitorDateRange(dateFilter);
  return useQuery({
    queryKey: [
      "visitor-visits",
      status,
      search.trim(),
      dateFilter.period,
      dateFilter.from,
      dateFilter.to,
      page,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_visitor_visits", {
        p_status: status,
        p_query: search.trim(),
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
        p_page: page,
        p_page_size: PAGE_SIZE,
      });
      if (error) throw error;
      return parseVisitPage(data);
    },
  });
}

function VisitTable({
  rows,
  loading,
  active = false,
  filtered = false,
  onAdd,
  onCheckout,
}: {
  rows: VisitorVisitRow[];
  loading: boolean;
  active?: boolean;
  filtered?: boolean;
  onAdd?: (row: VisitorVisitRow) => void;
  onCheckout?: (row: VisitorVisitRow) => void;
}) {
  if (loading)
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  if (!rows.length)
    return (
      <EmptyState
        title={
          filtered
            ? "Tidak ada kunjungan pada periode ini"
            : active
              ? "Belum ada pengunjung aktif"
              : "Riwayat kunjungan belum tersedia"
        }
        description={
          filtered
            ? "Coba pilih periode lain atau ubah kata pencarian."
            : "Data akan tampil setelah transaksi kunjungan dicatat."
        }
      />
    );
  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pengunjung</TableHead>
            <TableHead>Waktu</TableHead>
            <TableHead>Produk</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {row.visitor_code} · {row.phone || "—"}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                <div>
                  {formatJakartaTime(row.check_in_at)}
                  {row.check_out_at ? ` – ${formatJakartaTime(row.check_out_at)}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatVisitDuration(row.check_in_at, row.check_out_at)}
                </div>
              </TableCell>
              <TableCell>
                <div className="max-w-xs truncate">
                  {row.products.map((product) => product.name).join(", ") || "—"}
                </div>
              </TableCell>
              <TableCell className="text-right">{row.total_quantity}</TableCell>
              <TableCell className="text-right">{formatRupiah(row.total_amount)}</TableCell>
              <TableCell>
                <VisitorStatusBadge checkedOut={Boolean(row.check_out_at)} />
              </TableCell>
              <TableCell className="text-right">
                {active ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => onAdd?.(row)}>
                      Tambah Pembelian
                    </Button>
                    <Button size="sm" onClick={() => onCheckout?.(row)}>
                      Tandai Pulang
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">{formatJakartaDateTime(row.check_in_at)}</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PurchaseItems({
  items,
  setItems,
  products,
}: {
  items: PurchaseItem[];
  setItems: (items: PurchaseItem[]) => void;
  products: Product[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Produk yang dibeli</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setItems([...items, { product_id: "", quantity: 1 }])}
        >
          Tambah Baris
        </Button>
      </div>
      {items.map((item, index) => {
        const selected = products.find((product) => product.id === item.product_id);
        return (
          <div
            key={index}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_120px_150px_auto]"
          >
            <Select
              value={item.product_id}
              onValueChange={(value) =>
                setItems(
                  items.map((current, i) =>
                    i === index ? { ...current, product_id: value } : current,
                  ),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih produk" />
              </SelectTrigger>
              <SelectContent>
                {products
                  .filter(
                    (product) =>
                      product.id === item.product_id ||
                      !items.some((current) => current.product_id === product.id),
                  )
                  .map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} · {product.unit}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0.01}
              step="any"
              value={item.quantity}
              aria-label="Quantity"
              onChange={(event) =>
                setItems(
                  items.map((current, i) =>
                    i === index ? { ...current, quantity: Number(event.target.value) } : current,
                  ),
                )
              }
            />
            <div className="flex items-center text-sm">
              {formatRupiah(Number(selected?.selling_price ?? 0))}
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={items.length === 1}
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              Hapus
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function buildItems(items: PurchaseItem[], products: Map<string, Product>): Json {
  if (
    !items.length ||
    items.some((item) => !item.product_id || !Number.isFinite(item.quantity) || item.quantity <= 0)
  ) {
    throw new Error("Pilih produk dan isi quantity lebih dari nol.");
  }
  if (new Set(items.map((item) => item.product_id)).size !== items.length)
    throw new Error("Produk tidak boleh duplikat.");
  return items.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: Number(products.get(item.product_id)?.selling_price ?? -1),
  }));
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-2xl font-semibold">
          <UserRoundCheck className="h-5 w-5 text-primary" />
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Sebelumnya
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Berikutnya
      </Button>
    </div>
  );
}
function jakartaDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function isToday(row: VisitorVisitRow): boolean {
  return jakartaDate(row.check_in_at) === jakartaToday();
}
