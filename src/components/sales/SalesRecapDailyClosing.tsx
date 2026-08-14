import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { CurrencyInput } from "@/components/CurrencyInput";
import { SalesRecapSummaryCards } from "@/components/sales/SalesRecapSummaryCards";
import { SalesRecapStatusBadge } from "@/components/sales/SalesRecapPeriodTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { calculateClosingPreview, closingDraftFromRow, DEPOSIT_METHODS, type DepositMethod, type SalesDailyClosingDraft, type SalesRecapDailyRow } from "@/lib/salesRecap";

interface Props {
  row: SalesRecapDailyRow;
  canValidate: boolean;
  isMutating: boolean;
  onSave: (draft: SalesDailyClosingDraft) => Promise<void>;
  onValidateSales: () => Promise<void>;
  onValidateCash: () => Promise<void>;
}

export function SalesRecapDailyClosing({ row, canValidate, isMutating, onSave, onValidateSales, onValidateCash }: Props) {
  const [draft, setDraft] = useState(() => closingDraftFromRow(row));
  useEffect(() => setDraft(closingDraftFromRow(row)), [row]);
  const preview = useMemo(() => calculateClosingPreview(draft, row.system_total_sales), [draft, row.system_total_sales]);
  const set = <K extends keyof SalesDailyClosingDraft>(key: K, value: SalesDailyClosingDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const mismatch = row.subunit_variance !== 0;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><SalesRecapStatusBadge status={row.overall_status} /><span className="text-sm text-muted-foreground">Revisi transaksi {row.current_revision}</span></div></div>
    {row.sales_validated_at && !row.sales_validation_is_current ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Rekap perlu divalidasi ulang</AlertTitle><AlertDescription>Data transaksi atau isi closing berubah setelah validasi terakhir ({formatDateTime(row.sales_validated_at)}).</AlertDescription></Alert> : null}
    {mismatch ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Rekonsiliasi sistem bermasalah</AlertTitle><AlertDescription>Total Lovin + Arayya berbeda {formatRupiah(row.subunit_variance)} dari Total Sales. Validasi diblokir.</AlertDescription></Alert> : null}
    <SalesRecapSummaryCards row={row} />

    <Card><CardHeader><CardTitle>Informasi Closing</CardTitle><CardDescription>Nilai pengunjung sistem hanya referensi; Nilai Rekap adalah angka final harian.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <TextField label="Petugas Kasir" value={draft.cashier_name ?? ""} onChange={(value) => set("cashier_name", value || null)} />
      <CountField label="Transaksi Membership" value={draft.membership_transaction_count} onChange={(value) => set("membership_transaction_count", value)} />
      <CountField label="Transaksi Kupon/Promo" value={draft.promo_transaction_count} onChange={(value) => set("promo_transaction_count", value)} />
      <CountField label="Pengunjung Dewasa" helper={`Sistem: ${row.visitor_system_adult ?? "belum tersedia"}`} value={draft.adult_visitors} onChange={(value) => set("adult_visitors", value)} />
      <CountField label="Pengunjung Anak" helper={`Sistem: ${row.visitor_system_child ?? "belum tersedia"}`} value={draft.child_visitors} onChange={(value) => set("child_visitors", value)} />
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Rekap Pembayaran</CardTitle><CardDescription>Rincian kanal pembayaran harus sama dengan Total Sales sistem.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MoneyField label="QRIS DRetail" value={draft.qris_dretail} onChange={(v) => set("qris_dretail", v)} /><MoneyField label="QRIS Dinamis BCA" value={draft.qris_dynamic_bca} onChange={(v) => set("qris_dynamic_bca", v)} />
      <MoneyField label="QRIS Statis BCA" value={draft.qris_static_bca} onChange={(v) => set("qris_static_bca", v)} /><MoneyField label="Debit EDC BCA" value={draft.debit_edc_bca} onChange={(v) => set("debit_edc_bca", v)} />
      <MoneyField label="QRIS Statis BRI" value={draft.qris_static_bri} onChange={(v) => set("qris_static_bri", v)} /><MoneyField label="Cash" value={draft.cash_payment} onChange={(v) => set("cash_payment", v)} />
    </div><Reconciliation totalLabel="Total Pembayaran" total={preview.paymentTotal} system={row.system_total_sales} variance={preview.paymentVariance} /></CardContent></Card>

    <Card><CardHeader><CardTitle>Jenis Transaksi</CardTitle><CardDescription>Dine In, Take Away, dan Reservasi harus merekonsiliasi Total Sales.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-3">
      <MoneyField label="Dine In" value={draft.dine_in_sales} onChange={(v) => set("dine_in_sales", v)} /><MoneyField label="Take Away" value={draft.takeaway_sales} onChange={(v) => set("takeaway_sales", v)} /><MoneyField label="Reservasi" value={draft.reservation_sales} onChange={(v) => set("reservation_sales", v)} />
    </div><Reconciliation totalLabel="Total Jenis Transaksi" total={preview.serviceTypeTotal} system={row.system_total_sales} variance={preview.serviceTypeVariance} /></CardContent></Card>

    <Card><CardHeader><CardTitle>Closing Kas</CardTitle><CardDescription>Expected Cash Akhir = Cash Awal + Cash Sales − Uang Disetor.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MoneyField label="Uang Cash Awal (Buka)" value={draft.cash_opening} onChange={(v) => set("cash_opening", v)} /><MoneyField label="Cash Sales (otomatis dari pembayaran)" value={draft.cash_payment} onChange={() => undefined} disabled />
      <MoneyField label="Uang Cash Disetor" value={draft.cash_deposited} onChange={(v) => set("cash_deposited", v)} />
      <div className="space-y-2"><Label>Metode Setor</Label><Select value={draft.deposit_method ?? undefined} onValueChange={(value) => set("deposit_method", value as DepositMethod)}><SelectTrigger><SelectValue placeholder="Pilih metode" /></SelectTrigger><SelectContent>{DEPOSIT_METHODS.map((method) => <SelectItem value={method} key={method}>{method}</SelectItem>)}</SelectContent></Select></div>
      <MoneyField label="Uang Cash Akhir Aktual (Tutup)" value={draft.cash_closing_actual} onChange={(v) => set("cash_closing_actual", v)} />
    </div><div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"><Metric label="Expected Cash Akhir" value={preview.expectedCashClosing} /><Metric label="Cash Aktual" value={draft.cash_closing_actual ?? 0} /><Metric label="Selisih Kas" value={preview.cashVariance ?? 0} good={preview.cashVariance === 0} /></div></CardContent></Card>

    <Card><CardHeader><CardTitle>Catatan Internal</CardTitle></CardHeader><CardContent><Textarea value={draft.notes ?? ""} onChange={(event) => set("notes", event.target.value || null)} maxLength={1000} placeholder="Catatan closing (opsional)" /></CardContent></Card>

    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" disabled={isMutating} onClick={() => void onSave(draft)}>{isMutating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Simpan Draft</Button>
      {canValidate ? <Button variant="secondary" disabled={isMutating || mismatch} onClick={() => void onSave(draft).then(onValidateSales)}><CheckCircle2 className="mr-2 h-4 w-4" />Validasi Sales</Button> : null}
      {canValidate ? <Button disabled={isMutating || !row.sales_validation_is_current} onClick={() => void onValidateCash()}><CheckCircle2 className="mr-2 h-4 w-4" />Validasi Cash Akhir</Button> : null}
    </div>
  </div>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function CountField({ label, helper, value, onChange }: { label: string; helper?: string; value: number | null; onChange: (value: number | null) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input type="number" min={0} step={1} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Math.max(0, Number(event.target.value)))} />{helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}</div>; }
function MoneyField({ label, value, onChange, disabled = false }: { label: string; value: number | null; onChange: (value: number) => void; disabled?: boolean }) { return <fieldset className="space-y-2" disabled={disabled}><Label>{label}</Label><CurrencyInput value={value ?? undefined} onChange={onChange} /></fieldset>; }
function Metric({ label, value, good }: { label: string; value: number; good?: boolean }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`font-semibold ${good ? "text-green-700 dark:text-green-400" : ""}`}>{formatRupiah(value)}</p></div>; }
function Reconciliation({ totalLabel, total, system, variance }: { totalLabel: string; total: number; system: number; variance: number }) { return <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"><Metric label={totalLabel} value={total} /><Metric label="Total Sales Sistem" value={system} /><Metric label="Selisih" value={variance} good={variance === 0} /></div>; }
