import type { Cell, CellObject, Row, Sheet } from "write-excel-file/browser";
import { excelSerialFromIsoDate } from "@/lib/salesRecapWorkbook";
import { reportPeriodLabel } from "@/lib/reportExport";
import { VISITOR_ARRIVAL_SLOTS, type VisitorRecapPeriodRow } from "@/lib/visitorRecap";
type Content = File | Blob | ArrayBuffer;
const ADULT = "#FCE7D6", CHILD = "#FEF3A7", GREEN = "#DDEFD8";

export async function exportVisitorRecapWorkbook(rows: VisitorRecapPeriodRow[], start: string, end: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const blob = await writeXlsxFile([buildVisitorRecapSheetModel(rows, start, end)], { fontFamily: "Aptos", fontSize: 9 }).toBlob();
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = buildVisitorRecapFilename(start, end); anchor.click(); URL.revokeObjectURL(url);
}
export function buildVisitorRecapFilename(start: string, end: string) { return `Rekap Pengunjung ${start}${start === end ? "" : ` - ${end}`}.xlsx`; }
export function excelColumnName(columnNumber: number): string {
  let value = columnNumber, result = "";
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}
export function buildVisitorRecapSheetModel(rows: VisitorRecapPeriodRow[], start: string, end: string): Sheet<Content> {
  const byDate = new Map<string, VisitorRecapPeriodRow[]>(); rows.forEach((row) => byDate.set(row.business_date, [...(byDate.get(row.business_date) ?? []), row]));
  const dates = dateKeys(start, end);
  const top: Row[] = [[cell("REKAP PELANGGAN HARIAN LOVIN MILK", { columnSpan: 66, fontWeight: "bold", fontSize: 16, align: "center" }), ...blank(65)], [cell(`Periode ${reportPeriodLabel(start, end)}`, { columnSpan: 66, fontWeight: "bold", align: "center" }), ...blank(65)]];
  const h1: Row = [head("No.", GREEN, 2), head("Hari", GREEN, 2), head("Tanggal", GREEN, 2), head("Petugas", GREEN, 2), head("Dewasa (>12 tahun)", ADULT, 1, 31), ...blank(30), head("Anak-anak (<12 tahun)", CHILD, 1, 31), ...blank(30)];
  const h2: Row = [...blank(4), ...VISITOR_ARRIVAL_SLOTS.map((s) => head(s, ADULT)), head("TOTAL DEWASA", ADULT), ...VISITOR_ARRIVAL_SLOTS.map((s) => head(s, CHILD)), head("TOTAL ANAK", CHILD)];
  const data = dates.map((date, index) => dataRow(index + 1, date, byDate.get(date) ?? []));
  return { sheet: "Rekap Pengunjung", data: [...top, h1, h2, ...data], columns: [{ width: 7 }, { width: 11 }, { width: 14 }, { width: 18 }, ...Array.from({ length: 62 }, () => ({ width: 8 }))], stickyRowsCount: 4, stickyColumnsCount: 4, zoomScale: 0.65 };
}
function dataRow(no: number, date: string, rows: VisitorRecapPeriodRow[]): Row {
  const sums = (kind: "adult_count" | "child_count") => VISITOR_ARRIVAL_SLOTS.map((slot) => rows.filter((r) => r.arrival_time === slot).reduce((n, r) => n + r[kind], 0));
  const adult = sums("adult_count"), child = sums("child_count");
  return [num(no, GREEN), cell(day(date), { backgroundColor: GREEN, align: "center", textColor: day(date) === "MINGGU" ? "#DC2626" : undefined }), cell(excelSerialFromIsoDate(date), { type: Number, format: "dd mmm yyyy", backgroundColor: GREEN, align: "center" }), cell(rows.find((r) => r.recorder_name)?.recorder_name ?? "", { backgroundColor: GREEN }), ...adult.map((n) => num(n, ADULT)), num(adult.reduce((a,b)=>a+b,0), ADULT, true), ...child.map((n) => num(n, CHILD)), num(child.reduce((a,b)=>a+b,0), CHILD, true)];
}
function dateKeys(start: string, end: string) { const out: string[]=[]; for(let n=excelSerialFromIsoDate(start);n<=excelSerialFromIsoDate(end);n++){ const d=new Date((n-25569)*86400000); out.push(d.toISOString().slice(0,10)); } return out; }
function day(value:string){ return ["MINGGU","SENIN","SELASA","RABU","KAMIS","JUMAT","SABTU"][new Date(`${value}T00:00:00Z`).getUTCDay()]; }
function cell(value: string|number, options: Omit<CellObject,"value">={}): Cell { return { value, borderColor:"#111827", borderStyle:"thin", alignVertical:"center", ...options } as Cell; }
function head(value:string,bg:string,rowSpan=1,columnSpan=1){return cell(value,{backgroundColor:bg,fontWeight:"bold",align:"center",wrap:true,rowSpan,columnSpan});}
function num(value:number,bg:string,bold=false){return cell(value,{type:Number,format:"0",align:"center",backgroundColor:bg,fontWeight:bold?"bold":undefined});}
function blank(n:number):Row{return Array.from({length:n},()=>null);}
