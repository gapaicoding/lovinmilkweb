import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OperationalExpenseRow } from "@/hooks/useOperationalExpenses";
import { jakartaToday } from "@/lib/businessPeriod";
import { resolveExpenseExportPeriod, type ExpenseExportPreset } from "@/lib/expenseExportPeriod";
import { buildOperationalExpenseExport } from "@/lib/operationalExpenseExport";
import { exportReportToExcel } from "@/lib/reportWorkbook";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

const PRESETS: Array<[ExpenseExportPreset, string]> = [
  ["today", "Hari Ini"],
  ["yesterday", "Kemarin"],
  ["last_7_days", "7 Hari Terakhir"],
  ["this_week", "Minggu Ini"],
  ["this_month", "Bulan Ini"],
  ["last_month", "Bulan Sebelumnya"],
  ["select_month", "Pilih Bulan"],
  ["custom", "Range Tanggal"],
];
type Category = { id: string; name: string };

export function ExpenseExportDialog({
  rows,
  categories,
}: {
  rows: OperationalExpenseRow[];
  categories: Category[];
}) {
  const today = jakartaToday();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ExpenseExportPreset>("today");
  const [categoryId, setCategoryId] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [exporting, setExporting] = useState(false);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (value) {
      setPreset("today");
      setCategoryId("all");
      setSelectedMonth(jakartaToday().slice(0, 7));
      setStartDate(jakartaToday());
      setEndDate(jakartaToday());
    }
  };
  const runExport = async () => {
    try {
      const period = resolveExpenseExportPeriod({
        preset,
        today: jakartaToday(),
        selectedMonth,
        startDate,
        endDate,
      });
      const selected = rows.filter(
        (row) =>
          !row.deleted_at &&
          row.expense_date >= period.startDate &&
          row.expense_date <= period.endDate &&
          (categoryId === "all" || row.cost_category_id === categoryId),
      );
      if (!selected.length)
        return toast.error("Tidak ada data pengeluaran pada periode yang dipilih.");
      setExporting(true);
      await exportReportToExcel(
        buildOperationalExpenseExport(selected, period.startDate, period.endDate),
      );
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export Excel gagal.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Data Pengeluaran</DialogTitle>
          <DialogDescription>
            Pilih periode dan kategori khusus untuk workbook ini.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expense-export-period">Periode</Label>
            <Select
              value={preset}
              onValueChange={(value) => setPreset(value as ExpenseExportPreset)}
            >
              <SelectTrigger id="expense-export-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "select_month" ? (
            <div className="space-y-2">
              <Label htmlFor="expense-export-month">Bulan</Label>
              <Input
                id="expense-export-month"
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              />
            </div>
          ) : null}
          {preset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-export-from">Tanggal mulai</Label>
                <Input
                  id="expense-export-from"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-export-to">Tanggal akhir</Label>
                <Input
                  id="expense-export-to"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="expense-export-category">Kategori</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="expense-export-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={exporting} onClick={() => void runExport()}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
