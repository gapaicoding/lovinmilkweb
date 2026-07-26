import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/actual/ActualModuleUi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  actualClient,
  getActualDataErrorMessage,
  toFiniteNumber,
  toNullableText,
} from "@/lib/actualData";
import { formatDate, formatRupiah } from "@/lib/format";

interface TaxRow {
  id: string;
  period_start: string;
  period_end: string;
  tax_type: string;
  amount: number | string;
  status: string;
  payment_date: string | null;
  notes: string | null;
}

interface DistributionRow {
  id: string;
  distribution_date: string;
  amount: number | string;
  recipient: string | null;
  distribution_type: string;
  status: string;
  notes: string | null;
}

export function FinanceEntryManager({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tax, setTax] = useState({
    type: "pajak_penghasilan",
    amount: 0,
    paymentDate: "",
    notes: "",
  });
  const [distribution, setDistribution] = useState({
    date: endDate,
    amount: 0,
    recipient: "",
    type: "dividend",
    notes: "",
  });

  const entriesQuery = useQuery({
    queryKey: ["actual-finance", "entries", startDate, endDate],
    queryFn: async () => {
      const [taxResult, distributionResult] = await Promise.all([
        actualClient
          .from<TaxRow>("tax_entries")
          .select("id,period_start,period_end,tax_type,amount,status,payment_date,notes")
          .lte("period_start", endDate)
          .gte("period_end", startDate)
          .is("deleted_at", null)
          .order("period_start", { ascending: false }),
        actualClient
          .from<DistributionRow>("owner_distributions")
          .select("id,distribution_date,amount,recipient,distribution_type,status,notes")
          .gte("distribution_date", startDate)
          .lte("distribution_date", endDate)
          .is("deleted_at", null)
          .order("distribution_date", { ascending: false }),
      ]);
      const error = taxResult.error ?? distributionResult.error;
      if (error) throw error;
      return { taxes: taxResult.data ?? [], distributions: distributionResult.data ?? [] };
    },
  });

  const mutation = useMutation({
    mutationFn: async (
      action:
        | { type: "add-tax" }
        | { type: "add-distribution" }
        | { type: "archive-tax"; id: string }
        | { type: "archive-distribution"; id: string },
    ) => {
      if (action.type === "add-tax") {
        if (!Number.isFinite(tax.amount) || tax.amount < 0)
          throw new Error("Nilai pajak tidak valid.");
        const { error } = await actualClient.from("tax_entries").insert({
          import_batch_id: null,
          period_start: startDate,
          period_end: endDate,
          tax_type: tax.type.trim(),
          amount: tax.amount,
          status: tax.paymentDate ? "paid" : "recorded",
          payment_date: toNullableText(tax.paymentDate),
          notes: toNullableText(tax.notes),
          source_reference: "website",
          record_source: "operational",
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
        if (error) throw error;
        return;
      }
      if (action.type === "add-distribution") {
        if (!Number.isFinite(distribution.amount) || distribution.amount <= 0)
          throw new Error("Nilai distribusi harus lebih dari nol.");
        const { error } = await actualClient.from("owner_distributions").insert({
          import_batch_id: null,
          distribution_date: distribution.date,
          amount: distribution.amount,
          recipient: toNullableText(distribution.recipient),
          distribution_type: distribution.type,
          status: "recorded",
          notes: toNullableText(distribution.notes),
          source_reference: "website",
          record_source: "operational",
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
        if (error) throw error;
        return;
      }
      const table =
        action.type === "archive-tax" ? "tax_entries" : "owner_distributions";
      const { error } = await actualClient
        .from(table)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .eq("id", action.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Input keuangan berhasil diperbarui.");
      setTax({ type: "pajak_penghasilan", amount: 0, paymentDate: "", notes: "" });
      setDistribution({
        date: endDate,
        amount: 0,
        recipient: "",
        type: "dividend",
        notes: "",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["actual-finance"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error: unknown) =>
      toast.error("Input keuangan gagal diproses.", {
        description: getActualDataErrorMessage(error),
      }),
  });

  return (
    <section className="grid gap-4 xl:grid-cols-2" aria-label="Input keuangan operasional">
      <Card>
        <CardHeader><CardTitle>Pajak</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="tax-type" label="Jenis pajak">
              <Input id="tax-type" value={tax.type} onChange={(event) => setTax({ ...tax, type: event.target.value })} />
            </FormField>
            <FormField id="tax-amount" label="Nilai pajak">
              <Input id="tax-amount" type="number" min={0} value={tax.amount} onChange={(event) => setTax({ ...tax, amount: Number(event.target.value) })} />
            </FormField>
            <FormField id="tax-payment-date" label="Tanggal pembayaran (opsional)">
              <Input id="tax-payment-date" type="date" value={tax.paymentDate} onChange={(event) => setTax({ ...tax, paymentDate: event.target.value })} />
            </FormField>
            <FormField id="tax-notes" label="Catatan">
              <Textarea id="tax-notes" value={tax.notes} onChange={(event) => setTax({ ...tax, notes: event.target.value })} />
            </FormField>
          </div>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: "add-tax" })}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Tambah Pajak
          </Button>
          <EntryList rows={(entriesQuery.data?.taxes ?? []).map((row) => ({
            id: row.id, label: `${row.tax_type} · ${formatDate(row.period_start)}`, amount: toFiniteNumber(row.amount),
          }))} onArchive={(id) => mutation.mutate({ type: "archive-tax", id })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dividen / Distribusi</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="distribution-date" label="Tanggal">
              <Input id="distribution-date" type="date" value={distribution.date} onChange={(event) => setDistribution({ ...distribution, date: event.target.value })} />
            </FormField>
            <FormField id="distribution-amount" label="Nilai">
              <Input id="distribution-amount" type="number" min={0} value={distribution.amount} onChange={(event) => setDistribution({ ...distribution, amount: Number(event.target.value) })} />
            </FormField>
            <FormField id="distribution-type" label="Jenis">
              <Select value={distribution.type} onValueChange={(value) => setDistribution({ ...distribution, type: value })}>
                <SelectTrigger id="distribution-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dividend">Dividen</SelectItem>
                  <SelectItem value="owner_withdrawal">Penarikan pemilik</SelectItem>
                  <SelectItem value="profit_distribution">Distribusi laba</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="distribution-recipient" label="Penerima">
              <Input id="distribution-recipient" value={distribution.recipient} onChange={(event) => setDistribution({ ...distribution, recipient: event.target.value })} />
            </FormField>
          </div>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ type: "add-distribution" })}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Tambah Distribusi
          </Button>
          <EntryList rows={(entriesQuery.data?.distributions ?? []).map((row) => ({
            id: row.id, label: `${row.recipient || "Penerima tidak dicatat"} · ${formatDate(row.distribution_date)}`, amount: toFiniteNumber(row.amount),
          }))} onArchive={(id) => mutation.mutate({ type: "archive-distribution", id })} />
        </CardContent>
      </Card>
    </section>
  );
}

function EntryList({
  rows,
  onArchive,
}: {
  rows: Array<{ id: string; label: string; amount: number }>;
  onArchive: (id: string) => void;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Belum ada input pada periode ini.</p>;
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 p-3 text-sm">
          <div><p className="font-medium">{row.label}</p><p>{formatRupiah(row.amount)}</p></div>
          <Button type="button" size="icon" variant="ghost" aria-label="Arsipkan" onClick={() => onArchive(row.id)}>
            <Archive className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
