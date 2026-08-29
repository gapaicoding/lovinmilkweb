import { describe, expect, it } from "vitest";
import { prepareWorkbook } from "@/lib/reportWorkbook";
import type { ReportExportPayload } from "@/lib/reportExport";

const headers = ["No.","Nama produk","Merk produk","Ukuran produk","Harga satuan","Nama Toko","Alamat (Ketik alamat lengkap jika offline store, ketik nama aplikasi jika online store Shopee/Tokopedia dll)","Masukkan link google maps jika offline store / Link checkout jika online store","Nama pelayan/pemilik untuk mempermudah pencarian","No WA toko (usahakan minta agar bisa mudah kalau mau pesan tinggal ambil)"];

describe("supplier catalog workbook", () => {
  it("keeps the exact ten-column contract, styles, text, and link formula", () => {
    const row = Object.fromEntries(headers.map((header) => [header, ""]));
    Object.assign(row, { "No.": 1, "Nama produk": "Cabai", "Harga satuan": "Rp. 2.000 per pcs", "Nama Toko": "Mulyo Sayur", "Masukkan link google maps jika offline store / Link checkout jika online store": "https://maps.google.com/example", "No WA toko (usahakan minta agar bisa mudah kalau mau pesan tinggal ambil)": "0821-2437-4899" });
    const payload: ReportExportPayload = { reportType:"suppliers",title:"Supplier",startDate:"2026-08-29",endDate:"2026-08-29",periodLabel:"29 Agustus 2026",dataStatus:"Operational",sourceRecordCount:1,filename:"supplier-catalog-lovin-milk-2026-08-29.xlsx",supplierUpdateLabel:"Update Terakhir: Ms Keisyah 29 Agustus 2026",sheets:[{name:"Supplier Catalog",columns:headers.map((label,index)=>({key:label,label,width:[6,30,20,18,25,24,45,35,28,26][index]})),rows:[row]}] };
    const sheet = prepareWorkbook(payload).sheets[0];
    expect(sheet.columns).toHaveLength(10);
    expect(sheet.data[2].map((cell) => typeof cell === "object" && cell && "value" in cell ? cell.value : cell)).toEqual(headers);
    expect(sheet.data[2][0]).toMatchObject({ backgroundColor:"#BDD7EE", fontWeight:"bold", wrap:true, borderColor:"#000000" });
    expect(sheet.data[3][4]).toMatchObject({ value:"Rp. 2.000 per pcs" });
    expect(sheet.data[3][9]).toMatchObject({ value:"0821-2437-4899" });
    expect(sheet.data[3][4]).not.toHaveProperty("type");
    expect(sheet.data[3][9]).not.toHaveProperty("type");
    expect(sheet.data[3][7]).toMatchObject({ type:"Formula" });
  });
});
