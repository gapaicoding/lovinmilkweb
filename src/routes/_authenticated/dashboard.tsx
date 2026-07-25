import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeDollarSign,
  Banknote,
  Calculator,
  CircleDollarSign,
  Loader2,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  ShoppingBag,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { DashboardKpiCard } from "@/components/dashboard/DashboardKpiCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  JUNE_FINANCE_BATCH_KEY,
  JUNE_FINANCE_MONTH,
  fetchFinancialStatement,
  formatFinanceMonth,
  getFinanceErrorMessage,
  isActualJuneStatement,
  monthInputToStart,
  parseMonthStart,
} from "@/lib/juneFinance";
import { formatRupiah } from "@/lib/format";

interface DashboardSearch {
  month?: string;
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    month: parseMonthStart(search.month),
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { isStaff } = useAuth();
  const month = search.month ?? JUNE_FINANCE_MONTH;

  useEffect(() => {
    if (!search.month) {
      void navigate({
        search: {
          month: JUNE_FINANCE_MONTH,
        },
        replace: true,
      });
    }
  }, [navigate, search.month]);

  const statementQuery = useQuery({
    queryKey: [
      "actual-finance",
      "statement",
      {
        month,
        batchKey: JUNE_FINANCE_BATCH_KEY,
      },
    ],
    queryFn: () => fetchFinancialStatement(month),
    staleTime: 60_000,
    enabled: !isStaff,
  });

  const operationalQuery = useQuery({
    queryKey: ["operational-dashboard", { month }],
    queryFn: () => fetchOperationalDashboard(month),
    staleTime: 60_000,
    enabled: isStaff,
  });

  const statement = statementQuery.data ?? null;
  const isActualJune = isActualJuneStatement(statement);
  const activeQuery = isStaff ? operationalQuery : statementQuery;

