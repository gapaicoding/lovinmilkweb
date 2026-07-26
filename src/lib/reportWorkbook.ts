import type { Cell, CellObject, Feature, Row, Sheet } from "write-excel-file/browser";

import {
  REPORT_TIMEZONE,
  type ExportColumn,
  type ExportSheet,
  type ExportValue,
  type ReportExportPayload,
  ReportExportError,
  parseReportDate,
} from "@/lib/reportExport";

const BRAND = "#7C2D12";
const BRAND_LIGHT = "#FFF7ED";
const HEADER = "#9A3412";
const SUBTLE = "#F3F4F6";
const WHITE = "#FFFFFF";
const TEXT = "#1F2937";
const CURRENCY_FORMAT = '"Rp" #,##0;[Red]("Rp" #,##0);-';
type BrowserFileContent = File | Blob | ArrayBuffer;

interface PreparedWorkbook {
  sheets: Sheet<BrowserFileContent>[];
  filename: string;
}

export function prepareWorkbook(payload: ReportExportPayload): PreparedWorkbook {
  if (payload.sourceRecordCount <= 0) {
    throw new ReportExportError("no_data", "Tidak ada data aktual pada periode yang dipilih.");
  }
  const metadata = createMetadataRows(payload);
  const sheets = payload.sheets.map((sheet, index) =>
    createSheet(sheet, index === 0 ? metadata : createCompactMetadataRows(payload)),
  );
  return { sheets, filename: payload.filename };
}

export async function exportReportToExcel(payload: ReportExportPayload): Promise<void> {
  const prepared = prepareWorkbook(payload);
  try {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const autoFilter = await createAutoFilterFeature(prepared.sheets);
    const writer = writeXlsxFile(prepared.sheets, {
      fontFamily: "Aptos",
      fontSize: 10,
      features: [autoFilter],
    });
    const blob = await writer.toBlob();
    downloadBlob(blob, prepared.filename);
  } catch (error) {
    if (error instanceof ReportExportError) throw error;
    throw new ReportExportError(
      "generation_failure",
      "Workbook Excel gagal dibuat di browser.",
      { cause: error },
    );
  }
}

export async function createReportWorkbookBlob(payload: ReportExportPayload): Promise<Blob> {
  const prepared = prepareWorkbook(payload);
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const autoFilter = await createAutoFilterFeature(prepared.sheets);
  return writeXlsxFile(prepared.sheets, {
    fontFamily: "Aptos",
    fontSize: 10,
    features: [autoFilter],
  }).toBlob();
}

async function createAutoFilterFeature(
  sheets: Sheet<BrowserFileContent>[],
): Promise<Feature<BrowserFileContent>> {
  const { getCellAddress } = await import("write-excel-file/utility");
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform(content, _options, properties) {
            const sheet = sheets[properties.sheetIndex];
            if (!sheet || !sheet.columns?.length || !sheet.stickyRowsCount) return content;
            const headerRow = sheet.stickyRowsCount;
            const lastRow = sheet.data.length;
            if (lastRow <= headerRow) return content;
            const lastColumn = getCellAddress(0, sheet.columns.length - 1).replace(/\d/g, "");
            const markup = `<autoFilter ref="A${headerRow}:${lastColumn}${lastRow}"/>`;
            return content.includes("<autoFilter")
              ? content
              : content.replace("</sheetData>", `</sheetData>${markup}`);
          },
        },
      },
    },
  };
}

function createSheet(
  sheet: ExportSheet,
  metadata: Row[],
): Sheet<BrowserFileContent> {
  const titleWidth = sheet.columns.length || 1;
  const title: Row = [
    cell(`Lovin Milk — ${sheet.name}`, {
      fontWeight: "bold",
      fontSize: 16,
      textColor: WHITE,
      backgroundColor: BRAND,
      columnSpan: titleWidth,
      height: 30,
    }),
    ...Array.from({ length: Math.max(titleWidth - 1, 0) }, () => null),
  ];
  const header: Row = sheet.columns.map((column) =>
    cell(column.label, {
      fontWeight: "bold",
      textColor: WHITE,
      backgroundColor: HEADER,
      align: column.kind === "currency" || column.kind === "integer" ? "right" : "left",
      wrap: true,
      height: 26,
    }),
  );
  const dataRows: Row[] = sheet.rows.length
    ? sheet.rows.map((row, index) =>
        sheet.columns.map((column) =>
          valueCell(row[column.key], column, index % 2 === 1 ? "#FFFBF5" : WHITE),
        ),
      )
    : [
        [
          cell(sheet.emptyMessage ?? "Tidak ada rincian pada periode ini.", {
            textColor: "#6B7280",
            backgroundColor: SUBTLE,
            columnSpan: titleWidth,
          }),
          ...Array.from({ length: Math.max(titleWidth - 1, 0) }, () => null),
        ],
      ];

  return {
    sheet: sanitizeSheetName(sheet.name),
    data: [title, ...metadata, blankRow(titleWidth), header, ...dataRows],
    columns: sheet.columns.map((column) => ({ width: column.width ?? defaultWidth(column) })),
    stickyRowsCount: metadata.length + 3,
    zoomScale: 0.9,
    dateFormat: "dd mmm yyyy",
  };
}

