import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Archive, Calculator, Eye, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure, type BusinessSubunitRow } from "@/hooks/useBusinessStructure";
import { useOperationalAssets, type AssetRow, type DepreciationRow } from "@/hooks/useOperationalAssets";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { depreciationPreview, validateAssetAccounting } from "@/lib/operationalAssets";
import { formatDate, formatRupiah } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type AssetView = AssetRow & { valuation?: { accumulated_depreciation: number; book_value: number } };
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;
const empty = { subunitId: "", categoryId: "", code: "", name: "", date: today, cost: 0, residual: 0, life: 36, notes: "" };
type AssetFormState = typeof empty;
type AssetCategory = Tables<"asset_categories">;

export function OperationalAssetManager() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const structure = useBusinessStructure();
  const [asOf, setAsOf] = useState(monthStart);
  const { assets, depreciation, mutate } = useOperationalAssets(asOf);
  const [query, setQuery] = useState("");
  const [subunit, setSubunit] = useState("all");
  const [status, setStatus] = useState("active");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<AssetView | null>(null);
  const [detail, setDetail] = useState<AssetView | null>(null);
  const [open, setOpen] = useState(false);
  const categories = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("asset_categories").select("*").eq("is_active", true).is("deleted_at", null).order("name");
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => (assets.data ?? []).filter((asset) =>
    asset.record_source === "operational" &&
    (isSuperAdmin || !asset.deleted_at) &&
    (status === "all" || (status === "archived" ? Boolean(asset.deleted_at) : !asset.deleted_at)) &&
    (subunit === "all" || asset.subunit_id === subunit) &&
    `${asset.asset_code} ${asset.asset_name}`.toLowerCase().includes(query.toLowerCase())
  ), [assets.data, isSuperAdmin, query, status, subunit]);
  const legacy = (assets.data ?? []).filter((asset) => asset.record_source !== "operational");

  const submit = async () => {
    const error = validateAssetAccounting({ acquisitionCost: form.cost, residualValue: form.residual, usefulLifeMonths: form.life, acquisitionDate: form.date });
    if (error || !form.subunitId || !form.categoryId || !form.code.trim() || !form.name.trim()) return toast.error(error ?? "Lengkapi seluruh field wajib.");
    const sub = structure.activeSubunits.find((item) => item.id === form.subunitId);
    if (!sub) return toast.error("Subunit aktif tidak ditemukan.");
    try {
      await mutate.mutateAsync({
        action: editing ? "update" : "create", id: editing?.id,
        payload: {
          outlet_id: sub.outlet_id, subunit_id: sub.id, asset_category_id: form.categoryId,
          asset_code: form.code, asset_name: form.name, acquisition_date: form.date,
          acquisition_cost: form.cost, residual_value: form.residual, useful_life_months: form.life,
          depreciation_method: "straight_line", notes: form.notes, asset_status: "active",
        },
      });
      toast.success(editing ? "Aset berhasil diperbarui." : "Aset berhasil dibuat.");
      setOpen(false); setEditing(null); setForm(empty);
    } catch (reason) { toast.error(assetError(reason)); }
  };
  const act = async (action: "archive" | "restore" | "delete" | "generate", asset: AssetView) => {
    if (!window.confirm(action === "generate" ? `Posting depresiasi sampai ${asOf}?` : `Konfirmasi tindakan ${action} untuk ${asset.asset_name}?`)) return;
    try { await mutate.mutateAsync({ action, id: asset.id }); toast.success("Tindakan aset berhasil."); }
    catch (reason) { toast.error(assetError(reason)); }
  };
  const openEdit = (asset: AssetView) => {
    setEditing(asset); setForm({ subunitId: asset.subunit_id ?? "", categoryId: asset.asset_category_id, code: asset.asset_code, name: asset.asset_name, date: asset.acquisition_date, cost: Number(asset.acquisition_cost), residual: Number(asset.residual_value), life: asset.useful_life_months, notes: asset.notes ?? "" }); setOpen(true);
  };
  const summary = rows.reduce((acc, item) => ({ count: acc.count + 1, cost: acc.cost + Number(item.acquisition_cost), dep: acc.dep + Number(item.valuation?.accumulated_depreciation ?? 0), book: acc.book + Number(item.valuation?.book_value ?? item.acquisition_cost) }), { count: 0, cost: 0, dep: 0, book: 0 });

  if (assets.isLoading || structure.isLoading) return <p className="p-6 text-muted-foreground">Memuat aset…</p>;
  if (assets.error || structure.error) return <Alert variant="destructive"><AlertDescription>Aset gagal dimuat.</AlertDescription></Alert>;
  return <div className="space-y-6">
    <PageHeader title="Aset / Peralatan" description="Aset operasional per Subunit dan riwayat legacy terpisah." actions={isAdmin ? <Button onClick={() => { setEditing(null); setForm({ ...empty, subunitId: structure.activeSubunits[0]?.id ?? "", categoryId: categories.data?.[0]?.id ?? "" }); setOpen(true); }}><Plus className="mr-2 h-4 w-4"/>Tambah Aset</Button> : undefined}/>
    <Tabs defaultValue="operational">
      <TabsList><TabsTrigger value="operational">Aset Operasional</TabsTrigger>{isAdmin && <TabsTrigger value="legacy">Riwayat Legacy ({legacy.length})</TabsTrigger>}</TabsList>
      <TabsContent value="operational" className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Jumlah Aset" value={String(summary.count)}/><Metric label="Nilai Perolehan" value={formatRupiah(summary.cost)}/><Metric label="Akumulasi Depresiasi" value={formatRupiah(summary.dep)}/><Metric label="Nilai Buku" value={formatRupiah(summary.book)}/>
        </div>
        <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <Input placeholder="Cari kode atau nama…" value={query} onChange={(e) => setQuery(e.target.value)}/>
          <Select value={subunit} onValueChange={setSubunit}><SelectTrigger><SelectValue placeholder="Subunit"/></SelectTrigger><SelectContent><SelectItem value="all">Semua Subunit</SelectItem>{structure.subunits.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Aktif</SelectItem>{isSuperAdmin && <SelectItem value="archived">Diarsipkan</SelectItem>}<SelectItem value="all">Semua</SelectItem></SelectContent></Select>
          <Input type="month" value={asOf.slice(0,7)} onChange={(e) => setAsOf(`${e.target.value}-01`)}/>
        </CardContent></Card>
        <AssetTable rows={rows} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} pending={mutate.isPending} onDetail={setDetail} onEdit={openEdit} onAction={act}/>
      </TabsContent>
      <TabsContent value="legacy"><Alert><AlertDescription>Data import historis dipertahankan tanpa backfill Subunit dan tidak mengikuti engine depresiasi operasional baru.</AlertDescription></Alert><AssetTable rows={legacy} isAdmin={false} isSuperAdmin={false} pending={false} onDetail={setDetail} onEdit={() => {}} onAction={() => Promise.resolve()}/></TabsContent>
    </Tabs>
    <AssetForm open={open} setOpen={setOpen} form={form} setForm={setForm} subunits={structure.activeSubunits} categories={categories.data ?? []} preview={depreciationPreview({ acquisitionCost: form.cost, residualValue: form.residual, usefulLifeMonths: form.life, acquisitionDate: form.date })} pending={mutate.isPending} submit={submit} locked={Boolean(editing && (depreciation.data ?? []).some((d) => d.asset_id === editing.id))}/>
    <AssetDetail asset={detail} close={() => setDetail(null)} entries={(depreciation.data ?? []).filter((d) => d.asset_id === detail?.id)}/>
  </div>;
}

