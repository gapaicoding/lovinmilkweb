import { actualClient, toFiniteNumber } from "@/lib/actualData";
import type { SalesTransaction } from "@/lib/salesTransactions";
import { fetchDynamicFinancialStatement } from "@/lib/dynamicFinance";
import {
  fetchDefaultOutletId,
  fetchOutletReport,
  fetchProductReport,
  sourceStatusLabel,
} from "@/lib/reporting";
import {
  REPORT_LABELS,
  ReportExportError,
  classifyExportError,
  detectDataStatus,
  parseReportDate,
  reportPeriodLabel,
  safeReportFilename,
  toInclusiveDateRange,
  type ExportSheet,
  type ReportExportPayload,
  type ReportExportRequest,
  type ReportType,
} from "@/lib/reportExport";

type JsonRecord = Record<string, unknown>;

interface PurchaseInvoice {
  id: string;
  purchase_date: string;
  receipt_reference: string | null;
  supplier_id: string | null;
  supplier_name_raw: string | null;
  notes: string | null;
  record_source: string;
}
interface PurchaseItem {
  purchase_invoice_id: string;
  item_name_raw: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
  amount: number | string;
  financial_class: string;
  source_category: string | null;
  record_source: string;
}
interface Supplier {
  id: string;
  supplier_key: string;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  deleted_at: string | null;
  source_type: string | null;
  link: string | null;
  inputter_name: string | null;
  updated_at: string;
  supplier_items: Array<{ id: string; item_name_raw: string; brand_raw: string | null; size_raw: string | null; price_raw: string | null; inputter_name: string | null; created_at: string; updated_at: string; deleted_at: string | null }> | null;
}
interface Sale {
  transaction_date: string;
  product_id: string;
  sales_category_id: string;
  quantity: number | string;
  unit_price: number | string;
  amount: number | string;
  notes: string | null;
  entry_source: string;
  record_source: string;
  visitor_visit_id: string | null;
}
interface DailySale {
  sale_date: string;
  total_sales: number | string;
  bill_count: number | null;
  cash: number | null;
  debit_edc_bca: number | null;
  qris_dretail: number | null;
  qris_dynamic_bca: number | null;
  qris_static_bca: number | null;
  qris_static_bri: number | null;
}
interface HistoricalProduct {
  sale_date: string;
  canonical_product_name: string;
  category_name: string | null;
  quantity: number | string;
}
interface Product {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  sales_category_id: string;
}
interface NamedCategory {
  id: string;
  name: string;
}
interface Expense {
  transaction_date: string;
  expense_category_id: string;
  expense_item_id: string;
  quantity: number | string;
  unit_price: number | string;
  amount: number | string;
  notes: string | null;
  record_source: string;
}
interface ExpenseItem {
  id: string;
  name: string;
}
interface Traffic {
  traffic_date: string;
  adult_visitors: number | string;
  child_visitors: number | string;
  total_visitors: number | string;
  bill_count: number | null;
}
interface VisitorVisit {
  check_in_at: string;
}
interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  asset_category_id: string;
  acquisition_date: string;
  acquisition_cost: number | string;
  capitalization_status: string;
  useful_life_months: number;
  depreciation_method: string;
  monthly_depreciation: number | string | null;
  location: string | null;
  asset_status: string;
  deleted_at: string | null;
  record_source: string;
}
interface AssetCategory {
  id: string;
  name: string;
}
interface Depreciation {
  asset_id: string;
  period_month: string;
  depreciation_amount: number | string;
  accumulated_depreciation: number | string;
  ending_book_value: number | string;
  status: string;
}


export interface OperationalSalesExportOptions {
  transactions: readonly SalesTransaction[];
  startDate: string;
  endDate: string;
  outletName?: string | null;
  subunitId?: string | null;
  categoryId?: string | null;
}

interface OperationalSalesDetailRow extends Record<string, unknown> {
  transactionId: string;
  itemId: string;
  date: Date;
  transactionNumber: string;
  inputter: string | null;
  product: string;
  sku: string | null;
  category: string;
  subunit: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  transactionTotal: number;
  visitorCount: number | null;
  transactionNotes: string | null;
  itemNotes: string | null;
}