function createMetadataRows(payload: ReportExportPayload): Row[] {
  const values: Array<[string, ExportValue]> = [
    ["Nama laporan", payload.title],
    ["Periode", payload.periodLabel],
    ["Tanggal mulai", parseReportDate(payload.startDate)],
    [payload.asOfDate ? "As-of date" : "Tanggal akhir", parseReportDate(payload.endDate)],
    ["Tanggal export", new Date()],
    ["Timezone", REPORT_TIMEZONE],
    ["Status data", payload.dataStatus],
  ];
  return values.map(([label, value]) => [
    cell(label, { fontWeight: "bold", textColor: TEXT, backgroundColor: BRAND_LIGHT }),
    valueCell(value, { key: "metadata", label, kind: value instanceof Date ? "date" : "text" }, WHITE),
  ]);
}

function createCompactMetadataRows(payload: ReportExportPayload): Row[] {
  return [
    [
      cell("Periode", { fontWeight: "bold", backgroundColor: BRAND_LIGHT }),
      cell(payload.periodLabel),
    ],
    [
      cell("Status data", { fontWeight: "bold", backgroundColor: BRAND_LIGHT }),
      cell(payload.dataStatus),
    ],
  ];
}

function valueCell(value: ExportValue | undefined, column: ExportColumn, backgroundColor: string): Cell {
  if (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Date) &&
    "kind" in value &&
    "value" in value
  ) {
    return valueCell(value.value, { ...column, kind: value.kind }, backgroundColor);
  }
  if (value === null || value === undefined || value === "") {
    return cell("Belum tersedia", { textColor: "#6B7280", backgroundColor });
  }
  const base = { backgroundColor };
  switch (column.kind) {
    case "currency":
      return cell(Number(value), { ...base, type: Number, format: CURRENCY_FORMAT, align: "right" });
    case "integer":
      return cell(Number(value), { ...base, type: Number, format: "#,##0", align: "right" });
    case "decimal":
      return cell(Number(value), { ...base, type: Number, format: "#,##0.00", align: "right" });
    case "date":
      return cell(value instanceof Date ? value : parseReportDate(String(value)), {
        ...base,
        type: Date,
        format: "dd mmm yyyy",
      });
    case "status":
      return cell(String(value), {
        ...base,
        fontWeight: "bold",
        textColor: statusColor(String(value)),
      });
    default:
      return cell(value);
  }
}

function cell(
  value: Exclude<ExportValue, { kind: unknown }>,
  options: Omit<CellObject, "value"> = {},
): Cell {
  return {
    value,
    borderColor: "#E5E7EB",
    borderStyle: "thin",
    alignVertical: "center",
    ...options,
  } as Cell;
}

function blankRow(columns: number): Row {
  return Array.from({ length: Math.max(columns, 1) }, () => cell(""));
}

function defaultWidth(column: ExportColumn): number {
  if (column.kind === "date") return 15;
  if (column.kind === "currency") return 18;
  if (column.kind === "integer" || column.kind === "decimal") return 13;
  return Math.min(Math.max(column.label.length + 4, 16), 34);
}

function sanitizeSheetName(value: string): string {
  return value.replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Laporan";
}

function statusColor(value: string): string {
  const normalized = value.toLocaleLowerCase("id-ID");
  if (normalized.includes("final") || normalized.includes("aktif") || normalized.includes("paid")) {
    return "#166534";
  }
  if (normalized.includes("provisional") || normalized.includes("belum")) return "#9A3412";
  return TEXT;
}

function downloadBlob(blob: Blob, filename: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new ReportExportError("download_failure", "Download hanya tersedia melalui browser.");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } catch (error) {
    throw new ReportExportError("download_failure", "Browser gagal memulai download Excel.", {
      cause: error,
    });
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
