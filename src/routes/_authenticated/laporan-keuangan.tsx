import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Calculator,
  FileSpreadsheet,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Rows3,
} from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type FinanceBreakdownFilter,
  type FinancialStatement,
  type PurchaseBreakdownItem,
  JUNE_FINANCE_BATCH_KEY,
  JUNE_FINANCE_MONTH,
  fetchFinancialStatement,
  fetchPurchaseBreakdown,
  formatFinanceMonth,
  getFinanceErrorMessage,
  isActualJuneStatement,
  monthInputToStart,
  parseBreakdownFilter,
  parseMonthStart,
} from "@/lib/juneFinance";
import { formatRupiah } from "@/lib/format";

interface FinanceReportSearch {
  month?: string;
  breakdown?: FinanceBreakdownFilter;
}

export const Route = createFileRoute("/_authenticated/laporan-keuangan")({
  validateSearch: (search: Record<string, unknown>): FinanceReportSearch => ({
    month: parseMonthStart(search.month),
    breakdown: parseBreakdownFilter(search.breakdown),
  }),
  component: FinanceReportPage,
});

function FinanceReportPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const month = search.month ?? JUNE_FINANCE_MONTH;
  const breakdownFilter = search.breakdown ?? "all";

  useEffect(() => {
    if (!search.month || !search.breakdown) {
      void navigate({
        search: {
          month,
          breakdown: breakdownFilter,
        },
        replace: true,
      });
    }
  }, [breakdownFilter, month, navigate, search.breakdown, search.month]);

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
  });

  const statement = statementQuery.data ?? null;

  const breakdownQuery = useQuery({
    queryKey: [
      "actual-finance",
      "purchase-breakdown",
      {
        month,
        filter: breakdownFilter,
        importBatchId: statement?.importBatchId ?? null,
      },
    ],
    enabled: Boolean(statement?.importBatchId),
    queryFn: () =>
      fetchPurchaseBreakdown({
        importBatchId: statement?.importBatchId ?? "",
        monthStart: month,
        filter: breakdownFilter,
      }),
    staleTime: 60_000,
  });

  const handleMonthChange = (value: string) => {
    const nextMonth = monthInputToStart(value);

    if (!nextMonth) {
      return;
    }

    void navigate({
      search: {
        month: nextMonth,
        breakdown: breakdownFilter,
      },
      replace: true,
    });
  };

  const handleBreakdownChange = (value: string) => {
    const nextFilter = parseBreakdownFilter(value);

    if (!nextFilter) {
      return;
    }

    void navigate({
      search: {
        month,
        breakdown: nextFilter,
      },
      replace: true,
    });
  };

  const isBackgroundFetching =
    (statementQuery.isFetching && !statementQuery.isPending) ||
    (breakdownQuery.isFetching && !breakdownQuery.isPending);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Keuangan"
        description="Laporan laba rugi aktual berbasis batch, terpisah dari data operasional lama."
        actions={
          isActualJuneStatement(statement) ? (
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
              {statementQuery.isPending ? "Memuat status data" : "Data aktual tidak tersedia"}
            </Badge>
          )
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,18rem)_minmax(0,18rem)_1fr] lg:items-end">
          <div>
            <label htmlFor="finance-report-month" className="mb-1.5 block text-sm font-medium">
              Bulan laporan
            </label>
            <input
              id="finance-report-month"
              type="month"
              value={month.slice(0, 7)}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="finance-breakdown-filter" className="mb-1.5 block text-sm font-medium">
              Rincian pembelian
            </label>
            <Select value={breakdownFilter} onValueChange={handleBreakdownChange}>
              <SelectTrigger id="finance-breakdown-filter" aria-label="Filter rincian pembelian">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua klasifikasi</SelectItem>
                <SelectItem value="hpp">HPP</SelectItem>
                <SelectItem value="operating_expense">Beban operasional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p
            className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground lg:justify-end"
            aria-live="polite"
          >
            {isBackgroundFetching ? (
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

      {statementQuery.isError ? (
        <ReportError
          title="Laporan keuangan gagal dimuat"
          error={statementQuery.error}
          onRetry={() => {
            void statementQuery.refetch();
          }}
        />
      ) : null}

      {statementQuery.isPending ? (
        <StatementSkeleton />
      ) : statement ? (
        <>
          {statement.batchStatus !== "reconciled" ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Kontrol batch perlu direkonsiliasi ulang</AlertTitle>
              <AlertDescription>
                Mutasi manual telah mengubah data pembelian setelah rekonsiliasi terakhir. Laporan
                tetap memakai data saat ini, tetapi status terverifikasi dinonaktifkan sampai
                kontrol dijalankan ulang.
              </AlertDescription>
            </Alert>
          ) : null}
          <StatementStatus statement={statement} />
          <FinancialStatementCard statement={statement} />

          {breakdownQuery.isError ? (
            <ReportError
              title="Rincian pembelian tidak dapat dimuat"
              error={breakdownQuery.error}
              onRetry={() => {
                void breakdownQuery.refetch();
              }}
            />
          ) : null}

          <BreakdownSection
            statement={statement}
            filter={breakdownFilter}
            data={breakdownQuery.data ?? null}
            loading={breakdownQuery.isPending && !breakdownQuery.isError}
          />
        </>
      ) : !statementQuery.isError ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={`Belum ada laporan aktual ${formatFinanceMonth(month)}`}
          description="Tidak ada actual data untuk periode ini. Sistem tidak menggunakan data lama, estimasi, atau dummy sebagai pengganti."
        />
      ) : null}
    </div>
  );
}