export function buildOperationalSalesExportPayload(
  options: OperationalSalesExportOptions,
): ReportExportPayload {
  const {
    transactions,
    startDate,
    endDate,
    outletName = null,
    subunitId = null,
    categoryId = null,
  } = options;

  const activeTransactions = transactions.filter(
    (transaction) =>
      !transaction.deletedAt &&
      transaction.transactionDate >= startDate &&
      transaction.transactionDate <= endDate,
  );

  const detailRows: OperationalSalesDetailRow[] = [];

  for (const transaction of activeTransactions) {
    const scopedItems = transaction.items.filter((item) => {
      if (subunitId && item.subunitId !== subunitId) {
        return false;
      }

      if (categoryId && item.salesCategoryId !== categoryId) {
        return false;
      }

      return true;
    });

    for (const item of scopedItems) {
      detailRows.push({
        transactionId: transaction.id,
        itemId: item.id,
        date: parseReportDate(transaction.transactionDate),
        transactionNumber: transaction.transactionNumber,
        inputter: transaction.inputterName ?? null,
        product: item.productNameSnapshot,
        sku: item.productSkuSnapshot,
        category: item.categoryNameSnapshot,
        subunit: item.subunitNameSnapshot,
        quantity: item.quantity,
        unit: item.unitSnapshot,
        unitPrice: item.unitPrice,
        subtotal: item.amount,
        transactionTotal: transaction.totalAmount,
        visitorCount: transaction.linkedVisit?.totalVisitors ?? null,
        transactionNotes: transaction.notes,
        itemNotes: item.notes,
      });
    }
  }

  const transactionIds = new Set(
    detailRows.map((row) => row.transactionId),
  );

  const totalQuantity = detailRows.reduce(
    (sum, row) => sum + row.quantity,
    0,
  );

  const totalRevenue = detailRows.reduce(
    (sum, row) => sum + row.subtotal,
    0,
  );

  const productGroups = new Map<
    string,
    {
      product: string;
      sku: string | null;
      category: string;
      subunit: string;
      quantity: number;
      revenue: number;
      transactionIds: Set<string>;
    }
  >();

  const subunitGroups = new Map<
    string,
    {
      subunit: string;
      quantity: number;
      revenue: number;
      itemCount: number;
      transactionIds: Set<string>;
    }
  >();

  const dailyGroups = new Map<
    string,
    {
      quantity: number;
      revenue: number;
      itemCount: number;
      transactionIds: Set<string>;
    }
  >();

  for (const row of detailRows) {
    const productKey = [
      row.product,
      row.sku ?? "",
      row.category,
      row.subunit,
    ].join("::");

    const productGroup =
      productGroups.get(productKey) ?? {
        product: row.product,
        sku: row.sku,
        category: row.category,
        subunit: row.subunit,
        quantity: 0,
        revenue: 0,
        transactionIds: new Set<string>(),
      };

    productGroup.quantity += row.quantity;
    productGroup.revenue += row.subtotal;
    productGroup.transactionIds.add(row.transactionId);
    productGroups.set(productKey, productGroup);

    const subunitGroup =
      subunitGroups.get(row.subunit) ?? {
        subunit: row.subunit,
        quantity: 0,
        revenue: 0,
        itemCount: 0,
        transactionIds: new Set<string>(),
      };

    subunitGroup.quantity += row.quantity;
    subunitGroup.revenue += row.subtotal;
    subunitGroup.itemCount += 1;
    subunitGroup.transactionIds.add(row.transactionId);
    subunitGroups.set(row.subunit, subunitGroup);

    const dateKey = toIsoDate(row.date);
    const dailyGroup =
      dailyGroups.get(dateKey) ?? {
        quantity: 0,
        revenue: 0,
        itemCount: 0,
        transactionIds: new Set<string>(),
      };

    dailyGroup.quantity += row.quantity;
    dailyGroup.revenue += row.subtotal;
    dailyGroup.itemCount += 1;
    dailyGroup.transactionIds.add(row.transactionId);
    dailyGroups.set(dateKey, dailyGroup);
  }

  const productRows = [...productGroups.values()]
    .map((group) => ({
      Produk: group.product,
      SKU: group.sku,
      Kategori: group.category,
      Subunit: group.subunit,
      Transaksi: group.transactionIds.size,
      Quantity: group.quantity,
      Omzet: group.revenue,
      "Harga Rata-rata":
        group.quantity > 0
          ? group.revenue / group.quantity
          : null,
    }))
    .sort(
      (left, right) =>
        toFiniteNumber(right.Quantity) -
        toFiniteNumber(left.Quantity),
    );

  const subunitRows = [...subunitGroups.values()]
    .map((group) => ({
      Subunit: group.subunit,
      "Transaksi Terlibat": group.transactionIds.size,
      "Baris Item": group.itemCount,
      Quantity: group.quantity,
      Omzet: group.revenue,
      "Kontribusi Omzet":
        totalRevenue > 0
          ? (group.revenue / totalRevenue) * 100
          : null,
    }))
    .sort(
      (left, right) =>
        toFiniteNumber(right.Omzet) -
        toFiniteNumber(left.Omzet),
    );

  const dailyRows = [...dailyGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, group]) => ({
      Tanggal: parseReportDate(date),
      Transaksi: group.transactionIds.size,
      "Baris Item": group.itemCount,
      Quantity: group.quantity,
      Omzet: group.revenue,
    }));

  const detailSheetRows = detailRows
    .sort((left, right) => {
      const dateCompare = left.date.getTime() - right.date.getTime();

      if (dateCompare !== 0) {
        return dateCompare;
      }

      const transactionCompare =
        left.transactionNumber.localeCompare(
          right.transactionNumber,
          "id-ID",
        );

      if (transactionCompare !== 0) {
        return transactionCompare;
      }

      return left.itemId.localeCompare(right.itemId);
    })
    .map((row) => ({
      Tanggal: row.date,
      "No. Transaksi": row.transactionNumber,
      Penginput: row.inputter,
      Produk: row.product,
      SKU: row.sku,
      Kategori: row.category,
      Subunit: row.subunit,
      Quantity: row.quantity,
      Satuan: row.unit,
      "Harga Satuan": row.unitPrice,
      Subtotal: row.subtotal,
      "Total Transaksi Outlet": row.transactionTotal,
      Pengunjung: row.visitorCount,
      "Catatan Item": row.itemNotes,
      "Catatan Transaksi": row.transactionNotes,
    }));

  const periodLabel = reportPeriodLabel(startDate, endDate);

  const filterLabel = [
    subunitId ? "Subunit terpilih" : "Semua Subunit",
    categoryId ? "Category terpilih" : "Semua Category",
  ].join(" · ");

  const sheets: ExportSheet[] =
    detailRows.length > 0
      ? [
          summarySheet([
            metric("Periode", periodLabel),
            metric("Outlet", outletName ?? "Outlet aktif"),
            metric("Cakupan", filterLabel),
            metric("Transaksi terlibat", transactionIds.size),
            metric("Baris item", detailRows.length),
            metric("Total quantity", totalQuantity),
            metric("Total penjualan sesuai filter", totalRevenue),
            metric("Produk unik", productRows.length),
            metric("Subunit terlibat", subunitRows.length),
            metric(
              "Catatan",
              "Transaksi campuran dapat terlibat di lebih dari satu Subunit. Kolom Transaksi Terlibat per Subunit tidak bersifat additive.",
            ),
          ]),
          genericSheet(
            "Penjualan Harian",
            [
              col("Tanggal", "date", 15),
              col("Transaksi", "integer", 14),
              col("Baris Item", "integer", 14),
              col("Quantity", "decimal", 14),
              col("Omzet", "currency", 20),
            ],
            dailyRows,
          ),
          genericSheet(
            "Penjualan Produk",
            [
              col("Produk", "text", 32),
              col("SKU", "text", 18),
              col("Kategori", "text", 24),
              col("Subunit", "text", 20),
              col("Transaksi", "integer", 14),
              col("Quantity", "decimal", 14),
              col("Omzet", "currency", 20),
              col("Harga Rata-rata", "currency", 20),
            ],
            productRows,
          ),
          genericSheet(
            "Per Subunit",
            [
              col("Subunit", "text", 22),
              col("Transaksi Terlibat", "integer", 20),
              col("Baris Item", "integer", 14),
              col("Quantity", "decimal", 14),
              col("Omzet", "currency", 20),
              col("Kontribusi Omzet", "decimal", 18),
            ],
            subunitRows,
          ),
          genericSheet(
            "Detail Transaksi",
            [
              col("Tanggal", "date", 15),
              col("No. Transaksi", "text", 20),
              col("Penginput", "text", 22),
              col("Produk", "text", 32),
              col("SKU", "text", 18),
              col("Kategori", "text", 24),
              col("Subunit", "text", 20),
              col("Quantity", "decimal", 14),
              col("Satuan", "text", 12),
              col("Harga Satuan", "currency", 18),
              col("Subtotal", "currency", 18),
              col("Total Transaksi Outlet", "currency", 22),
              col("Pengunjung", "integer", 14),
              col("Catatan Item", "text", 30),
              col("Catatan Transaksi", "text", 34),
            ],
            detailSheetRows,
          ),
        ]
      : [];

  return {
    reportType: "sales",
    title: "Penjualan Operasional",
    startDate,
    endDate,
    periodLabel,
    dataStatus: "Operational",
    sheets,
    sourceRecordCount: detailRows.length,
    filename: safeReportFilename(
      "sales",
      startDate,
      endDate,
    ),
  };
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function fetchReportExportPayload(
  request: ReportExportRequest,
): Promise<ReportExportPayload> {
  try {
    switch (request.reportType) {
      case "financial":
        return await stage7FinancialReport(request);
      case "sales":
        return await stage7SalesReport(request);
      case "visitors":
        return await visitorsReport(request);
      case "expenses":
        return await stage7ExpensesReport(request);
      case "purchases":
        return await purchasesReport(request);
      case "products":
        return await stage7ProductsReport(request);
      case "suppliers":
        return await suppliersReport(request);
      case "assets":
        return await assetsReport(request);
      case "depreciation":
        return await depreciationReport(request);
    }
  } catch (error) {
    throw classifyExportError(error);
  }
}

async function stage7FinancialReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const outletId = await fetchDefaultOutletId();
  const report = await fetchOutletReport(outletId, period.startDate, period.endDate);
  const metadataRows = [
    metric("Periode", period.label),
    metric("Sumber data", sourceStatusLabel(report.source_status)),
    metric("Tanggal cutover operasional", report.operational_cutover_date),
    metric("Omzet", report.revenue),
    metric("HPP", report.hpp),
    metric("Laba Kotor", report.gross_profit),
    metric("Pengeluaran Operasional", report.operational_expense),
    metric("Depresiasi", report.depreciation),
    metric("Laba Operasional", report.operating_profit),
    metric("HPP provisional", report.has_provisional_hpp ? "Ya" : "Tidak"),
    metric("Item HPP provisional", report.provisional_hpp_item_count),
    metric("Omzet terdampak HPP provisional", report.provisional_hpp_revenue),
    metric("Catatan", "Laba Operasional bukan Laba Bersih."),
  ];
  return payload(request, period, 1, [summarySheet(metadataRows)], stage7DataStatus(report.source_status));
}

