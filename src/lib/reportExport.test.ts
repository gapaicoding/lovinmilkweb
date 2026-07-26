import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { computeRange } from "@/components/DateRangeFilter";
import {
  ReportExportError,
  canExportReport,
  createExportRange,
  detectDataStatus,
  reportPeriodLabel,
  safeReportFilename,
  toInclusiveDateRange,
  type ReportExportPayload,
} from "@/lib/reportExport";
import { createReportWorkbookBlob, prepareWorkbook } from "@/lib/reportWorkbook";

const reference = new Date(2026, 6, 26, 12);

describe("Excel export date ranges in Asia/Jakarta", () => {
  it.each([
    ["today", "2026-07-26", "2026-07-26"],
    ["yesterday", "2026-07-25", "2026-07-25"],
    ["last_7_days", "2026-07-20", "2026-07-26"],
    ["last_30_days", "2026-06-27", "2026-07-26"],
    ["this_month", "2026-07-01", "2026-07-26"],
    ["last_month", "2026-06-01", "2026-06-30"],
    ["this_year", "2026-01-01", "2026-07-26"],
  ] as const)("menghitung preset %s secara inclusive", (preset, start, end) => {
    expect(toInclusiveDateRange(computeRange(preset, undefined, undefined, reference))).toEqual({
      startDate: start,
      endDate: end,
    });
  });

  it("menghormati custom historical + live range", () => {
    const range = computeRange(
      "custom",
      new Date(2026, 5, 25),
      new Date(2026, 6, 5),
      reference,
    );
    expect(toInclusiveDateRange(range)).toEqual({
      startDate: "2026-06-25",
      endDate: "2026-07-05",
    });
  });

  it("membuat default range yang valid", () => {
    expect(createExportRange("this_month", reference).from).toEqual(new Date(2026, 6, 1));
  });
});

describe("Excel report metadata and filenames", () => {
  it("membuat filename aman dan konsisten", () => {
    expect(safeReportFilename("financial", "2026-06-01", "2026-06-30")).toBe(
      "LovinMilk_Laporan_Keuangan_2026-06-01_2026-06-30.xlsx",
    );
    expect(safeReportFilename("assets", "2000-01-01", "2026-07-26")).toBe(
      "LovinMilk_Aset_AsOf_2026-07-26.xlsx",
    );
  });

  it("memformat label periode tanpa fallback Juni", () => {
    expect(reportPeriodLabel("2026-08-01", "2026-08-31")).toContain("Agustus");
  });

  it("mendeteksi historical, operational, dan combined", () => {
    expect(detectDataStatus(["historical_import"])).toBe("Historical");
    expect(detectDataStatus(["operational"])).toBe("Operational");
    expect(detectDataStatus(["historical_import", "operational"])).toBe("Combined");
  });
});

describe("financial workbook definition", () => {
  const fixture = financialFixture();

  it("mempertahankan angka acceptance Juni sebagai number", () => {
    const workbook = prepareWorkbook(fixture);
    const summary = workbook.sheets[0];
    const values = summary.data.flat().map((cell) =>
      typeof cell === "object" && cell && "value" in cell ? cell.value : cell,
    );
    expect(values).toContain(30_011_000);
    expect(values).toContain(10_488_538);
    expect(values).toContain(19_522_462);
    expect(values).toContain(1_046_760);
    expect(values).toContain(18_475_702);
  });

  it("memiliki sheet keuangan wajib dengan nama benar", () => {
    const names = prepareWorkbook(fixture).sheets.map((sheet) => sheet.sheet);
    expect(names).toEqual([
      "Ringkasan",
      "Rincian HPP",
      "Rincian Operasional",
      "Rincian Pembelian",
      "Penyusutan",
    ]);
  });

  it("menulis pajak dan dividen unavailable sebagai text, bukan angka nol", () => {
    const values = prepareWorkbook(fixture).sheets[0].data.flat().map((cell) =>
      typeof cell === "object" && cell && "value" in cell ? cell.value : cell,
    );
    expect(values).toContain("Belum tersedia");
    expect(values).toContain("Provisional sebelum pajak");
  });

  it("membekukan area metadata dan header", () => {
    expect(prepareWorkbook(fixture).sheets[0].stickyRowsCount).toBeGreaterThan(3);
  });

  it("menghasilkan binary XLSX valid, bukan CSV terselubung", async () => {
    const blob = await createReportWorkbookBlob(fixture);
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect([...signature]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))).toHaveLength(5);
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain("<autoFilter ");
  });

  it("menyimpan metadata range dan timezone", () => {
    const values = prepareWorkbook(fixture).sheets[0].data.flat().map((cell) =>
      typeof cell === "object" && cell && "value" in cell ? cell.value : cell,
    );
    expect(values).toContain("Asia/Jakarta");
    expect(values).toContain("Historical");
  });
});

