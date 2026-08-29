import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useOperationalInputter } from "@/hooks/useOperationalInputter";
import { normalizeOperationalInputter, type OperationalInputterSection } from "@/lib/operationalInputter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OperationalInputterCard({ outletId, section }: { outletId: string | null; section: OperationalInputterSection }) {
  const label = section === "sales" ? "Penjualan" : section === "expenses" ? "Pengeluaran" : "Supplier";
  const { name, query, mutation } = useOperationalInputter(outletId, section);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  useEffect(() => { if (open) setValue(name ?? ""); }, [open, name]);
  const save = async () => {
    try {
      normalizeOperationalInputter(value);
      await mutation.mutateAsync(value);
      setOpen(false);
      toast.success(`Penginput ${label} diperbarui.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Penginput gagal diperbarui."); }
  };
  return <>
    <Card><CardContent className="flex items-center justify-between gap-4 p-4">
      <div><p className="text-xs text-muted-foreground">Penginput {label}</p><p className="font-semibold">{query.isLoading ? "Memuat…" : query.isError ? "Gagal dimuat" : name || "Belum diatur"}</p></div>
      <Button type="button" size="sm" variant="outline" disabled={!outletId || query.isLoading} onClick={() => setOpen(true)}><Pencil className="mr-2 h-4 w-4" />{name ? "Ganti Penginput" : "Atur Penginput"}</Button>
    </CardContent></Card>
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && setOpen(next)}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{name ? "Ganti" : "Atur"} Penginput {label}</DialogTitle></DialogHeader>
      <div className="space-y-2"><Label htmlFor={`${section}-inputter`}>Nama Penginput</Label><Input id={`${section}-inputter`} maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} /></div>
      <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Batal</Button><Button disabled={mutation.isPending || !value.trim()} onClick={save}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