async function stage7SalesReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const outletId = await fetchDefaultOutletId();
  const [outlet, products] = await Promise.all([
    fetchOutletReport(outletId, period.startDate, period.endDate),
    fetchProductReport(outletId, period.startDate, period.endDate),
  ]);
  const rows = [...products.operational_rows, ...products.legacy_rows].map((row) => ({
    Produk: row.product_name,
    Kategori: row.category_name,
    Subunit: row.subunit_name ?? null,
    Quantity: row.quantity,
    Omzet: row.revenue,
    HPP: row.hpp,
    "Laba Kotor": row.gross_profit,
    Margin: row.margin_percent ?? null,
    "Status HPP": row.has_provisional_hpp ? "Provisional" : row.financial_available ? "Final" : "Tidak tersedia",
    Sumber: row.source_status === "legacy" ? "Historis — qty saja" : "Operasional",
  }));
  return payload(request, period, rows.length || 1, [
    summarySheet([
      metric("Periode", period.label),
      metric("Sumber data", sourceStatusLabel(outlet.source_status)),
      metric("Omzet", outlet.revenue),
      metric("Bill / Transaksi", outlet.bill_count),
      metric("Quantity", outlet.quantity),
      metric("HPP", outlet.hpp),
      metric("Laba Kotor", outlet.gross_profit),
      metric("HPP provisional", outlet.has_provisional_hpp ? "Ya" : "Tidak"),
    ]),
    genericSheet("Produk", [
      col("Produk", "text", 28), col("Kategori", "text", 22), col("Subunit", "text", 20),
      col("Quantity", "decimal", 12), col("Omzet", "currency", 18), col("HPP", "currency", 18),
      col("Laba Kotor", "currency", 18), col("Margin", "decimal", 12),
      col("Status HPP", "status", 18), col("Sumber", "text", 24),
    ], rows),
  ], stage7DataStatus(outlet.source_status));
}

async function stage7ProductsReport(request: ReportExportRequest) {
  return stage7SalesReport({ ...request, reportType: "products" });
}

async function stage7ExpensesReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const outletId = await fetchDefaultOutletId();
  const report = await fetchOutletReport(outletId, period.startDate, period.endDate);
  const rows = await fetchRows<JsonRecord>("operational_expenses", (query) =>
    query.select("expense_date,category_name_snapshot,scope_snapshot,outlet_name_snapshot,subunit_name_snapshot,amount,notes")
      .eq("outlet_id", outletId).gte("expense_date", period.startDate).lte("expense_date", period.endDate)
      .is("deleted_at", null).order("expense_date"),
  );
  return payload(request, period, rows.length || (report.operational_expense !== 0 ? 1 : 0), [
    summarySheet([
      metric("Periode", period.label),
      metric("Sumber data", sourceStatusLabel(report.source_status)),
      metric("Total Pengeluaran Operasional", report.operational_expense),
      metric("Tanggal cutover operasional", report.operational_cutover_date),
    ]),
    genericSheet("Pengeluaran Operasional", [
      col("Tanggal", "date", 15), col("Kategori", "text", 26), col("Cakupan", "text", 20),
      col("Outlet", "text", 20), col("Subunit", "text", 20), col("Nominal", "currency", 18),
      col("Catatan", "text", 34),
    ], rows.map((row) => ({
      Tanggal: parseReportDate(String(row.expense_date)),
      Kategori: row.category_name_snapshot as string,
      Cakupan: row.scope_snapshot === "subunit" ? "Biaya Langsung Subunit" : "Biaya Bersama Outlet",
      Outlet: row.outlet_name_snapshot as string,
      Subunit: row.subunit_name_snapshot as string | null,
      Nominal: toFiniteNumber(row.amount),
      Catatan: row.notes as string | null,
    })), "Tidak ada rincian pengeluaran operasional pada periode ini."),
  ], stage7DataStatus(report.source_status));
}

function stage7DataStatus(status: string): ReportExportPayload["dataStatus"] {
  if (status === "legacy") return "Historical";
  if (status === "mixed") return "Combined";
  if (status === "empty") return "No actual data";
  return "Operational";
}

async function financialReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const [statement, purchases, depreciation, assets, taxes, distributions] = await Promise.all([
    fetchDynamicFinancialStatement(period.startDate, period.endDate),
    fetchPurchases(period.startDate, period.endDate),
    fetchRows<Depreciation>("asset_depreciation_entries", (query) =>
      query
        .select("asset_id,period_month,depreciation_amount,accumulated_depreciation,ending_book_value,status")
        .gte("period_month", period.startDate)
        .lte("period_month", period.endDate)
        .neq("status", "reversed"),
    ),
    fetchRows<Asset>("assets", (query) =>
      query.select("id,asset_code,asset_name,asset_category_id,acquisition_date,acquisition_cost,capitalization_status,useful_life_months,depreciation_method,monthly_depreciation,location,asset_status,deleted_at,record_source"),
    ),
    fetchRows<JsonRecord>("tax_entries", (query) =>
      query
        .select("period_start,period_end,tax_type,amount,status,payment_date,notes,record_source")
        .lte("period_start", period.endDate)
        .gte("period_end", period.startDate)
        .is("deleted_at", null),
    ),
    fetchRows<JsonRecord>("owner_distributions", (query) =>
      query
        .select("distribution_date,amount,recipient,distribution_type,status,notes,record_source")
        .gte("distribution_date", period.startDate)
        .lte("distribution_date", period.endDate)
        .is("deleted_at", null),
    ),
  ]);
  if (!statement) return emptyPayload(request, period);
  const hpp = purchaseItemRows(purchases).filter((row) => row["Klasifikasi"] === "HPP");
  const opex = purchaseItemRows(purchases).filter(
    (row) => row["Klasifikasi"] === "Beban Operasional",
  );
  const summaryRows = [
    metric("Periode", period.label),
    metric("Omzet", statement.revenue),
    metric("HPP", statement.hpp),
    metric("Laba Kotor", statement.grossProfit),
    metric("Beban Operasional", statement.operatingExpense),
    metric("EBITDA", statement.ebitda),
    metric("Penyusutan", statement.depreciation),
    metric("EBIT", statement.ebitOperatingProfit),
    metric("Pajak", statement.taxRecorded ? statement.taxAmount : null),
    metric(
      "Laba Bersih",
      statement.taxRecorded ? statement.netIncomeFinal : "Provisional sebelum pajak",
    ),
    metric("Dividen", statement.dividendRecorded ? statement.dividendAmount : null),
    metric("Laba Ditahan", statement.dividendRecorded ? statement.retainedEarningsFinal : null),
    metric("Status laporan", statement.statementStatus),
  ];
  const assetMap = mapBy(assets);
  const depreciationRows = depreciation.map((entry) => {
    const asset = assetMap.get(entry.asset_id);
    return {
      Periode: parseReportDate(entry.period_month),
      "Kode Aset": asset?.asset_code ?? "Tidak tercatat",
      Aset: asset?.asset_name ?? "Aset tidak ditemukan",
      Kategori: null,
      "Nilai Perolehan": asset ? toFiniteNumber(asset.acquisition_cost) : null,
      Kapitalisasi: asset ? capitalizationLabel(asset.capitalization_status) : null,
      "Masa Manfaat": asset?.useful_life_months ?? null,
      Metode: asset?.depreciation_method ?? null,
      Penyusutan: toFiniteNumber(entry.depreciation_amount),
      Akumulasi: toFiniteNumber(entry.accumulated_depreciation),
      "Nilai Buku Akhir": toFiniteNumber(entry.ending_book_value),
      Status: entry.status,
    };
  });
  const sources = [
    ...purchases.invoices.map((row) => row.record_source),
    ...taxes.map((row) => String(row.record_source)),
    ...distributions.map((row) => String(row.record_source)),
    ...depreciation
      .map((entry) => assetMap.get(entry.asset_id)?.record_source)
      .filter((value): value is string => Boolean(value)),
    ...(statement.historicalBatchIds.length ? ["historical_import"] : []),
  ];
  return payload(request, period, statement.sourceRecordCount, [
    summarySheet(summaryRows),
    purchaseClassSheet("Rincian HPP", hpp),
    purchaseClassSheet("Rincian Operasional", opex),
    purchaseInvoiceSheet(purchases, "Rincian Pembelian"),
    depreciationSheet([], depreciationRows, "Penyusutan"),
    ...(taxes.length ? [genericSheet("Pajak", taxColumns(), taxes.map(taxRow))] : []),
    ...(distributions.length
      ? [genericSheet("Dividen", distributionColumns(), distributions.map(distributionRow))]
      : []),
  ], detectDataStatus(sources));
}