  const handleMonthChange = (value: string) => {
    const nextMonth = monthInputToStart(value);

    if (!nextMonth) {
      return;
    }

    void navigate({
      search: {
        month: nextMonth,
      },
      replace: true,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          isStaff
            ? "Ringkasan operasional agregat sesuai hak akses staff."
            : "Ringkasan laporan aktual yang dihitung langsung dari sumber keuangan terverifikasi."
        }
        actions={
          isStaff && operationalQuery.data?.sourceDays ? (
            <Badge className="w-fit">
              <PackageCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              Data Operasional Aktual
            </Badge>
          ) : isActualJune ? (
            <Badge className="w-fit">
              <PackageCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              Data Aktual Juni 2026
            </Badge>
          ) : statement ? (
            <Badge variant="outline" className="w-fit">
              Rekonsiliasi diperlukan
            </Badge>
          ) : (
            <Badge variant="outline" className="w-fit">
              {activeQuery.isPending ? "Memuat status data" : "Data aktual tidak tersedia"}
            </Badge>
          )
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="dashboard-finance-month" className="mb-1.5 block text-sm font-medium">
              Bulan laporan
            </label>
            <input
              id="dashboard-finance-month"
              type="month"
              value={month.slice(0, 7)}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <p
            className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground"
            aria-live="polite"
          >
            {activeQuery.isFetching && !activeQuery.isPending ? (
              <>
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                Memperbarui data tanpa mengubah filter…
              </>
            ) : (
              `Periode ${formatFinanceMonth(month)}`
            )}
          </p>
        </CardContent>
      </Card>

      {activeQuery.isError ? (
        <FinanceError
          error={activeQuery.error}
          onRetry={() => {
            void activeQuery.refetch();
          }}
        />
      ) : null}

      {isStaff && operationalQuery.isPending ? (
        <OperationalKpis loading />
      ) : isStaff && operationalQuery.data?.sourceDays ? (
        <>
          <OperationalKpis totals={operationalQuery.data} />
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Akses staff: agregat operasional</AlertTitle>
            <AlertDescription>
              Dashboard ini hanya menampilkan omzet harian agregat, jumlah transaksi, kunjungan, dan
              kuantitas menu. Detail HPP, beban, laba, supplier, pembelian, serta aset tetap
              dibatasi untuk admin oleh RLS.
            </AlertDescription>
          </Alert>
        </>
      ) : isStaff && !operationalQuery.isError ? (
        <EmptyState
          icon={ReceiptText}
          title={`Belum ada data operasional ${formatFinanceMonth(month)}`}
          description="Periode kosong tidak diisi dengan data lama, estimasi, atau dummy."
        />
      ) : statementQuery.isPending ? (
        <FinanceKpis loading />
      ) : statement ? (
        <>
          {statement.batchStatus !== "reconciled" ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Kontrol batch perlu direkonsiliasi ulang</AlertTitle>
              <AlertDescription>
                Data pembelian telah berubah setelah rekonsiliasi terakhir. Angka di bawah
                mencerminkan data saat ini, tetapi tidak diberi label sebagai batch terverifikasi.
              </AlertDescription>
            </Alert>
          ) : null}
          <FinanceKpis statement={statement} />
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
              <StatusItem
                title="Pajak"
                value={statement.taxRecorded ? formatRupiah(statement.taxAmount) : "Belum tersedia"}
                description={
                  statement.taxRecorded
                    ? "Pajak yang sudah dicatat pada laporan aktual."
                    : "Tidak ada nilai pajak fiktif yang ditambahkan."
                }
              />
              <StatusItem
                title={statement.taxRecorded ? "Laba bersih setelah pajak" : "Laba setelah operasi"}
                value={
                  statement.taxRecorded
                    ? statement.netIncomeFinal === null
                      ? "Belum dapat difinalkan"
                      : formatRupiah(statement.netIncomeFinal)
                    : formatRupiah(statement.netIncomeProvisionalBeforeTax)
                }
                description={
                  statement.taxRecorded
                    ? "Nilai final setelah pajak yang sudah dicatat."
                    : "Provisional sebelum pajak, bukan laba bersih final."
                }
              />
              <StatusItem
                title="Dividen"
                value={
                  statement.dividendRecorded
                    ? formatRupiah(statement.dividendAmount)
                    : "Belum tersedia"
                }
                description={
                  statement.dividendRecorded
                    ? "Distribusi pemilik yang sudah dicatat."
                    : "Belum ada distribusi pemilik pada data aktual."
                }
              />
              <StatusItem
                title="Laba ditahan"
                value={
                  statement.retainedEarningsFinal === null
                    ? "Belum dapat difinalkan"
                    : formatRupiah(statement.retainedEarningsFinal)
                }
                description={
                  statement.retainedEarningsFinal === null
                    ? "Menunggu pajak dan dividen yang valid."
                    : "Sudah memperhitungkan pajak dan dividen tercatat."
                }
              />
            </CardContent>
          </Card>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sumber data laporan</AlertTitle>
            <AlertDescription>
              Kartu aktual hanya membaca v_financial_statement_monthly untuk batch Juni 2026. Data
              penjualan dan pengeluaran lama tidak dijumlahkan ke laporan ini.
            </AlertDescription>
          </Alert>
        </>
      ) : !statementQuery.isError ? (
        <EmptyState
          icon={ReceiptText}
          title={`Belum ada data aktual ${formatFinanceMonth(month)}`}
          description="Periode kosong tidak diisi dengan data lama, estimasi, atau dummy. Pilih Juni 2026 untuk melihat laporan aktual yang tersedia."
        />
      ) : null}
    </div>
  );
}

interface OperationalDashboardTotals {
  revenue: number;
  billCount: number;
  visitors: number;
  productQuantity: number;
  sourceDays: number;
}

interface OperationalDashboardRpcRow {
  revenue: number | string | null;
  bill_count: number | string | null;
  visitors: number | string | null;
  product_quantity: number | string | null;
  source_days: number | string | null;
}

interface OperationalDashboardRpcClient {
  rpc(
    functionName: "get_operational_dashboard_month",
    args: {
      p_month_start: string;
      p_batch_key: string;
    },
  ): PromiseLike<{
    data: OperationalDashboardRpcRow[] | null;
    error: {
      code?: string;
      message?: string;
    } | null;
  }>;
}

async function fetchOperationalDashboard(month: string): Promise<OperationalDashboardTotals> {
  const operationalClient = supabase as unknown as OperationalDashboardRpcClient;
  const { data, error } = await operationalClient.rpc("get_operational_dashboard_month", {
    p_month_start: month,
    p_batch_key: JUNE_FINANCE_BATCH_KEY,
  });

  if (error) {
    throw error;
  }

  const row = data?.[0];

  return {
    revenue: Number(row?.revenue ?? 0),
    billCount: Number(row?.bill_count ?? 0),
    visitors: Number(row?.visitors ?? 0),
    productQuantity: Number(row?.product_quantity ?? 0),
    sourceDays: Number(row?.source_days ?? 0),
  };
}

function OperationalKpis({
  totals,
  loading = false,
}: {
  totals?: OperationalDashboardTotals;
  loading?: boolean;
}) {
  const kpis = [
    {
      title: "Omzet Agregat",
      value: formatRupiah(totals?.revenue ?? 0),
      icon: CircleDollarSign,
      helper: "Total penjualan harian",
      iconBackground: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    {
      title: "Jumlah Transaksi",
      value: new Intl.NumberFormat("id-ID").format(totals?.billCount ?? 0),
      icon: ShoppingBag,
      helper: "Total bill pada periode",
      iconBackground: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    {
      title: "Total Pengunjung",
      value: new Intl.NumberFormat("id-ID").format(totals?.visitors ?? 0),
      icon: UsersRound,
      helper: "Dewasa dan anak",
      iconBackground: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      title: "Kuantitas Menu",
      value: new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(
        totals?.productQuantity ?? 0,
      ),
      icon: ReceiptText,
      helper: "Total unit produk historis",
      iconBackground: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
  ];

  return (
    <section
      aria-label="Indikator operasional utama"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {kpis.map((kpi) => (
        <DashboardKpiCard
          key={kpi.title}
          title={kpi.title}
          value={kpi.value}
          icon={kpi.icon}
          helper={kpi.helper}
          loading={loading}
          iconBackground={kpi.iconBackground}
        />
      ))}
    </section>
  );
}

function FinanceKpis({
  statement,
  loading = false,
}: {
  statement?: {
    revenue: number;
    hpp: number;
    grossProfit: number;
    operatingExpense: number;
    ebitda: number;
    depreciation: number;
    ebitOperatingProfit: number;
  };
  loading?: boolean;
}) {
  const kpis = [
    {
      title: "Omzet",
      value: statement?.revenue ?? 0,
      icon: CircleDollarSign,
      helper: "Pendapatan aktual",
      iconBackground: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    {
      title: "HPP",
      value: statement?.hpp ?? 0,
      icon: ReceiptText,
      helper: "Harga pokok penjualan",
      iconBackground: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    {
      title: "Laba Kotor",
      value: statement?.grossProfit ?? 0,
      icon: TrendingUp,
      helper: "Omzet dikurangi HPP",
      iconBackground: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      title: "Beban Operasional",
      value: statement?.operatingExpense ?? 0,
      icon: Banknote,
      helper: "OpEx terklasifikasi",
      iconBackground: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    },
    {
      title: "EBITDA",
      value: statement?.ebitda ?? 0,
      icon: BadgeDollarSign,
      helper: "Sebelum bunga, pajak, depresiasi",
      iconBackground: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
    {
      title: "Penyusutan",
      value: statement?.depreciation ?? 0,
      icon: Calculator,
      helper: "Entri depresiasi posted",
      iconBackground: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    },
    {
      title: "EBIT / Laba Operasional",
      value: statement?.ebitOperatingProfit ?? 0,
      icon: TrendingUp,
      helper: "EBITDA dikurangi penyusutan",
      iconBackground: "bg-primary/10 text-primary",
    },
  ];

  return (
    <section
      aria-label="Indikator keuangan utama"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {kpis.map((kpi) => (
        <DashboardKpiCard
          key={kpi.title}
          title={kpi.title}
          value={formatRupiah(kpi.value)}
          icon={kpi.icon}
          helper={kpi.helper}
          loading={loading}
          iconBackground={kpi.iconBackground}
        />
      ))}
    </section>
  );
}

function StatusItem({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function FinanceError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Laporan aktual gagal dimuat</AlertTitle>
      <AlertDescription>
        <p>{getFinanceErrorMessage(error)}</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          <RefreshCcw aria-hidden="true" className="mr-2 h-4 w-4" />
          Coba lagi
        </Button>
      </AlertDescription>
    </Alert>
  );
}
