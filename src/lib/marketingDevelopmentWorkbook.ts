import type { Cell, CellObject, Row, Sheet } from "write-excel-file/browser";
import {
  calendarDates,
  googleRating,
  indonesianMarketingDay,
  type MarketingRecap,
} from "./marketingDevelopment";
import { excelSerialFromIsoDate } from "./salesRecapWorkbook";
type Content = File | Blob | ArrayBuffer;
const GREEN = "#DDEFD8",
  YELLOW = "#FEF3A7";
const c = (value: string | number, options: Omit<CellObject, "value"> = {}): Cell =>
  ({
    value,
    borderColor: "#111827",
    borderStyle: "thin",
    alignVertical: "center",
    ...options,
  }) as Cell;
const h = (value: string) =>
  c(value, { fontWeight: "bold", backgroundColor: GREEN, align: "center", wrap: true });
export function buildMarketingWorkbook(rows: MarketingRecap[], month: string): Sheet<Content>[] {
  const byDate = new Map(rows.map((r) => [r.business_date, r]));
  const main: Row[] = [
    [
      c("REKAP MARKETING & DEVELOPMENT LOVIN MILK", {
        columnSpan: 16,
        fontWeight: "bold",
        fontSize: 15,
        align: "center",
      }),
      ...Array(15).fill(null),
    ],
    [
      c(`Periode ${month}`, { columnSpan: 16, fontWeight: "bold", align: "center" }),
      ...Array(15).fill(null),
    ],
    [
      "Hari",
      "Tanggal",
      "Pendaftaran Membership Baru",
      "Jumlah Membership Terdaftar",
      "Klaim Promo",
      "★1",
      "★2",
      "★3",
      "★4",
      "★5",
      "Total Rating",
      "Wawancara / Ajak Bermain",
      "Event",
      "Tipe Registrasi",
      "Pihak Ketiga",
      "Peserta di luar Pemilik",
    ].map(h),
  ];
  for (const date of calendarDates(month)) {
    const r = byDate.get(date),
      stars = r
        ? [
            r.google_star_1_count,
            r.google_star_2_count,
            r.google_star_3_count,
            r.google_star_4_count,
            r.google_star_5_count,
          ]
        : [0, 0, 0, 0, 0],
      rating = googleRating(stars),
      events = r?.marketing_daily_events ?? [],
      first = events[0];
    main.push([
      c(indonesianMarketingDay(date)),
      c(excelSerialFromIsoDate(date), { type: Number, format: "dd mmm yyyy" }),
      c(r?.marketing_daily_membership_entries.length ?? 0, {
        type: Number,
        backgroundColor: YELLOW,
      }),
      c(r?.registered_membership_total ?? ""),
      c(r?.promo_claim_count ?? 0),
      ...stars.map((v) => c(v, { type: Number })),
      c(rating.total, { type: Number }),
      c(r?.customer_engagement_count ?? 0, { type: Number }),
      c(events.length, { type: Number }),
      c(events.length === 1 ? first.registration_type : ""),
      c(events.length === 1 ? (first.third_party ?? "") : ""),
      c(
        events.reduce((n, e) => n + e.external_participant_count, 0),
        { type: Number },
      ),
    ]);
  }
  const memberRows: Row[] = [
    ["Tanggal", "Hari", "Nama Member", "Nomor HP"].map(h),
    ...rows.flatMap((r) =>
      r.marketing_daily_membership_entries.map((m) => [
        c(excelSerialFromIsoDate(r.business_date), { type: Number, format: "dd mmm yyyy" }),
        c(indonesianMarketingDay(r.business_date)),
        c(m.member_name),
        c(m.phone_number, { type: String }),
      ]),
    ),
  ];
  const eventRows: Row[] = [
    [
      "Tanggal",
      "Hari",
      "Nama Kegiatan Event",
      "Tipe Registrasi",
      "Pihak Ketiga",
      "Peserta di luar Pemilik",
    ].map(h),
    ...rows.flatMap((r) =>
      r.marketing_daily_events.map((e) => [
        c(excelSerialFromIsoDate(r.business_date), { type: Number, format: "dd mmm yyyy" }),
        c(indonesianMarketingDay(r.business_date)),
        c(e.event_name),
        c(e.registration_type),
        c(e.third_party ?? ""),
        c(e.external_participant_count, { type: Number }),
      ]),
    ),
  ];
  return [
    {
      sheet: "Rekap Marketing",
      data: main,
      columns: Array.from({ length: 16 }, (_, i) => ({ width: i < 2 ? 14 : 20 })),
      stickyRowsCount: 3,
      stickyColumnsCount: 2,
    },
    {
      sheet: "Detail Membership Baru",
      data: memberRows,
      columns: [{ width: 16 }, { width: 12 }, { width: 25 }, { width: 20 }],
    },
    {
      sheet: "Detail Event Marketing",
      data: eventRows,
      columns: [
        { width: 16 },
        { width: 12 },
        { width: 30 },
        { width: 16 },
        { width: 24 },
        { width: 20 },
      ],
    },
  ];
}
export async function exportMarketingWorkbook(rows: MarketingRecap[], month: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const sheets = buildMarketingWorkbook(rows, month);
  const blob = await writeXlsxFile(sheets, { fontFamily: "Aptos", fontSize: 9 }).toBlob();
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `Rekap Marketing & Development ${month}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