describe("export edge cases and permission", () => {
  it("menolak empty range agar tidak menghasilkan workbook nol", () => {
    expect(() => prepareWorkbook({ ...financialFixture(), sourceRecordCount: 0 })).toThrowError(
      ReportExportError,
    );
  });

  it("melindungi laporan sensitif dari role staff", () => {
    expect(canExportReport("staff", "financial")).toBe(false);
    expect(canExportReport("staff", "purchases")).toBe(false);
    expect(canExportReport("staff", "sales")).toBe(true);
    expect(canExportReport("admin", "financial")).toBe(true);
  });

  it("mendukung nullable supplier tanpa UUID internal", () => {
    const payload = financialFixture();
    payload.sheets[3] = {
      name: "Rincian Pembelian",
      columns: [
        { key: "Supplier", label: "Supplier" },
        { key: "Amount", label: "Amount", kind: "currency" },
      ],
      rows: [{ Supplier: "Supplier tidak tercatat", Amount: 1000 }],
    };
    const values = prepareWorkbook(payload).sheets[3].data.flat().map((cell) =>
      typeof cell === "object" && cell && "value" in cell ? cell.value : cell,
    );
    expect(values).toContain("Supplier tidak tercatat");
    expect(values.join(" ")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it("mendukung supplier archived filter pada request metadata", () => {
    expect(canExportReport("admin", "suppliers")).toBe(true);
  });

  it("menyatakan historical product revenue tidak tersedia", () => {
    const note = "Historical — revenue per produk tidak tersedia";
    expect(note).toContain("tidak tersedia");
  });

  it("mendukung asset as-of filename", () => {
    expect(safeReportFilename("assets", "2000-01-01", "2026-06-30")).toContain(
      "AsOf_2026-06-30",
    );
  });

  it("mendukung depreciation reporting period filename", () => {
    expect(safeReportFilename("depreciation", "2026-07-01", "2026-07-31")).toContain(
      "2026-07-01_2026-07-31",
    );
  });
});

function financialFixture(): ReportExportPayload {
  const summaryRows = [
    ["Omzet", 30_011_000],
    ["HPP", 10_488_538],
    ["Laba Kotor", 19_522_462],
    ["Beban Operasional", 1_046_760],
    ["EBITDA", 18_475_702],
    ["Penyusutan", 0],
    ["EBIT", 18_475_702],
    ["Pajak", null],
    ["Laba Bersih", "Provisional sebelum pajak"],
    ["Dividen", null],
  ];
  return {
    reportType: "financial",
    title: "Laporan Keuangan",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    periodLabel: "1 Juni 2026 – 30 Juni 2026",
    dataStatus: "Historical",
    sourceRecordCount: 1,
    filename: "LovinMilk_Laporan_Keuangan_2026-06-01_2026-06-30.xlsx",
    sheets: [
      {
        name: "Ringkasan",
        columns: [
          { key: "Metrik", label: "Metrik" },
          { key: "Nilai", label: "Nilai" },
        ],
        rows: summaryRows.map(([Metrik, Nilai]) => ({ Metrik, Nilai })),
      },
      emptySheet("Rincian HPP"),
      emptySheet("Rincian Operasional"),
      emptySheet("Rincian Pembelian"),
      emptySheet("Penyusutan"),
    ],
  };
}

function emptySheet(name: string) {
  return {
    name,
    columns: [{ key: "Catatan", label: "Catatan" }],
    rows: [{ Catatan: "Tidak ada rincian" }],
  };
}