async function salesReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const [historical, sales, products, categories, historicalProducts] = await Promise.all([
    fetchRows<DailySale>("daily_sales_summaries", (query) =>
      query
        .select("sale_date,total_sales,bill_count,cash,debit_edc_bca,qris_dretail,qris_dynamic_bca,qris_static_bca,qris_static_bri")
        .gte("sale_date", period.startDate)
        .lte("sale_date", period.endDate),
    ),
    fetchSales(period.startDate, period.endDate),
    fetchRows<Product>("products", (query) =>
      query.select("id,name,sku,unit,sales_category_id"),
    ),
    fetchRows<NamedCategory>("sales_categories", (query) => query.select("id,name")),
    fetchRows<HistoricalProduct>("historical_product_daily_quantities", (query) =>
      query
        .select("sale_date,canonical_product_name,category_name,quantity")
        .gte("sale_date", period.startDate)
        .lte("sale_date", period.endDate),
    ),
  ]);
  const historicalDates = new Set(historical.map((row) => row.sale_date));
  const liveSales = sales.filter((row) => !historicalDates.has(row.transaction_date));
  const productMap = mapBy(products);
  const categoryMap = mapBy(categories);
  const daily = new Map<string, { revenue: number; bills: number | null; quantity: number }>();
  for (const row of historical) {
    daily.set(row.sale_date, {
      revenue: toFiniteNumber(row.total_sales),
      bills: row.bill_count,
      quantity: historicalProducts
        .filter((item) => item.sale_date === row.sale_date)
        .reduce((sum, item) => sum + toFiniteNumber(item.quantity), 0),
    });
  }
  for (const row of liveSales) {
    const current = daily.get(row.transaction_date) ?? { revenue: 0, bills: null, quantity: 0 };
    current.revenue += toFiniteNumber(row.amount);
    current.quantity += toFiniteNumber(row.quantity);
    daily.set(row.transaction_date, current);
  }
  const revenue = [...daily.values()].reduce((sum, row) => sum + row.revenue, 0);
  const quantity = [...daily.values()].reduce((sum, row) => sum + row.quantity, 0);
  const bills = [...daily.values()].reduce((sum, row) => sum + (row.bills ?? 0), 0);
  const sources = [...historical.map(() => "historical_import"), ...liveSales.map((row) => row.record_source)];
  const productRows = [
    ...historicalProducts.map((row) => ({
      Tanggal: parseReportDate(row.sale_date),
      Produk: row.canonical_product_name,
      Kategori: row.category_name ?? "Tidak tercatat",
      Quantity: toFiniteNumber(row.quantity),
      Omzet: null,
      Sumber: "Historical — harga produk tidak tersedia",
    })),
    ...liveSales.map((row) => ({
      Tanggal: parseReportDate(row.transaction_date),
      Produk: productMap.get(row.product_id)?.name ?? "Produk tidak ditemukan",
      Kategori: categoryMap.get(row.sales_category_id)?.name ?? "Tidak tercatat",
      Quantity: toFiniteNumber(row.quantity),
      Omzet: toFiniteNumber(row.amount),
      Sumber: "Operational",
    })),
  ];
  const paymentRows = historical.flatMap((row) =>
    [
      ["Tunai", row.cash],
      ["Debit EDC BCA", row.debit_edc_bca],
      ["QRIS D-Retail", row.qris_dretail],
      ["QRIS Dynamic BCA", row.qris_dynamic_bca],
      ["QRIS Static BCA", row.qris_static_bca],
      ["QRIS Static BRI", row.qris_static_bri],
    ]
      .filter(([, amount]) => toFiniteNumber(amount) !== 0)
      .map(([method, amount]) => ({
        Tanggal: parseReportDate(row.sale_date),
        "Metode Pembayaran": String(method),
        Nilai: toFiniteNumber(amount),
        Sumber: "Historical",
      })),
  );
  if (!daily.size && !productRows.length) return emptyPayload(request, period);
  return payload(request, period, historical.length + liveSales.length, [
    summarySheet([
      metric("Periode", period.label),
      metric("Omzet", revenue),
      metric("Bill tercatat", bills || null),
      metric("Rata-rata nilai bill", bills ? revenue / bills : null),
      metric("Total quantity", quantity),
      metric("Hari aktif", daily.size),
    ]),
    genericSheet(
      "Penjualan Harian",
      [
        col("Tanggal", "date", 15),
        col("Omzet", "currency", 18),
        col("Bill", "integer", 12),
        col("Quantity", "integer", 12),
      ],
      [...daily.entries()].sort().map(([date, row]) => ({
        Tanggal: parseReportDate(date),
        Omzet: row.revenue,
        Bill: row.bills,
        Quantity: row.quantity,
      })),
    ),
    genericSheet(
      "Produk",
      [
        col("Tanggal", "date", 15),
        col("Produk", "text", 28),
        col("Kategori", "text", 22),
        col("Quantity", "integer", 12),
        col("Omzet", "currency", 18),
        col("Sumber", "text", 34),
      ],
      productRows,
    ),
    genericSheet(
      "Metode Pembayaran",
      [
        col("Tanggal", "date", 15),
        col("Metode Pembayaran", "text", 24),
        col("Nilai", "currency", 18),
        col("Sumber", "text", 16),
      ],
      paymentRows,
      "Metode pembayaran tidak tersedia pada granularitas sumber periode ini.",
    ),
  ], detectDataStatus(sources));
}

async function visitorsReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const [historical, live] = await Promise.all([
    fetchRows<Traffic>("customer_traffic_daily", (query) =>
      query
        .select("traffic_date,adult_visitors,child_visitors,total_visitors,bill_count")
        .gte("traffic_date", period.startDate)
        .lte("traffic_date", period.endDate),
    ),
    fetchRows<VisitorVisit>("visitor_visits", (query) =>
      query
        .select("check_in_at")
        .gte("check_in_at", `${period.startDate}T00:00:00+07:00`)
        .lte("check_in_at", `${period.endDate}T23:59:59+07:00`)
        .is("deleted_at", null),
    ),
  ]);
  const historicalDates = new Set(historical.map((row) => row.traffic_date));
  const liveByDate = new Map<string, number>();
  for (const visit of live) {
    const date = jakartaDateFromTimestamp(visit.check_in_at);
    if (!historicalDates.has(date)) liveByDate.set(date, (liveByDate.get(date) ?? 0) + 1);
  }
  const rows = [
    ...historical.map((row) => ({
      Tanggal: parseReportDate(row.traffic_date),
      Dewasa: toFiniteNumber(row.adult_visitors),
      Anak: toFiniteNumber(row.child_visitors),
      Total: toFiniteNumber(row.total_visitors),
      Bill: row.bill_count,
      Sumber: "Historical",
    })),
    ...[...liveByDate].map(([date, total]) => ({
      Tanggal: parseReportDate(date),
      Dewasa: null,
      Anak: null,
      Total: total,
      Bill: null,
      Sumber: "Operational — kelompok umur tidak dicatat",
    })),
  ].sort((a, b) => a.Tanggal.getTime() - b.Tanggal.getTime());
  if (!rows.length) return emptyPayload(request, period);
  return payload(request, period, rows.length, [
    summarySheet([
      metric("Periode", period.label),
      metric("Dewasa", sum(rows, "Dewasa")),
      metric("Anak", sum(rows, "Anak")),
      metric("Total pengunjung", sum(rows, "Total")),
      metric("Bill tercatat", sum(rows, "Bill") || null),
    ]),
    genericSheet(
      "Harian",
      [
        col("Tanggal", "date", 15),
        col("Dewasa", "integer", 12),
        col("Anak", "integer", 12),
        col("Total", "integer", 12),
        col("Bill", "integer", 12),
        col("Sumber", "text", 34),
      ],
      rows,
    ),
  ], historical.length && liveByDate.size ? "Combined" : historical.length ? "Historical" : "Operational");
}