function AssetTable({ rows, isAdmin, isSuperAdmin, pending, onDetail, onEdit, onAction }: { rows: AssetView[]; isAdmin: boolean; isSuperAdmin: boolean; pending: boolean; onDetail: (a: AssetView) => void; onEdit: (a: AssetView) => void; onAction: (x: "archive"|"restore"|"delete"|"generate", a: AssetView) => Promise<void> }) {
  return <Card><CardContent className="pt-6">{rows.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama Aset</TableHead><TableHead>Subunit</TableHead><TableHead>Perolehan</TableHead><TableHead>Akumulasi</TableHead><TableHead>Nilai Buku</TableHead><TableHead>Status</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader><TableBody>{rows.map((a) => <TableRow key={a.id}><TableCell>{a.asset_code}</TableCell><TableCell>{a.asset_name}</TableCell><TableCell>{a.business_subunits?.name ?? "Legacy"}</TableCell><TableCell>{formatRupiah(Number(a.acquisition_cost))}</TableCell><TableCell>{formatRupiah(Number(a.valuation?.accumulated_depreciation ?? 0))}</TableCell><TableCell>{formatRupiah(Number(a.valuation?.book_value ?? a.acquisition_cost))}</TableCell><TableCell><Badge variant={a.deleted_at ? "secondary" : "default"}>{a.deleted_at ? "Diarsipkan" : "Aktif"}</Badge></TableCell><TableCell><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => onDetail(a)}><Eye className="h-4 w-4"/></Button>{isAdmin && !a.deleted_at && <><Button size="icon" variant="ghost" onClick={() => onEdit(a)}><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" disabled={pending} onClick={() => onAction("generate",a)}><Calculator className="h-4 w-4"/></Button><Button size="icon" variant="ghost" disabled={pending} onClick={() => onAction("archive",a)}><Archive className="h-4 w-4"/></Button></>}{isSuperAdmin && a.deleted_at && <><Button size="icon" variant="ghost" onClick={() => onAction("restore",a)}><RotateCcw className="h-4 w-4"/></Button><Button size="icon" variant="destructive" onClick={() => onAction("delete",a)}><Trash2 className="h-4 w-4"/></Button></>}</div></TableCell></TableRow>)}</TableBody></Table></div> : <p className="py-12 text-center text-muted-foreground">Belum ada aset yang sesuai filter.</p>}</CardContent></Card>;
}

function AssetForm({ open, setOpen, form, setForm, subunits, categories, preview, pending, submit, locked }: { open: boolean; setOpen: (value: boolean) => void; form: AssetFormState; setForm: Dispatch<SetStateAction<AssetFormState>>; subunits: BusinessSubunitRow[]; categories: AssetCategory[]; preview: { base: number; monthly: number; finalPeriod: number }; pending: boolean; submit: () => Promise<string | number | undefined>; locked: boolean }) {
  const field = (key: keyof AssetFormState, value: string | number) => setForm((old) => ({ ...old, [key]: value }));
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{locked ? "Edit Deskripsi Aset" : "Data Aset Operasional"}</DialogTitle></DialogHeader>{locked && <Alert><AlertDescription>Dasar depresiasi dan Subunit terkunci karena aset memiliki histori depresiasi.</AlertDescription></Alert>}<div className="grid gap-4 md:grid-cols-2">
    <Field label="Subunit"><Select disabled={locked} value={form.subunitId} onValueChange={(v) => field("subunitId",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{subunits.map((s)=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></Field>
    <Field label="Kategori"><Select value={form.categoryId} onValueChange={(v) => field("categoryId",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{categories.map((c)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
    <Field label="Kode Aset"><Input value={form.code} onChange={(e)=>field("code",e.target.value)}/></Field><Field label="Nama Aset"><Input value={form.name} onChange={(e)=>field("name",e.target.value)}/></Field>
    <Field label="Tanggal Perolehan"><Input disabled={locked} type="date" value={form.date} onChange={(e)=>field("date",e.target.value)}/></Field><Field label="Nilai Perolehan"><Input disabled={locked} type="number" min={0} value={form.cost} onChange={(e)=>field("cost",Number(e.target.value))}/></Field>
    <Field label="Nilai Residu"><Input disabled={locked} type="number" min={0} value={form.residual} onChange={(e)=>field("residual",Number(e.target.value))}/></Field><Field label="Umur Manfaat (bulan)"><Input disabled={locked} type="number" min={1} value={form.life} onChange={(e)=>field("life",Number(e.target.value))}/></Field>
    <Field label="Metode Depresiasi"><Input disabled value="Garis Lurus"/></Field><Field label="Depresiasi Bulanan (preview)"><Input disabled value={formatRupiah(preview.monthly)}/></Field>
    <div className="md:col-span-2"><Field label="Catatan"><Textarea value={form.notes} onChange={(e)=>field("notes",e.target.value)}/></Field></div>
  </div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Batal</Button><Button disabled={pending} onClick={submit}>Simpan</Button></DialogFooter></DialogContent></Dialog>;
}
function AssetDetail({ asset, close, entries }: { asset: AssetView | null; close: () => void; entries: DepreciationRow[] }) { return <Dialog open={Boolean(asset)} onOpenChange={(v)=>!v&&close()}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Detail Aset</DialogTitle></DialogHeader>{asset && <div className="space-y-4"><div className="grid gap-2 md:grid-cols-3"><Metric label="Nama" value={asset.asset_name}/><Metric label="Subunit" value={asset.business_subunits?.name ?? "Legacy"}/><Metric label="Tanggal Perolehan" value={formatDate(asset.acquisition_date)}/><Metric label="Dasar Depresiasi" value={formatRupiah(Number(asset.acquisition_cost)-Number(asset.residual_value))}/><Metric label="Akumulasi" value={formatRupiah(Number(asset.valuation?.accumulated_depreciation??0))}/><Metric label="Nilai Buku" value={formatRupiah(Number(asset.valuation?.book_value??asset.acquisition_cost))}/></div><div className="max-h-64 overflow-auto"><Table><TableHeader><TableRow><TableHead>Periode</TableHead><TableHead>Beban</TableHead><TableHead>Akumulasi</TableHead><TableHead>Nilai Buku</TableHead></TableRow></TableHeader><TableBody>{entries.map((e)=><TableRow key={e.id}><TableCell>{e.period_month.slice(0,7)}</TableCell><TableCell>{formatRupiah(Number(e.depreciation_amount))}</TableCell><TableCell>{formatRupiah(Number(e.accumulated_depreciation))}</TableCell><TableCell>{formatRupiah(Number(e.ending_book_value))}</TableCell></TableRow>)}</TableBody></Table></div></div>}</DialogContent></Dialog>; }
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="font-semibold">{value}</CardContent></Card>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function assetError(reason: unknown) { const message = reason instanceof Error ? reason.message : String(reason); if (/histori depresiasi|Dasar depresiasi/i.test(message)) return "Dasar depresiasi tidak dapat diubah karena aset telah memiliki histori depresiasi."; if (/foreign key|23503/i.test(message)) return "Aset tidak dapat dihapus permanen karena memiliki histori keuangan."; return message; }
