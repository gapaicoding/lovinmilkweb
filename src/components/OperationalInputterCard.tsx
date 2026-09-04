import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useOperationalInputter } from "@/hooks/useOperationalInputter";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeOperationalInputter,
  type OperationalInputterSection,
} from "@/lib/operationalInputter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type HistoryRow = {
  inputter_name: string;
  section: string;
  started_at: string;
  last_used_at: string | null;
};
const rpc = supabase as unknown as {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: HistoryRow[] | null; error: { message: string } | null }>;
};
const labels: Record<OperationalInputterSection, string> = {
  sales: "Penjualan",
  expenses: "Pengeluaran",
  suppliers: "Supplier",
  visitors: "Kunjungan Pengunjung",
  interviews: "Wawancara Orang Tua",
  marketing: "Marketing & Development",
};

export function OperationalInputterCard({
  outletId,
  section,
}: {
  outletId: string | null;
  section: OperationalInputterSection;
}) {
  const label = labels[section],
    { name, query, mutation } = useOperationalInputter(outletId, section);
  const [open, setOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [value, setValue] = useState("");
  const history = useQuery({
    queryKey: ["operational-inputter-history", outletId, section],
    enabled: Boolean(outletId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("get_operational_inputter_history", {
        p_section: section,
        p_outlet_id: outletId!,
        p_limit: 20,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  useEffect(() => {
    if (open) setValue(name ?? "");
  }, [open, name]);
  const save = async () => {
    try {
      normalizeOperationalInputter(value);
      await mutation.mutateAsync(value);
      await history.refetch();
      setOpen(false);
      toast.success(`Sesi penginput ${label} dimulai.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sesi penginput gagal dibuat.");
    }
  };
  const last = history.data?.[0];
  return (
    <>
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Penginput {label}</p>
            <p className="font-semibold">
              {query.isLoading
                ? "Memuat..."
                : query.isError
                  ? "Gagal dimuat"
                  : name || "Belum diatur"}
            </p>
            <p className="text-sm text-muted-foreground">
              {name
                ? "Aktif untuk sesi browser ini."
                : "Nama penginput wajib diisi sebelum mencatat data."}
            </p>
            {!name && last ? (
              <p className="text-xs text-muted-foreground">
                Penginput terakhir: {last.inputter_name} · {formatTime(last.started_at)}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!outletId || query.isLoading}
              onClick={() => setOpen(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {name ? "Ganti Penginput" : "Isi Nama Penginput"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!outletId}
              onClick={() => setHistoryOpen(true)}
            >
              <Clock3 className="mr-2 h-4 w-4" />
              Riwayat Penginput
            </Button>
          </div>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={(next) => !mutation.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {name ? "Ganti" : "Isi"} Penginput {label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${section}-inputter`}>Nama Penginput</Label>
            <Input
              id={`${section}-inputter`}
              maxLength={100}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button disabled={mutation.isPending || !value.trim()} onClick={save}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Mulai
              Sesi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Riwayat Penginput {label}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-auto">
            {history.isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat riwayat...</p>
            ) : history.data?.length ? (
              history.data.map((row, index) => (
                <div
                  key={`${row.started_at}-${index}`}
                  className="grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-3"
                >
                  <span className="font-medium">{row.inputter_name}</span>
                  <span>{formatTime(row.started_at)}</span>
                  <span className="text-muted-foreground">
                    {row.last_used_at ? formatTime(row.last_used_at) : "Belum digunakan"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada riwayat penginput.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}