async function expensesReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const [expenses, categories, items, purchases] = await Promise.all([
    fetchRows<Expense>("expenses", (query) =>
      query
        .select("transaction_date,expense_category_id,expense_item_id,quantity,unit_price,amount,notes,record_source")
        .gte("transaction_date", period.startDate)
        .lte("transaction_date", period.endDate)
        .is("deleted_at", null),
    ),
    fetchRows<NamedCategory>("expense_categories", (query) => query.select("id,name")),
    fetchRows<ExpenseItem>("expense_items", (query) => query.select("id,name")),
    fetchPurchases(period.startDate, period.endDate),
  ]);
  const categoryMap = mapBy(categories);
  const itemMap = mapBy(items);
  const rows = [
    ...expenses.map((row) => ({
      Tanggal: parseReportDate(row.transaction_date),
      Kategori: categoryMap.get(row.expense_category_id)?.name ?? "Tidak tercatat",
      Item: itemMap.get(row.expense_item_id)?.name ?? "Item tidak ditemukan",
      Quantity: toFiniteNumber(row.quantity),
      "Harga Satuan": toFiniteNumber(row.unit_price),
      Nominal: toFiniteNumber(row.amount),
      Sumber: `Pengeluaran · ${sourceLabel(row.record_source)}`,
      Catatan: row.notes,
    })),
    ...purchases.items
      .filter((item) => item.financial_class === "operating_expense")
      .map((item) => {
        const invoice = purchases.invoiceMap.get(item.purchase_invoice_id);
        return {
          Tanggal: parseReportDate(invoice?.purchase_date ?? period.startDate),
          Kategori: item.source_category ?? "Beban operasional pembelian",
          Item: item.item_name_raw,
          Quantity: toFiniteNumber(item.quantity),
          "Harga Satuan": toFiniteNumber(item.unit_price),
          Nominal: toFiniteNumber(item.amount),
          Sumber: `Pembelian · ${sourceLabel(item.record_source)}`,
          Catatan: invoice?.notes ?? null,
        };
      }),
  ].sort((a, b) => a.Tanggal.getTime() - b.Tanggal.getTime());
  if (!rows.length) return emptyPayload(request, period);
  return payload(request, period, rows.length, [
    summarySheet([
      metric("Periode", period.label),
      metric("Total beban operasional", sum(rows, "Nominal")),
      metric("Jumlah pencatatan", rows.length),
    ]),
    genericSheet(
      "Pengeluaran",
      [
        col("Tanggal", "date", 15),
        col("Kategori", "text", 24),
        col("Item", "text", 28),
        col("Quantity", "decimal", 12),
        col("Harga Satuan", "currency", 18),
        col("Nominal", "currency", 18),
        col("Sumber", "text", 24),
        col("Catatan", "text", 34),
      ],
      rows,
    ),
  ], detectDataStatus([
    ...expenses.map((row) => row.record_source),
    ...purchases.items.map((row) => row.record_source),
  ]));
}

async function purchasesReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const purchases = await fetchPurchases(period.startDate, period.endDate);
  if (!purchases.invoices.length) return emptyPayload(request, period);
  const itemRows = purchaseItemRows(purchases);
  return payload(request, period, purchases.invoices.length + purchases.items.length, [
    summarySheet([
      metric("Periode", period.label),
      metric("Invoice", purchases.invoices.length),
      metric("Item pembelian", purchases.items.length),
      metric("Total pembelian", purchases.items.reduce((sum, row) => sum + toFiniteNumber(row.amount), 0)),
      metric("HPP", purchases.items.filter((row) => row.financial_class === "hpp").reduce((sum, row) => sum + toFiniteNumber(row.amount), 0)),
      metric("Beban operasional", purchases.items.filter((row) => row.financial_class === "operating_expense").reduce((sum, row) => sum + toFiniteNumber(row.amount), 0)),
    ]),
    purchaseInvoiceSheet(purchases),
    purchaseClassSheet("Item Pembelian", itemRows),
    purchaseClassSheet("HPP", itemRows.filter((row) => row.Klasifikasi === "HPP")),
    purchaseClassSheet(
      "Operasional",
      itemRows.filter((row) => row.Klasifikasi === "Beban Operasional"),
    ),
  ], detectDataStatus(purchases.invoices.map((row) => row.record_source)));
}

async function productsReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const [historical, sales, products, categories, historicalDays] = await Promise.all([
    fetchRows<HistoricalProduct>("historical_product_daily_quantities", (query) =>
      query
        .select("sale_date,canonical_product_name,category_name,quantity")
        .gte("sale_date", period.startDate)
        .lte("sale_date", period.endDate),
    ),
    fetchSales(period.startDate, period.endDate),
    fetchRows<Product>("products", (query) => query.select("id,name,sku,unit,sales_category_id")),
    fetchRows<NamedCategory>("sales_categories", (query) => query.select("id,name")),
    fetchRows<{ sale_date: string }>("daily_sales_summaries", (query) =>
      query.select("sale_date").gte("sale_date", period.startDate).lte("sale_date", period.endDate),
    ),
  ]);
  const coveredDates = new Set(historicalDays.map((row) => row.sale_date));
  const live = sales.filter((row) => !coveredDates.has(row.transaction_date));
  const productMap = mapBy(products);
  const categoryMap = mapBy(categories);
  const rows = [
    ...historical.map((row) => ({
      Tanggal: parseReportDate(row.sale_date),
      Produk: row.canonical_product_name,
      SKU: null,
      Kategori: row.category_name ?? "Tidak tercatat",
      Quantity: toFiniteNumber(row.quantity),
      Omzet: null,
      Sumber: "Historical — revenue per produk tidak tersedia",
    })),
    ...live.map((row) => ({
      Tanggal: parseReportDate(row.transaction_date),
      Produk: productMap.get(row.product_id)?.name ?? "Produk tidak ditemukan",
      SKU: productMap.get(row.product_id)?.sku ?? null,
      Kategori: categoryMap.get(row.sales_category_id)?.name ?? "Tidak tercatat",
      Quantity: toFiniteNumber(row.quantity),
      Omzet: toFiniteNumber(row.amount),
      Sumber: "Operational",
    })),
  ];
  if (!rows.length) return emptyPayload(request, period);
  const grouped = groupRows(rows, "Produk", ["Quantity", "Omzet"]);
  const byCategory = groupRows(rows, "Kategori", ["Quantity", "Omzet"]);
  return payload(request, period, historical.length + live.length, [
    summarySheet([
      metric("Periode", period.label),
      metric("Total quantity", sum(rows, "Quantity")),
      metric("Omzet live yang tersedia", sum(rows, "Omzet") || null),
      metric("Produk unik", grouped.length),
      metric("Catatan historical", "Revenue per produk tidak tersedia pada sumber historical"),
    ]),
    genericSheet(
      "Produk Terjual",
      [
        col("Produk", "text", 30),
        col("Quantity", "integer", 14),
        col("Omzet", "currency", 18),
      ],
      grouped,
    ),
    genericSheet(
      "Kategori",
      [
        col("Kategori", "text", 28),
        col("Quantity", "integer", 14),
        col("Omzet", "currency", 18),
      ],
      byCategory,
    ),
    genericSheet(
      "Detail Sumber",
      [
        col("Tanggal", "date", 15),
        col("Produk", "text", 30),
        col("SKU", "text", 16),
        col("Kategori", "text", 24),
        col("Quantity", "integer", 12),
        col("Omzet", "currency", 18),
        col("Sumber", "text", 38),
      ],
      rows,
    ),
  ], historical.length && live.length ? "Combined" : historical.length ? "Historical" : "Operational");
}

