import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DateRangeFilter, isDateRangeValid, type DateRange } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { actualClient } from "@/lib/actualData";
import {
  REPORT_LABELS,
  ReportExportError,
  createExportRange,
  toInclusiveDateRange,
  type ReportType,
} from "@/lib/reportExport";
import { fetchReportExportPayload } from "@/lib/reportExportData";
import { exportReportToExcel } from "@/lib/reportWorkbook";

interface ExportExcelDialogProps {
  reportType: ReportType;
  currentRange?: DateRange;
  filters?: Record<string, string | boolean | null | undefined>;
  compact?: boolean;
}

export function ExportExcelDialog({
  reportType,
  currentRange,
  filters,
  compact = false,
}: ExportExcelDialogProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(currentRange ?? createExportRange());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open && currentRange) setRange(currentRange);
  }, [currentRange, open]);

  const handleExport = async () => {
    if (!isDateRangeValid(range)) {
      toast.error("Periode export tidak valid.");
      return;
    }
    setExporting(true);
    try {
      const payload = await fetchReportExportPayload({ reportType, range, filters });
      if (payload.sourceRecordCount <= 0) {
        throw new ReportExportError(
          "no_data",
          "Tidak ada data aktual pada periode yang dipilih.",
        );
      }
      await exportReportToExcel(payload);
      void recordExportAudit(reportType, range, filters);
      toast.success("Workbook Excel berhasil disiapkan.", {
        description: payload.filename,
      });
      setOpen(false);
    } catch (error) {
      const exportError =
        error instanceof ReportExportError
          ? error
          : new ReportExportError("generation_failure", "Excel gagal dibuat.", {
              cause: error,
            });
      console.error("[report-export]", {
        reportType,
        range: toInclusiveDateRange(range),
        kind: exportError.kind,
        cause: exportError.cause,
      });
      toast.error(exportError.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={() => setOpen(true)}
      >
        <FileSpreadsheet aria-hidden="true" className="mr-2 h-4 w-4" />
        Export Excel
      </Button>
      <Dialog open={open} onOpenChange={(next) => !exporting && setOpen(next)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Export Excel</DialogTitle>
            <DialogDescription>
              {REPORT_LABELS[reportType]}. Periode saat ini dipilih secara default dan dapat
              diganti sebelum workbook dibuat.
            </DialogDescription>
          </DialogHeader>
          <DateRangeFilter value={range} onChange={setRange} disabled={exporting} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={exporting} onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="button" disabled={exporting} onClick={() => void handleExport()}>
              {exporting ? (
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
              )}
              {exporting ? "Menyiapkan Excel..." : "Export .xlsx"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function recordExportAudit(
  reportType: ReportType,
  range: DateRange,
  filters: ExportExcelDialogProps["filters"],
) {
  const { startDate, endDate } = toInclusiveDateRange(range);
  const client = actualClient as unknown as {
    rpc(
      name: "record_report_export",
      args: {
        p_report_type: string;
        p_start_date: string;
        p_end_date: string;
        p_filters: Record<string, unknown>;
      },
    ): PromiseLike<{ error: unknown }>;
  };
  try {
    const { error } = await client.rpc("record_report_export", {
      p_report_type: reportType,
      p_start_date: startDate,
      p_end_date: endDate,
      p_filters: filters ?? {},
    });
    if (error) console.warn("[report-export-audit]", error);
  } catch (error) {
    console.warn("[report-export-audit]", error);
  }
}