function StatementStatus({ statement }: { statement: FinancialStatement }) {
  return (
    <Card>
      <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatusItem
          label="Status laporan"
          value={formatStatementStatus(statement.statementStatus)}
        />
        <StatusItem
          label="Pajak"
          value={statement.taxRecorded ? formatRupiah(statement.taxAmount) : "Belum tersedia"}
        />
        <StatusItem
          label="Dividen"
          value={
            statement.dividendRecorded ? formatRupiah(statement.dividendAmount) : "Belum tersedia"
          }
        />
        <StatusItem
          label="Laba ditahan"
          value={
            statement.retainedEarningsFinal === null
              ? "Belum dapat difinalkan"
              : formatRupiah(statement.retainedEarningsFinal)
          }
        />
      </CardContent>
    </Card>
  );
}

function FinancialStatementCard({ statement }: { statement: FinancialStatement }) {
  const incomeAfterTax = statement.taxRecorded
    ? statement.netIncomeFinal
    : statement.netIncomeProvisionalBeforeTax;
  const incomeAfterTaxLabel = statement.taxRecorded
    ? "Laba Bersih setelah pajak"
    : "Laba setelah operasi (provisional sebelum pajak)";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laporan laba rugi</CardTitle>
        <CardDescription>
          Angka dihitung oleh v_financial_statement_monthly untuk{" "}
          {formatFinanceMonth(statement.monthStart)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <StatementBlock
          rows={[
            {
              label: "Omzet",
              value: statement.revenue,
            },
            {
              operator: "−",
              label: "HPP",
              value: statement.hpp,
            },
            {
              operator: "=",
              label: "Laba Kotor",
              value: statement.grossProfit,
              result: true,
            },
          ]}
        />
        <StatementBlock
          rows={[
            {
              label: "Laba Kotor",
              value: statement.grossProfit,
            },
            {
              operator: "−",
              label: "Beban Operasional",
              value: statement.operatingExpense,
            },
            {
              operator: "=",
              label: "EBITDA",
              value: statement.ebitda,
              result: true,
            },
          ]}
        />
        <StatementBlock
          rows={[
            {
              label: "EBITDA",
              value: statement.ebitda,
            },
            {
              operator: "−",
              label: "Penyusutan",
              value: statement.depreciation,
            },
            {
              operator: "=",
              label: "EBIT / Laba Operasional",
              value: statement.ebitOperatingProfit,
              result: true,
            },
          ]}
        />
        <StatementBlock
          rows={[
            {
              label: "EBIT / Laba Operasional",
              value: statement.ebitOperatingProfit,
            },
            {
              operator: "−",
              label: "Pajak",
              value: statement.taxRecorded ? statement.taxAmount : null,
              unavailable: !statement.taxRecorded,
            },
            {
              operator: "=",
              label: incomeAfterTaxLabel,
              value: incomeAfterTax,
              unavailable: statement.taxRecorded && incomeAfterTax === null,
              result: true,
              helper: statement.taxRecorded
                ? "Nilai final setelah pajak yang sudah dicatat."
                : "Bukan laba bersih final karena pajak belum tersedia.",
            },
          ]}
        />
        <StatementBlock
          rows={[
            {
              label: incomeAfterTaxLabel,
              value: incomeAfterTax,
              unavailable: statement.taxRecorded && incomeAfterTax === null,
            },
            {
              operator: "−",
              label: "Dividen",
              value: statement.dividendRecorded ? statement.dividendAmount : null,
              unavailable: !statement.dividendRecorded,
            },
            {
              operator: "=",
              label: "Laba Ditahan",
              value: statement.retainedEarningsFinal,
              unavailable: statement.retainedEarningsFinal === null,
              unavailableText: "Belum dapat difinalkan",
              result: true,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function formatStatementStatus(status: string): string {
  switch (status) {
    case "provisional_before_tax":
      return "Provisional sebelum pajak";
    case "net_income_final_dividend_not_supplied":
      return "Final setelah pajak; dividen belum tersedia";
    case "final":
      return "Final";
    default:
      return "Status belum dikenali";
  }
}

interface StatementLine {
  operator?: string;
  label: string;
  value: number | null;
  unavailable?: boolean;
  unavailableText?: string;
  result?: boolean;
  helper?: string;
}

function StatementBlock({ rows }: { rows: StatementLine[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {rows.map((row) => (
        <div
          key={`${row.operator ?? ""}-${row.label}`}
          className={[
            "grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 px-4 py-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto] sm:items-center",
            row.result ? "border-t bg-muted/40 font-semibold" : "",
          ].join(" ")}
        >
          <span aria-hidden="true" className="text-center text-muted-foreground">
            {row.operator ?? ""}
          </span>
          <div className="min-w-0">
            <p>{row.label}</p>
            {row.helper ? (
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">{row.helper}</p>
            ) : null}
          </div>
          <p className="col-start-2 mt-1 tabular-nums sm:col-start-3 sm:mt-0 sm:text-right">
            {row.unavailable ? (row.unavailableText ?? "Belum tersedia") : formatRupiah(row.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function BreakdownSection({
  statement,
  filter,
  data,
  loading,
}: {
  statement: FinancialStatement;
  filter: FinanceBreakdownFilter;
  data: {
    hpp: PurchaseBreakdownItem[];
    operatingExpense: PurchaseBreakdownItem[];
    hppTotal: number;
    operatingExpenseTotal: number;
  } | null;
  loading: boolean;
}) {
  if (loading) {
    return <StatementSkeleton />;
  }

  if (!data) {
    return null;
  }

  return (
    <section aria-labelledby="purchase-breakdown-heading" className="space-y-4">
      <div>
        <h2 id="purchase-breakdown-heading" className="text-lg font-semibold">
          Rincian pembelian
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pengelompokan berasal dari purchase_items dan invoice tercatat pada bulan yang dipilih.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filter !== "operating_expense" ? (
          <BreakdownCard
            title="Breakdown HPP"
            items={data.hpp}
            total={data.hppTotal}
            statementTotal={statement.hpp}
          />
        ) : null}
        {filter !== "hpp" ? (
          <BreakdownCard
            title="Breakdown Beban Operasional"
            items={data.operatingExpense}
            total={data.operatingExpenseTotal}
            statementTotal={statement.operatingExpense}
          />
        ) : null}
      </div>
    </section>
  );
}

function BreakdownCard({
  title,
  items,
  total,
  statementTotal,
}: {
  title: string;
  items: PurchaseBreakdownItem[];
  total: number;
  statementTotal: number;
}) {
  const matchesStatement = Math.abs(total - statementTotal) < 0.01;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant={matchesStatement ? "secondary" : "destructive"}>
            {matchesStatement ? "Sesuai laporan" : "Perlu rekonsiliasi"}
          </Badge>
        </div>
        <CardDescription>
          {items.length} kelompok item · total {formatRupiah(total)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={Rows3}
            title="Tidak ada rincian"
            description="Tidak ada item untuk klasifikasi dan bulan yang dipilih."
          />
        ) : (
          <Table>
            <TableCaption>{title} untuk periode laporan terpilih.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-24 text-right">Baris</TableHead>
                <TableHead className="w-40 text-right">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.key}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.lineCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatRupiah(item.amount)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{formatRupiah(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function StatementSkeleton() {
  return (
    <Card aria-busy="true">
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
        <Calculator aria-hidden="true" className="h-8 w-8 animate-pulse text-muted-foreground" />
        <p className="text-sm font-medium">Memuat laporan keuangan…</p>
        <p className="text-xs text-muted-foreground">
          Menunggu angka aktual dari sumber terverifikasi.
        </p>
      </CardContent>
    </Card>
  );
}

function ReportError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
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