async function suppliersReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const status = String(request.filters?.status ?? "active");
  const suppliers = await fetchRows<Supplier>("suppliers", (query) => query.select("id,supplier_key,supplier_name,contact_person,phone,address,link,is_active,deleted_at,source_type,inputter_name,updated_at,supplier_items(id,item_name_raw,brand_raw,size_raw,price_raw,inputter_name,created_at,updated_at,deleted_at)"));
  const filtered = suppliers.filter((supplier) => {
    const archived = Boolean(supplier.deleted_at) || !supplier.is_active;
    if (status === "archived") return archived;
    if (status === "all") return true;
    return !archived;
  });
  if (!filtered.length) return emptyPayload(request, period);
  const ordered = [...filtered].sort((a,b) => a.supplier_name.localeCompare(b.supplier_name, "id-ID"));
  const rows = ordered.flatMap((supplier) => [...(supplier.supplier_items ?? [])].filter((item) => !item.deleted_at).sort((a,b) => a.created_at.localeCompare(b.created_at)).map((item) => ({
    "No.": 0, "Nama produk": item.item_name_raw, "Merk produk": item.brand_raw ?? "", "Ukuran produk": item.size_raw ?? "", "Harga satuan": item.price_raw ?? "", "Nama Toko": supplier.supplier_name,
    "Alamat (Ketik alamat lengkap jika offline store, ketik nama aplikasi jika online store Shopee/Tokopedia dll)": supplier.address ?? "",
    "Masukkan link google maps jika offline store / Link checkout jika online store": supplier.link ?? "",
    "Nama pelayan/pemilik untuk mempermudah pencarian": supplier.contact_person ?? "",
    "No WA toko (usahakan minta agar bisa mudah kalau mau pesan tinggal ambil)": supplier.phone ?? "",
    _updatedAt: item.updated_at > supplier.updated_at ? item.updated_at : supplier.updated_at,
    _inputter: item.updated_at > supplier.updated_at ? item.inputter_name : supplier.inputter_name,
  })));
  rows.forEach((row,index) => { row["No."] = index + 1; });
  if (!rows.length) return emptyPayload(request, period);
  const result = payload(request, period, rows.length, [
    genericSheet(
      "Supplier Catalog",
      [
        col("No.", "integer", 6), col("Nama produk", "text", 30), col("Merk produk", "text", 20), col("Ukuran produk", "text", 18), col("Harga satuan", "text", 25), col("Nama Toko", "text", 24),
        col("Alamat (Ketik alamat lengkap jika offline store, ketik nama aplikasi jika online store Shopee/Tokopedia dll)", "text", 45),
        col("Masukkan link google maps jika offline store / Link checkout jika online store", "text", 35),
        col("Nama pelayan/pemilik untuk mempermudah pencarian", "text", 28),
        col("No WA toko (usahakan minta agar bisa mudah kalau mau pesan tinggal ambil)", "text", 26),
      ],
      rows,
    ),
  ], "Operational");
  const latest = rows.reduce((a,b) => a._updatedAt > b._updatedAt ? a : b);
  result.supplierUpdateLabel = `Update Terakhir: ${latest._inputter ?? "—"} ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(latest._updatedAt))}`;
  result.filename = `supplier-catalog-lovin-milk-${period.endDate}.xlsx`;
  return result;
}

async function assetsReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const [assets, categories, depreciation] = await Promise.all([
    fetchRows<Asset>("assets", (query) =>
      query
        .select("id,asset_code,asset_name,asset_category_id,acquisition_date,acquisition_cost,capitalization_status,useful_life_months,depreciation_method,monthly_depreciation,location,asset_status,deleted_at,record_source")
        .lte("acquisition_date", period.endDate),
    ),
    fetchRows<AssetCategory>("asset_categories", (query) => query.select("id,name")),
    fetchRows<Depreciation>("asset_depreciation_entries", (query) =>
      query
        .select("asset_id,period_month,depreciation_amount,accumulated_depreciation,ending_book_value,status")
        .lte("period_month", period.endDate)
        .neq("status", "reversed"),
    ),
  ]);
  const categoryMap = mapBy(categories);
  const statusFilter = String(request.filters?.deleted ?? "active");
  const categoryFilter = request.filters?.category;
  const capitalization = request.filters?.capitalization;
  const assetStatus = request.filters?.status;
  const from = String(request.filters?.from ?? "");
  const to = String(request.filters?.to ?? "");
  const filtered = assets.filter((asset) => {
    const archived = Boolean(asset.deleted_at);
    if (statusFilter === "active" && archived) return false;
    if ((statusFilter === "deleted" || statusFilter === "archived") && !archived) return false;
    if (categoryFilter && categoryFilter !== "all" && asset.asset_category_id !== categoryFilter) return false;
    if (capitalization && capitalization !== "all" && asset.capitalization_status !== capitalization) return false;
    if (assetStatus && assetStatus !== "all" && asset.asset_status !== assetStatus) return false;
    if (from && asset.acquisition_date < from) return false;
    if (to && asset.acquisition_date > to) return false;
    return true;
  });
  if (!filtered.length) return emptyPayload(request, period);
  const rows = filtered.map((asset) => {
    const entries = depreciation
      .filter((entry) => entry.asset_id === asset.id)
      .sort((a, b) => a.period_month.localeCompare(b.period_month));
    const accumulated = entries.reduce(
      (sum, entry) => sum + toFiniteNumber(entry.depreciation_amount),
      0,
    );
    return {
      "Kode Aset": asset.asset_code,
      "Nama Aset": asset.asset_name,
      Kategori: categoryMap.get(asset.asset_category_id)?.name ?? "Tidak tercatat",
      "Tanggal Perolehan": parseReportDate(asset.acquisition_date),
      "Nilai Perolehan": toFiniteNumber(asset.acquisition_cost),
      Perlakuan: capitalizationLabel(asset.capitalization_status),
      "Masa Manfaat (Bulan)": asset.useful_life_months,
      "Penyusutan Bulanan": toFiniteNumber(asset.monthly_depreciation),
      "Akumulasi Penyusutan": accumulated,
      "Nilai Buku": Math.max(toFiniteNumber(asset.acquisition_cost) - accumulated, 0),
      Lokasi: asset.location,
      "Status Aset": asset.asset_status,
      "Status Arsip": asset.deleted_at ? "Diarsipkan" : "Aktif",
      Sumber: sourceLabel(asset.record_source),
    };
  });
  const categoryRows = groupRows(rows, "Kategori", ["Nilai Perolehan", "Nilai Buku"]);
  return payload(request, period, filtered.length, [
    genericSheet("Register Aset", assetColumns(), rows),
    summarySheet([
      metric("As-of date", period.endDate),
      metric("Jumlah aset", rows.length),
      metric("Nilai perolehan", sum(rows, "Nilai Perolehan")),
      metric("Tracking-only", rows.filter((row) => row.Perlakuan === "Tracking-only").length),
      metric("Dikapitalisasi", rows.filter((row) => row.Perlakuan === "Dikapitalisasi").length),
      metric("Akumulasi penyusutan", sum(rows, "Akumulasi Penyusutan")),
      metric("Nilai buku", sum(rows, "Nilai Buku")),
    ]),
    genericSheet(
      "Kategori",
      [
        col("Kategori", "text", 28),
        col("Nilai Perolehan", "currency", 20),
        col("Nilai Buku", "currency", 20),
      ],
      categoryRows,
    ),
  ], detectDataStatus(filtered.map((row) => row.record_source)), true);
}

async function depreciationReport(request: ReportExportRequest) {
  const period = periodOf(request);
  const [assets, categories, entries] = await Promise.all([
    fetchRows<Asset>("assets", (query) =>
      query
        .select("id,asset_code,asset_name,asset_category_id,acquisition_date,acquisition_cost,capitalization_status,useful_life_months,depreciation_method,monthly_depreciation,location,asset_status,deleted_at,record_source")
        .lte("acquisition_date", period.endDate),
    ),
    fetchRows<AssetCategory>("asset_categories", (query) => query.select("id,name")),
    fetchRows<Depreciation>("asset_depreciation_entries", (query) =>
      query
        .select("asset_id,period_month,depreciation_amount,accumulated_depreciation,ending_book_value,status")
        .gte("period_month", period.startDate)
        .lte("period_month", period.endDate)
        .neq("status", "reversed"),
    ),
  ]);
  const assetMap = mapBy(assets);
  const categoryMap = mapBy(categories);
  const rows = entries.map((entry) => {
    const asset = assetMap.get(entry.asset_id);
    return {
      Periode: parseReportDate(entry.period_month),
      "Kode Aset": asset?.asset_code ?? "Tidak ditemukan",
      Aset: asset?.asset_name ?? "Aset tidak ditemukan",
      Kategori: asset ? categoryMap.get(asset.asset_category_id)?.name ?? "Tidak tercatat" : null,
      "Nilai Perolehan": asset ? toFiniteNumber(asset.acquisition_cost) : null,
      Kapitalisasi: asset ? capitalizationLabel(asset.capitalization_status) : null,
      "Masa Manfaat": asset?.useful_life_months ?? null,
      Metode: asset?.depreciation_method ?? null,
      Penyusutan: toFiniteNumber(entry.depreciation_amount),
      Akumulasi: toFiniteNumber(entry.accumulated_depreciation),
      "Nilai Buku Akhir": toFiniteNumber(entry.ending_book_value),
      Status: entry.status,
    };
  });
  const trackingOnly = assets
    .filter((asset) => asset.capitalization_status === "tracking_only_expensed")
    .map((asset) => ({
      Periode: parseReportDate(period.endDate),
      "Kode Aset": asset.asset_code,
      Aset: asset.asset_name,
      Kategori: categoryMap.get(asset.asset_category_id)?.name ?? "Tidak tercatat",
      "Nilai Perolehan": toFiniteNumber(asset.acquisition_cost),
      Kapitalisasi: "Tracking-only",
      "Masa Manfaat": asset.useful_life_months,
      Metode: asset.depreciation_method,
      Penyusutan: 0,
      Akumulasi: 0,
      "Nilai Buku Akhir": toFiniteNumber(asset.acquisition_cost),
      Status: "Tidak disusutkan",
    }));
  const allRows = [...rows, ...trackingOnly];
  if (!allRows.length) return emptyPayload(request, period);
  return payload(request, period, allRows.length, [
    summarySheet([
      metric("Periode", period.label),
      metric("Penyusutan periode", sum(rows, "Penyusutan")),
      metric("Aset disusutkan", new Set(rows.map((row) => row["Kode Aset"])).size),
      metric("Tracking-only", trackingOnly.length),
    ]),
    depreciationSheet([], allRows),
  ], detectDataStatus(assets.map((row) => row.record_source)));
}

async function fetchPurchases(startDate: string, endDate: string) {
  const [invoices, items, suppliers] = await Promise.all([
    fetchRows<PurchaseInvoice>("purchase_invoices", (query) =>
      query
        .select("id,purchase_date,receipt_reference,supplier_id,supplier_name_raw,notes,record_source")
        .gte("purchase_date", startDate)
        .lte("purchase_date", endDate)
        .eq("status", "recorded")
        .is("deleted_at", null),
    ),
    fetchRows<PurchaseItem>("purchase_items", (query) =>
      query
        .select("purchase_invoice_id,item_name_raw,quantity,unit,unit_price,amount,financial_class,source_category,record_source")
        .is("deleted_at", null),
    ),
    fetchRows<Supplier>("suppliers", (query) =>
      query.select("id,supplier_key,supplier_name,contact_person,phone,address,is_active,deleted_at,source_type"),
    ),
  ]);
  const invoiceMap = new Map(invoices.map((row) => [row.id, row]));
  const filteredItems = items.filter((item) => invoiceMap.has(item.purchase_invoice_id));
  return {
    invoices,
    items: filteredItems,
    suppliers,
    invoiceMap,
    supplierMap: mapBy(suppliers),
  };
}

async function fetchSales(startDate: string, endDate: string) {
  return fetchRows<Sale>("sales", (query) =>
    query
      .select("transaction_date,product_id,sales_category_id,quantity,unit_price,amount,notes,entry_source,record_source,visitor_visit_id")
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate)
      .is("deleted_at", null),
  );
}

async function fetchRows<Row>(
  table: string,
  build: (query: ReturnType<typeof actualClient.from<Row>>) => {
    range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: unknown }>;
  },
): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let page = 0; page < 100; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(actualClient.from<Row>(table)).range(
      from,
      from + pageSize - 1,
    );
    if (error) throw error;
    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
  throw new ReportExportError(
    "query_failure",
    "Dataset terlalu besar untuk export browser. Persempit periode export.",
  );
}

function periodOf(request: ReportExportRequest) {
  const { startDate, endDate } = toInclusiveDateRange(request.range);
  return { startDate, endDate, label: reportPeriodLabel(startDate, endDate) };
}

function payload(
  request: ReportExportRequest,
  period: ReturnType<typeof periodOf>,
  sourceRecordCount: number,
  sheets: ExportSheet[],
  dataStatus: ReportExportPayload["dataStatus"],
  asOf = false,
): ReportExportPayload {
  return {
    reportType: request.reportType,
    title: REPORT_LABELS[request.reportType],
    startDate: period.startDate,
    endDate: period.endDate,
    periodLabel: period.label,
    dataStatus,
    sheets,
    sourceRecordCount,
    filename: safeReportFilename(request.reportType, period.startDate, period.endDate),
    ...(asOf ? { asOfDate: period.endDate } : {}),
  };
}

function emptyPayload(
  request: ReportExportRequest,
  period: ReturnType<typeof periodOf>,
): ReportExportPayload {
  return payload(request, period, 0, [], "No actual data");
}

function summarySheet(rows: Array<Record<string, unknown>>): ExportSheet {
  return genericSheet(
    "Ringkasan",
    [
      col("Metrik", "text", 30),
      col("Nilai", "text", 28),
    ],
    rows as Array<Record<string, never>>,
  );
}

function metric(name: string, value: unknown) {
  if (typeof value !== "number") return { Metrik: name, Nilai: value as never };
  const currencyMetric =
    /omzet|hpp|laba|beban|ebit|pajak|dividen|nilai|penyusutan|rata-rata|total pembelian/i.test(
      name,
    );
  return {
    Metrik: name,
    Nilai: {
      value,
      kind: currencyMetric ? "currency" : "integer",
    } as never,
  };
}

function genericSheet(
  name: string,
  columns: ExportSheet["columns"],
  rows: Array<Record<string, unknown>>,
  emptyMessage?: string,
): ExportSheet {
  return {
    name,
    columns,
    rows: rows as ExportSheet["rows"],
    emptyMessage,
  };
}

function col(label: string, kind: ExportSheet["columns"][number]["kind"], width?: number) {
  return { key: label, label, kind, width };
}

function purchaseInvoiceSheet(
  purchases: Awaited<ReturnType<typeof fetchPurchases>>,
  name = "Invoice",
) {
  const rows = purchases.invoices.map((invoice) => {
    const supplier = invoice.supplier_id ? purchases.supplierMap.get(invoice.supplier_id) : null;
    const items = purchases.items.filter((item) => item.purchase_invoice_id === invoice.id);
    return {
      Tanggal: parseReportDate(invoice.purchase_date),
      Referensi: invoice.receipt_reference ?? "Tidak tercatat",
      Supplier:
        supplier?.supplier_name || invoice.supplier_name_raw || "Supplier tidak tercatat",
      "Jumlah Item": items.length,
      Total: items.reduce((sum, item) => sum + toFiniteNumber(item.amount), 0),
      Sumber: sourceLabel(invoice.record_source),
      Catatan: invoice.notes,
    };
  });
  return genericSheet(
    name,
    [
      col("Tanggal", "date", 15),
      col("Referensi", "text", 20),
      col("Supplier", "text", 28),
      col("Jumlah Item", "integer", 14),
      col("Total", "currency", 18),
      col("Sumber", "text", 18),
      col("Catatan", "text", 34),
    ],
    rows,
  );
}

function purchaseItemRows(purchases: Awaited<ReturnType<typeof fetchPurchases>>) {
  return purchases.items.map((item) => {
    const invoice = purchases.invoiceMap.get(item.purchase_invoice_id);
    const supplier = invoice?.supplier_id
      ? purchases.supplierMap.get(invoice.supplier_id)
      : null;
    return {
      Tanggal: parseReportDate(invoice?.purchase_date ?? "1970-01-01"),
      Referensi: invoice?.receipt_reference ?? "Tidak tercatat",
      Supplier:
        supplier?.supplier_name || invoice?.supplier_name_raw || "Supplier tidak tercatat",
      Item: item.item_name_raw,
      Quantity: toFiniteNumber(item.quantity),
      Unit: item.unit ?? "Tidak tercatat",
      "Harga Satuan": toFiniteNumber(item.unit_price),
      Amount: toFiniteNumber(item.amount),
      Klasifikasi: financialClassLabel(item.financial_class),
      Sumber: sourceLabel(item.record_source),
      Catatan: invoice?.notes ?? null,
    };
  });
}

function purchaseClassSheet(name: string, rows: Array<Record<string, unknown>>): ExportSheet {
  return genericSheet(
    name,
    [
      col("Tanggal", "date", 15),
      col("Referensi", "text", 18),
      col("Supplier", "text", 26),
      col("Item", "text", 30),
      col("Quantity", "decimal", 12),
      col("Unit", "text", 12),
      col("Harga Satuan", "currency", 18),
      col("Amount", "currency", 18),
      col("Klasifikasi", "text", 20),
      col("Sumber", "text", 18),
      col("Catatan", "text", 32),
    ],
    rows,
  );
}

function depreciationSheet(
  entries: Depreciation[],
  mappedRows: Array<Record<string, unknown>>,
  name = "Detail Penyusutan",
) {
  const rows = mappedRows.length
    ? mappedRows
    : entries.map((entry) => ({
        Periode: parseReportDate(entry.period_month),
        Aset: "Tidak tercatat",
        Penyusutan: toFiniteNumber(entry.depreciation_amount),
        Akumulasi: toFiniteNumber(entry.accumulated_depreciation),
        "Nilai Buku Akhir": toFiniteNumber(entry.ending_book_value),
        Status: entry.status,
      }));
  const complete = mappedRows.length > 0;
  return genericSheet(
    name,
    complete
      ? [
          col("Periode", "date", 15),
          col("Kode Aset", "text", 16),
          col("Aset", "text", 28),
          col("Kategori", "text", 22),
          col("Nilai Perolehan", "currency", 20),
          col("Kapitalisasi", "text", 18),
          col("Masa Manfaat", "integer", 14),
          col("Metode", "text", 18),
          col("Penyusutan", "currency", 18),
          col("Akumulasi", "currency", 18),
          col("Nilai Buku Akhir", "currency", 20),
          col("Status", "status", 18),
        ]
      : [
          col("Periode", "date", 15),
          col("Aset", "text", 18),
          col("Penyusutan", "currency", 18),
          col("Akumulasi", "currency", 18),
          col("Nilai Buku Akhir", "currency", 20),
          col("Status", "status", 16),
        ],
    rows,
    "Belum ada penyusutan pada periode ini.",
  );
}

function taxColumns() {
  return [
    col("Periode Mulai", "date", 15),
    col("Periode Akhir", "date", 15),
    col("Jenis Pajak", "text", 24),
    col("Nilai", "currency", 18),
    col("Status", "status", 16),
    col("Tanggal Bayar", "date", 15),
    col("Catatan", "text", 30),
  ];
}
function taxRow(row: JsonRecord) {
  return {
    "Periode Mulai": parseReportDate(String(row.period_start)),
    "Periode Akhir": parseReportDate(String(row.period_end)),
    "Jenis Pajak": String(row.tax_type),
    Nilai: toFiniteNumber(row.amount),
    Status: String(row.status),
    "Tanggal Bayar": row.payment_date ? parseReportDate(String(row.payment_date)) : null,
    Catatan: row.notes as string | null,
  };
}
function distributionColumns() {
  return [
    col("Tanggal", "date", 15),
    col("Jenis", "text", 22),
    col("Penerima", "text", 24),
    col("Nilai", "currency", 18),
    col("Status", "status", 16),
    col("Catatan", "text", 30),
  ];
}
function distributionRow(row: JsonRecord) {
  return {
    Tanggal: parseReportDate(String(row.distribution_date)),
    Jenis: String(row.distribution_type),
    Penerima: row.recipient ? String(row.recipient) : "Tidak tercatat",
    Nilai: toFiniteNumber(row.amount),
    Status: String(row.status),
    Catatan: row.notes as string | null,
  };
}

function assetColumns() {
  return [
    col("Kode Aset", "text", 16),
    col("Nama Aset", "text", 28),
    col("Kategori", "text", 22),
    col("Tanggal Perolehan", "date", 17),
    col("Nilai Perolehan", "currency", 20),
    col("Perlakuan", "text", 18),
    col("Masa Manfaat (Bulan)", "integer", 18),
    col("Penyusutan Bulanan", "currency", 20),
    col("Akumulasi Penyusutan", "currency", 22),
    col("Nilai Buku", "currency", 20),
    col("Lokasi", "text", 22),
    col("Status Aset", "status", 16),
    col("Status Arsip", "status", 16),
    col("Sumber", "text", 16),
  ];
}

function groupRows(
  rows: Array<Record<string, unknown>>,
  key: string,
  numericKeys: string[],
): Array<Record<string, unknown>> {
  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const label = String(row[key] ?? "Tidak tercatat");
    const current = grouped.get(label) ?? { [key]: label };
    for (const numericKey of numericKeys) {
      current[numericKey] = toFiniteNumber(current[numericKey]) + toFiniteNumber(row[numericKey]);
    }
    grouped.set(label, current);
  }
  return [...grouped.values()].sort(
    (left, right) => toFiniteNumber(right[numericKeys[0]]) - toFiniteNumber(left[numericKeys[0]]),
  );
}

function sum(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((total, row) => total + toFiniteNumber(row[key]), 0);
}

function mapBy<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function financialClassLabel(value: string) {
  if (value === "hpp") return "HPP";
  if (value === "operating_expense") return "Beban Operasional";
  if (value === "asset") return "Aset";
  return "Lainnya";
}
function capitalizationLabel(value: string) {
  return value === "capitalized" ? "Dikapitalisasi" : "Tracking-only";
}
function sourceLabel(value: string) {
  if (value === "historical_import") return "Historical";
  if (value === "adjustment") return "Koreksi";
  return "Operational";
}
function jakartaDateFromTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
