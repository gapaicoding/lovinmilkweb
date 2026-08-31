import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Search,
  Store,
  Trash2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { SalesTransactionDetail } from "@/components/sales/SalesTransactionDetail";
import { OperationalInputterCard } from "@/components/OperationalInputterCard";
import { Route } from "@/routes/_authenticated/penjualan";
import {
  SalesTransactionForm,
  type SalesTransactionFormSubmitInput,
} from "@/components/sales/SalesTransactionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useSalesTransactions } from "@/hooks/useSalesTransactions";
import { useOperationalInputter } from "@/hooks/useOperationalInputter";
import { displayOperationalInputter } from "@/lib/operationalInputter";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import {
  calculateTotalQuantity,
  summarizeSubunits,
  type SalesTransaction,
} from "@/lib/salesTransactions";
import { buildOperationalSalesExportPayload } from "@/lib/reportExportData";
import { exportReportToExcel } from "@/lib/reportWorkbook";
import { actualClient } from "@/lib/actualData";

const PAGE_SIZE = 10;

type DeletedFilter = "active" | "deleted" | "all";

type ConfirmActionType = "soft-delete" | "restore" | "hard-delete";

interface ConfirmAction {
  type: ConfirmActionType;
  transaction: SalesTransaction;
}

export function SalesTransactionManager() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { canCreateSales, canEditSales, canArchiveSales, canViewDeletedData, canHardDelete } =
    useAuth();

  const {
    outlet,
    subunits,
    categories,
    products,

    transactions,

    isLoading,
    isFetching,
    isMutating,
    error,

    createSalesTransaction,
    updateSalesTransaction,
    softDeleteSalesTransaction,
    restoreSalesTransaction,
    hardDeleteSalesTransaction,

    refresh,
  } = useSalesTransactions();
  const salesInputter = useOperationalInputter(outlet?.id ?? null, "sales");

  // ==========================================================
  // FILTER STATE
  // ==========================================================

  const [searchQuery, setSearchQuery] = useState("");

  const [subunitFilter, setSubunitFilter] = useState("all");

  const [categoryFilter, setCategoryFilter] = useState("all");

  const defaultListDate = useMemo(() => getJakartaTodayIso(), []);

  const [dateFrom, setDateFrom] = useState(defaultListDate);

  const [dateTo, setDateTo] = useState(defaultListDate);

  const [deletedFilter, setDeletedFilter] = useState<DeletedFilter>("active");

  const [page, setPage] = useState(1);

  const [exportOpen, setExportOpen] = useState(false);

  // ==========================================================
  // DIALOG STATE
  // ==========================================================

  const [createOpen, setCreateOpen] = useState(false);
  const [prefilledVisit, setPrefilledVisit] = useState<{
    visitId: string | null;
    date: string | null;
  }>({ visitId: routeSearch.visitId ?? null, date: routeSearch.date ?? null });

  useEffect(() => {
    if (!routeSearch.visitId || !canCreateSales || !salesInputter.name) return;
    setPrefilledVisit({ visitId: routeSearch.visitId, date: routeSearch.date ?? null });
    setCreateOpen(true);
    void navigate({ search: {}, replace: true });
  }, [canCreateSales, navigate, routeSearch.date, routeSearch.visitId, salesInputter.name]);

  const [detailTransaction, setDetailTransaction] = useState<SalesTransaction | null>(null);

  useEffect(() => {
    if (!routeSearch.transactionId) return;
    const target = transactions.find((transaction) => transaction.id === routeSearch.transactionId);
    if (target) setDetailTransaction(target);
  }, [routeSearch.transactionId, transactions]);

  const [editTransaction, setEditTransaction] = useState<SalesTransaction | null>(null);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // ==========================================================
  // ACTION FEEDBACK
  // ==========================================================

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // ==========================================================
  // DEPENDENT CATEGORY FILTER
  // ==========================================================

  const availableCategories = useMemo(
    () =>
      categories.filter(
        (category) => subunitFilter === "all" || category.subunitId === subunitFilter,
      ),
    [categories, subunitFilter],
  );

  // ==========================================================
  // FILTERED TRANSACTIONS
  // ==========================================================

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase("id-ID");

    return transactions.filter((transaction) => {
      // --------------------------------------------------
      // DELETED STATUS
      // --------------------------------------------------

      if (canViewDeletedData) {
        const isDeleted = Boolean(transaction.deletedAt);

        if (deletedFilter === "active" && isDeleted) {
          return false;
        }

        if (deletedFilter === "deleted" && !isDeleted) {
          return false;
        }
      }

      // --------------------------------------------------
      // DATE RANGE
      //
      // transactionDate sudah YYYY-MM-DD sehingga string
      // comparison aman untuk range ISO date.
      // --------------------------------------------------

      if (dateFrom && transaction.transactionDate < dateFrom) {
        return false;
      }

      if (dateTo && transaction.transactionDate > dateTo) {
        return false;
      }

      // --------------------------------------------------
      // SUBUNIT
      // --------------------------------------------------

      if (
        subunitFilter !== "all" &&
        !transaction.items.some((item) => item.subunitId === subunitFilter)
      ) {
        return false;
      }

      // --------------------------------------------------
      // CATEGORY
      // --------------------------------------------------

      if (
        categoryFilter !== "all" &&
        !transaction.items.some((item) => item.salesCategoryId === categoryFilter)
      ) {
        return false;
      }

      // --------------------------------------------------
      // SEARCH
      //
      // Search membaca header + historical snapshots.
      // --------------------------------------------------

      if (normalizedSearch) {
        const haystack = [
          transaction.transactionNumber,
          transaction.inputterName ?? "",

          transaction.notes ?? "",

          ...transaction.items.flatMap((item) => [
            item.productNameSnapshot,
            item.productSkuSnapshot ?? "",
            item.categoryNameSnapshot,
            item.subunitNameSnapshot,
            item.notes ?? "",
          ]),
        ]
          .join(" ")
          .toLocaleLowerCase("id-ID");

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [
    canViewDeletedData,
    categoryFilter,
    dateFrom,
    dateTo,
    deletedFilter,
    searchQuery,
    subunitFilter,
    transactions,
  ]);

  // ==========================================================
  // SUMMARY
  // ==========================================================

  const filteredTotalAmount = useMemo(
    () => filteredTransactions.reduce((total, transaction) => total + transaction.totalAmount, 0),
    [filteredTransactions],
  );

  const filteredTotalQuantity = useMemo(
    () =>
      filteredTransactions.reduce(
        (total, transaction) => total + calculateTotalQuantity(transaction.items),
        0,
      ),
    [filteredTransactions],
  );

  const filteredItemCount = useMemo(
    () => filteredTransactions.reduce((total, transaction) => total + transaction.items.length, 0),
    [filteredTransactions],
  );

  // ==========================================================
  // PAGINATION
  // ==========================================================

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;

    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, page]);

  const visibleStart = filteredTransactions.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  const visibleEnd = Math.min(page * PAGE_SIZE, filteredTransactions.length);

  // Reset page ketika filter berubah.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, subunitFilter, categoryFilter, dateFrom, dateTo, deletedFilter]);

  // Safety jika data berkurang setelah mutation.
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // ==========================================================
  // SUBUNIT FILTER CHANGE
  // ==========================================================

  const handleSubunitFilterChange = (value: string) => {
    setSubunitFilter(value);

    if (categoryFilter === "all") {
      return;
    }

    const currentCategory = categories.find((category) => category.categoryId === categoryFilter);

    if (value !== "all" && currentCategory?.subunitId !== value) {
      setCategoryFilter("all");
    }
  };

  // ==========================================================
  // RESET FILTER
  // ==========================================================

  const handleResetFilters = () => {
    setSearchQuery("");
    setSubunitFilter("all");
    setCategoryFilter("all");
    setDateFrom(defaultListDate);
    setDateTo(defaultListDate);
    setDeletedFilter("active");
  };

  const isDefaultTodayRange = dateFrom === defaultListDate && dateTo === defaultListDate;

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    subunitFilter !== "all" ||
    categoryFilter !== "all" ||
    !isDefaultTodayRange ||
    (canViewDeletedData && deletedFilter !== "active");

  // ==========================================================
  // CREATE / UPDATE
  // ==========================================================

  const handleFormSubmit = async (input: SalesTransactionFormSubmitInput) => {
    setActionError(null);
    setActionMessage(null);

    try {
      if ("transactionId" in input) {
        await updateSalesTransaction(input);

        setEditTransaction(null);

        setActionMessage("Transaksi berhasil diperbarui.");

        return;
      }

      if (!salesInputter.name) {
        throw new Error("Nama penginput sales wajib diatur sebelum mencatat transaksi baru.");
      }

      await createSalesTransaction(input);

      setCreateOpen(false);
      setPrefilledVisit({ visitId: null, date: null });

      setActionMessage("Transaksi berhasil dibuat.");
    } catch (mutationError) {
      const message = getErrorMessage(mutationError);

      setActionError(message);

      throw mutationError;
    }
  };

  // ==========================================================
  // CONFIRM LIFECYCLE ACTION
  // ==========================================================

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return;
    }

    setActionError(null);
    setActionMessage(null);

    const { type, transaction } = confirmAction;

    try {
      if (type === "soft-delete") {
        await softDeleteSalesTransaction(transaction.id);

        setActionMessage(`${transaction.transactionNumber} berhasil diarsipkan.`);
      }

      if (type === "restore") {
        await restoreSalesTransaction(transaction.id);

        setActionMessage(`${transaction.transactionNumber} berhasil dipulihkan.`);
      }

      if (type === "hard-delete") {
        await hardDeleteSalesTransaction(transaction.id);

        setActionMessage(`${transaction.transactionNumber} berhasil dihapus permanen.`);
      }

      if (detailTransaction?.id === transaction.id) {
        setDetailTransaction(null);
      }

      if (editTransaction?.id === transaction.id) {
        setEditTransaction(null);
      }

      setConfirmAction(null);
    } catch (mutationError) {
      setActionError(getErrorMessage(mutationError));
    }
  };

  // ==========================================================
  // REFRESH
  // ==========================================================

  const handleRefresh = async () => {
    setActionError(null);

    try {
      await refresh();
    } catch (refreshError) {
      setActionError(getErrorMessage(refreshError));
    }
  };

  // ==========================================================
  // DATA ERROR
  // ==========================================================

  const dataErrorMessage = error ? getErrorMessage(error) : null;

  return (
    <div className="space-y-6">
      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-6 w-6" />

            <h1 className="text-2xl font-bold tracking-tight">Penjualan</h1>
          </div>

          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Kelola transaksi penjualan multi-item untuk seluruh Subunit dalam satu transaksi.
          </p>

          {outlet ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Store className="h-4 w-4" />

              <span>{outlet.name}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading || isFetching || isMutating}
            onClick={() => setExportOpen(true)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export Excel
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={isFetching || isMutating}
            onClick={() => {
              void handleRefresh();
            }}
          >
            {isFetching ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>

          {canCreateSales ? (
            <Button
              type="button"
              disabled={isLoading || isMutating || !salesInputter.name}
              title={!salesInputter.name ? "Atur nama penginput sebelum mencatat transaksi." : undefined}
              onClick={() => {
                setActionError(null);

                setCreateOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Transaksi baru
            </Button>
          ) : null}
        </div>
      </div>

      <OperationalInputterCard outletId={outlet?.id ?? null} section="sales" />

      {/* =====================================================
          FEEDBACK
          ===================================================== */}

      {actionMessage ? (
        <div
          role="status"
          className="rounded-lg border border-green-600/30 bg-green-600/5 px-4 py-3 text-sm"
        >
          {actionMessage}
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      ) : null}

      {dataErrorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          Gagal mengambil data penjualan: {dataErrorMessage}
        </div>
      ) : null}

      {/* =====================================================
          KPI
          ===================================================== */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<ReceiptText className="h-5 w-5" />}
          label="Transaksi"
          value={formatNumber(filteredTransactions.length)}
          helper="Sesuai filter aktif"
        />

        <SummaryCard
          icon={<WalletCards className="h-5 w-5" />}
          label="Total penjualan"
          value={formatRupiah(filteredTotalAmount)}
          helper="Nilai header transaksi"
        />

        <SummaryCard
          icon={<Archive className="h-5 w-5" />}
          label="Baris item"
          value={formatNumber(filteredItemCount)}
          helper="Jumlah line transaksi"
        />

        <SummaryCard
          icon={<Store className="h-5 w-5" />}
          label="Total quantity"
          value={formatNumber(filteredTotalQuantity, 2)}
          helper="Akumulasi semua item"
        />
      </div>

      {/* =====================================================
          FILTERS
          ===================================================== */}

      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Filter transaksi</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Cari transaksi berdasarkan nomor, Product, Category, Subunit, catatan, atau periode.
            </p>
          </div>

          {hasActiveFilters ? (
            <Button type="button" variant="ghost" onClick={handleResetFilters}>
              Reset filter
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {/* SEARCH */}

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="sales-search">Pencarian</Label>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                id="sales-search"
                className="pl-9"
                value={searchQuery}
                placeholder="No. transaksi, Product, SKU..."
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          {/* SUBUNIT */}

          <div className="space-y-2">
            <Label>Subunit</Label>

            <Select value={subunitFilter} onValueChange={handleSubunitFilterChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">Semua Subunit</SelectItem>

                {subunits.map((subunit) => (
                  <SelectItem key={subunit.id} value={subunit.id}>
                    {subunit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CATEGORY */}

          <div className="space-y-2">
            <Label>Category</Label>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">Semua Category</SelectItem>

                {availableCategories.map((category) => (
                  <SelectItem key={category.categoryId} value={category.categoryId}>
                    {category.categoryName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* DATE FROM */}

          <div className="space-y-2">
            <Label htmlFor="sales-date-from">Dari tanggal</Label>

            <Input
              id="sales-date-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>

          {/* DATE TO */}

          <div className="space-y-2">
            <Label htmlFor="sales-date-to">Sampai tanggal</Label>

            <Input
              id="sales-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </div>

        {/* SUPER ADMIN STATUS FILTER */}

        {canViewDeletedData ? (
          <div className="max-w-xs space-y-2">
            <Label>Status data</Label>

            <Select
              value={deletedFilter}
              onValueChange={(value) => setDeletedFilter(value as DeletedFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>

                <SelectItem value="deleted">Diarsipkan</SelectItem>

                <SelectItem value="all">Semua</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {/* =====================================================
          TABLE
          ===================================================== */}

      <div className="overflow-hidden rounded-lg border">
        <div className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Daftar transaksi</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {filteredTransactions.length} transaksi ditemukan.
            </p>
          </div>

          {isFetching && !isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Memperbarui data...
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Memuat transaksi...
          </div>
        ) : paginatedTransactions.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
            <ReceiptText className="h-10 w-10 text-muted-foreground" />

            <p className="mt-4 font-medium">Tidak ada transaksi</p>

            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {hasActiveFilters
                ? "Tidak ada transaksi yang cocok dengan filter saat ini."
                : isDefaultTodayRange
                  ? "Belum ada transaksi penjualan hari ini."
                  : "Belum ada transaksi penjualan pada sistem baru."}
            </p>

            {hasActiveFilters ? (
              <Button type="button" variant="outline" className="mt-4" onClick={handleResetFilters}>
                Reset filter
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">Transaksi</TableHead>

                  <TableHead className="min-w-32">Tanggal</TableHead>
                  <TableHead className="min-w-36">Penginput</TableHead>

                  <TableHead className="min-w-48">Subunit</TableHead>

                  <TableHead className="min-w-44">Kunjungan</TableHead>

                  <TableHead className="text-right">Item</TableHead>

                  <TableHead className="text-right">Qty</TableHead>

                  <TableHead className="min-w-36 text-right">Total</TableHead>

                  <TableHead className="min-w-52">Catatan</TableHead>

                  <TableHead className="min-w-32">Update</TableHead>

                  <TableHead className="min-w-44 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedTransactions.map((transaction) => {
                  const isDeleted = Boolean(transaction.deletedAt);

                  const totalQuantity = calculateTotalQuantity(transaction.items);

                  const subunitSummary = summarizeSubunits(transaction.items);

                  return (
                    <TableRow
                      key={transaction.id}
                      className={isDeleted ? "bg-muted/30" : undefined}
                    >
                      {/* TRANSACTION */}

                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{transaction.transactionNumber}</p>

                          <div className="flex flex-wrap gap-1">
                            <Badge variant={isDeleted ? "destructive" : "outline"}>
                              {isDeleted ? "Diarsipkan" : "Aktif"}
                            </Badge>

                            <Badge variant="secondary">
                              {transaction.entrySource === "visitor" ? "Pengunjung" : "Manual"}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>

                      {/* DATE */}

                      <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                      <TableCell>{displayOperationalInputter(transaction.inputterName)}</TableCell>

                      {/* SUBUNIT */}

                      <TableCell>
                        <span className="text-sm">{subunitSummary}</span>
                      </TableCell>

                      <TableCell>
                        {transaction.linkedVisit ? (
                          <div className="text-sm">
                            <p className="font-medium">
                              {transaction.linkedVisit.totalVisitors} pengunjung
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {transaction.linkedVisit.adultCount} dewasa ·{" "}
                              {transaction.linkedVisit.childCount} anak
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Tidak dicatat</span>
                        )}
                      </TableCell>

                      {/* ITEM COUNT */}

                      <TableCell className="text-right">
                        {formatNumber(transaction.items.length)}
                      </TableCell>

                      {/* QUANTITY */}

                      <TableCell className="text-right">{formatNumber(totalQuantity, 2)}</TableCell>

                      {/* TOTAL */}

                      <TableCell className="text-right font-semibold">
                        {formatRupiah(transaction.totalAmount)}
                      </TableCell>

                      {/* NOTES */}

                      <TableCell>
                        {transaction.notes ? (
                          <p
                            className="line-clamp-2 max-w-64 text-sm text-muted-foreground"
                            title={transaction.notes}
                          >
                            {transaction.notes}
                          </p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* UPDATED */}

                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(transaction.updatedAt)}
                        </span>
                      </TableCell>

                      {/* ACTIONS */}

                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Lihat detail"
                            aria-label={`Lihat detail ${transaction.transactionNumber}`}
                            onClick={() => {
                              setDetailTransaction(transaction);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {!isDeleted && canEditSales ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Edit transaksi"
                              aria-label={`Edit ${transaction.transactionNumber}`}
                              disabled={isMutating}
                              onClick={() => {
                                setActionError(null);

                                setEditTransaction(transaction);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {!isDeleted && canArchiveSales ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Arsipkan transaksi"
                              aria-label={`Arsipkan ${transaction.transactionNumber}`}
                              disabled={isMutating}
                              onClick={() => {
                                setConfirmAction({
                                  type: "soft-delete",
                                  transaction,
                                });
                              }}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          ) : null}

                          {isDeleted && canViewDeletedData ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Pulihkan transaksi"
                              aria-label={`Pulihkan ${transaction.transactionNumber}`}
                              disabled={isMutating}
                              onClick={() => {
                                setConfirmAction({
                                  type: "restore",
                                  transaction,
                                });
                              }}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          ) : null}

                          {isDeleted && canHardDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Hapus permanen"
                              aria-label={`Hapus permanen ${transaction.transactionNumber}`}
                              disabled={isMutating}
                              onClick={() => {
                                setConfirmAction({
                                  type: "hard-delete",
                                  transaction,
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ===================================================
            PAGINATION
            =================================================== */}

        {!isLoading && filteredTransactions.length > 0 ? (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Menampilkan {visibleStart}–{visibleEnd} dari {filteredTransactions.length} transaksi
            </p>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Sebelumnya
              </Button>

              <span className="min-w-20 text-center text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Berikutnya
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <SalesExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        transactions={transactions}
        outletName={outlet?.name ?? null}
        subunits={subunits}
        categories={categories}
        initialSubunitId={subunitFilter}
        initialCategoryId={categoryFilter}
      />

      {/* =====================================================
          CREATE DIALOG
          ===================================================== */}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (isMutating) {
            return;
          }

          setCreateOpen(open);
          if (!open) setPrefilledVisit({ visitId: null, date: null });
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Transaksi baru</DialogTitle>

            <DialogDescription>
              Tambahkan satu atau beberapa Product. Item dapat berasal dari Subunit yang berbeda
              dalam transaksi yang sama.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">Penginput: <span className="font-medium text-foreground">{displayOperationalInputter(salesInputter.name)}</span></p>

          <SalesTransactionForm
            mode="create"
            outletId={outlet?.id ?? null}
            preselectedVisitId={prefilledVisit.visitId}
            initialTransactionDate={prefilledVisit.date}
            products={products}
            isSubmitting={isMutating}
            onCancel={() => {
              setCreateOpen(false);
              setPrefilledVisit({ visitId: null, date: null });
            }}
            onSubmit={handleFormSubmit}
          />
        </DialogContent>
      </Dialog>

      {/* =====================================================
          EDIT DIALOG
          ===================================================== */}

      <Dialog
        open={Boolean(editTransaction)}
        onOpenChange={(open) => {
          if (isMutating) {
            return;
          }

          if (!open) {
            setEditTransaction(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Edit transaksi</DialogTitle>

            <DialogDescription>
              {editTransaction
                ? `Perbarui ${editTransaction.transactionNumber}. Item akan dibangun ulang secara atomik oleh database.`
                : "Perbarui transaksi."}
            </DialogDescription>
          </DialogHeader>

          {editTransaction ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Penginput saat dicatat: <span className="font-medium text-foreground">{displayOperationalInputter(editTransaction.inputterName)}</span></p>
              <SalesTransactionForm
                mode="edit"
                outletId={outlet?.id ?? null}
                products={products}
                transaction={editTransaction}
                isSubmitting={isMutating}
                onCancel={() => setEditTransaction(null)}
                onSubmit={handleFormSubmit}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* =====================================================
          DETAIL DIALOG
          ===================================================== */}

      <Dialog
        open={Boolean(detailTransaction)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailTransaction(null);
            if (routeSearch.transactionId) void navigate({ search: {}, replace: true });
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Detail transaksi</DialogTitle>

            <DialogDescription>
              Data historis transaksi dan snapshot item saat penjualan dicatat.
            </DialogDescription>
          </DialogHeader>

          {detailTransaction ? <SalesTransactionDetail transaction={detailTransaction} /> : null}
        </DialogContent>
      </Dialog>

      {/* =====================================================
          LIFECYCLE CONFIRMATION
          ===================================================== */}

      <AlertDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (isMutating) {
            return;
          }

          if (!open) {
            setConfirmAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction ? getConfirmationTitle(confirmAction.type) : "Konfirmasi"}
            </AlertDialogTitle>

            <AlertDialogDescription>
              {confirmAction ? getConfirmationDescription(confirmAction) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Batal</AlertDialogCancel>

            <Button
              type="button"
              variant={confirmAction?.type === "hard-delete" ? "destructive" : "default"}
              disabled={isMutating}
              onClick={() => {
                void handleConfirmAction();
              }}
            >
              {isMutating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}

              {confirmAction ? getConfirmationButtonLabel(confirmAction.type) : "Lanjutkan"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// SALES EXPORT DIALOG
// ============================================================

type SalesExportPreset =
  "today" | "yesterday" | "last7" | "this-month" | "previous-month" | "month" | "custom";

interface SalesExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: readonly SalesTransaction[];
  outletName: string | null;
  subunits: readonly { id: string; name: string }[];
  categories: readonly {
    categoryId: string;
    categoryName: string;
    subunitId: string;
  }[];
  initialSubunitId: string;
  initialCategoryId: string;
}

function SalesExportDialog({
  open,
  onOpenChange,
  transactions,
  outletName,
  subunits,
  categories,
  initialSubunitId,
  initialCategoryId,
}: SalesExportDialogProps) {
  const today = useMemo(() => getJakartaTodayIso(), []);

  const initialRange = useMemo(() => salesExportPresetRange("today", today), [today]);

  const [preset, setPreset] = useState<SalesExportPreset>("today");

  const [startDate, setStartDate] = useState(initialRange.startDate);

  const [endDate, setEndDate] = useState(initialRange.endDate);

  const [monthValue, setMonthValue] = useState(today.slice(0, 7));

  const [subunitId, setSubunitId] = useState("all");

  const [categoryId, setCategoryId] = useState("all");

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextRange = salesExportPresetRange("today", today);

    setPreset("today");
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
    setMonthValue(today.slice(0, 7));
    setSubunitId(initialSubunitId === "all" ? "all" : initialSubunitId);
    setCategoryId(initialCategoryId === "all" ? "all" : initialCategoryId);
  }, [initialCategoryId, initialSubunitId, open, today]);

  const availableCategories = useMemo(
    () => categories.filter((category) => subunitId === "all" || category.subunitId === subunitId),
    [categories, subunitId],
  );

  useEffect(() => {
    if (categoryId === "all") {
      return;
    }

    const category = categories.find((candidate) => candidate.categoryId === categoryId);

    if (!category || (subunitId !== "all" && category.subunitId !== subunitId)) {
      setCategoryId("all");
    }
  }, [categories, categoryId, subunitId]);

  const applyPreset = (nextPreset: SalesExportPreset) => {
    setPreset(nextPreset);

    if (nextPreset === "month" || nextPreset === "custom") {
      return;
    }

    const range = salesExportPresetRange(nextPreset, today);

    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleMonthChange = (value: string) => {
    setMonthValue(value);

    if (!/^\d{4}-\d{2}$/.test(value)) {
      return;
    }

    const range = monthRange(value);

    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleExport = async () => {
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      toast.error("Periode export tidak valid.");
      return;
    }

    setExporting(true);

    try {
      const payload = buildOperationalSalesExportPayload({
        transactions,
        startDate,
        endDate,
        outletName,
        subunitId: subunitId === "all" ? null : subunitId,
        categoryId: categoryId === "all" ? null : categoryId,
      });

      if (payload.sourceRecordCount <= 0) {
        toast.error("Tidak ada transaksi operasional aktif pada periode dan filter yang dipilih.");
        return;
      }

      await exportReportToExcel(payload);

      void recordSalesExportAudit({
        startDate,
        endDate,
        subunitId,
        categoryId,
      });

      toast.success("Excel penjualan berhasil disiapkan.", {
        description: payload.filename,
      });

      onOpenChange(false);
    } catch (error) {
      console.error("[sales-export]", error);

      toast.error("Excel penjualan gagal dibuat.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!exporting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Penjualan Operasional</DialogTitle>

          <DialogDescription>
            Buat workbook Excel untuk memantau transaksi, Product terjual, Subunit, quantity, dan
            omzet pada periode yang dipilih.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Periode export</Label>

            <Select
              value={preset}
              disabled={exporting}
              onValueChange={(value) => applyPreset(value as SalesExportPreset)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="today">Hari ini</SelectItem>
                <SelectItem value="yesterday">Kemarin</SelectItem>
                <SelectItem value="last7">7 hari terakhir</SelectItem>
                <SelectItem value="this-month">Bulan ini</SelectItem>
                <SelectItem value="previous-month">Bulan sebelumnya</SelectItem>
                <SelectItem value="month">Pilih bulan</SelectItem>
                <SelectItem value="custom">Range tanggal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preset === "month" ? (
            <div className="space-y-2">
              <Label htmlFor="sales-export-month">Bulan</Label>
              <Input
                id="sales-export-month"
                type="month"
                value={monthValue}
                disabled={exporting}
                onChange={(event) => handleMonthChange(event.target.value)}
              />
            </div>
          ) : null}

          {preset === "custom" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sales-export-start">Dari tanggal</Label>
                <Input
                  id="sales-export-start"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  disabled={exporting}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sales-export-end">Sampai tanggal</Label>
                <Input
                  id="sales-export-end"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  disabled={exporting}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Periode:</span>{" "}
              <span className="font-medium">
                {formatDate(startDate)}
                {startDate !== endDate ? ` – ${formatDate(endDate)}` : ""}
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Subunit</Label>
              <Select value={subunitId} disabled={exporting} onValueChange={setSubunitId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Subunit</SelectItem>
                  {subunits.map((subunit) => (
                    <SelectItem key={subunit.id} value={subunit.id}>
                      {subunit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} disabled={exporting} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Category</SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category.categoryId} value={category.categoryId}>
                      {category.categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
            Workbook berisi Ringkasan, Penjualan Harian, Penjualan Produk, Per Subunit, dan Detail
            Transaksi. Data yang diarsipkan tidak dihitung sebagai penjualan aktif.
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={exporting}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>

          <Button
            type="button"
            disabled={exporting}
            onClick={() => {
              void handleExport();
            }}
          >
            {exporting ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}

            {exporting ? "Menyiapkan Excel..." : "Export .xlsx"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function recordSalesExportAudit(input: {
  startDate: string;
  endDate: string;
  subunitId: string;
  categoryId: string;
}) {
  const client = actualClient as unknown as {
    rpc(
      name: "record_report_export",
      args: {
        p_report_type: string;
        p_start_date: string;
        p_end_date: string;
        p_filters: Record<string, unknown>;
      },
    ): PromiseLike<{
      error: unknown;
    }>;
  };

  try {
    const { error } = await client.rpc("record_report_export", {
      p_report_type: "sales",
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_filters: {
        operationalOnly: true,
        subunitId: input.subunitId === "all" ? null : input.subunitId,
        categoryId: input.categoryId === "all" ? null : input.categoryId,
      },
    });

    if (error) {
      console.warn("[sales-export-audit]", error);
    }
  } catch (error) {
    console.warn("[sales-export-audit]", error);
  }
}

function getJakartaTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function salesExportPresetRange(
  preset: Exclude<SalesExportPreset, "month" | "custom">,
  today: string,
): {
  startDate: string;
  endDate: string;
} {
  if (preset === "today") {
    return {
      startDate: today,
      endDate: today,
    };
  }

  if (preset === "yesterday") {
    const yesterday = addIsoDays(today, -1);

    return {
      startDate: yesterday,
      endDate: yesterday,
    };
  }

  if (preset === "last7") {
    return {
      startDate: addIsoDays(today, -6),
      endDate: today,
    };
  }

  if (preset === "this-month") {
    return {
      startDate: `${today.slice(0, 7)}-01`,
      endDate: today,
    };
  }

  const currentMonthStart = `${today.slice(0, 7)}-01`;

  const previousMonthEnd = addIsoDays(currentMonthStart, -1);

  return {
    startDate: `${previousMonthEnd.slice(0, 7)}-01`,
    endDate: previousMonthEnd,
  };
}

function monthRange(month: string): {
  startDate: string;
  endDate: string;
} {
  const [yearText, monthText] = month.split("-");

  const year = Number(yearText);

  const monthNumber = Number(monthText);

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate().toString().padStart(2, "0");

  return {
    startDate: `${yearText}-${monthText}-01`,
    endDate: `${yearText}-${monthText}-${lastDay}`,
  };
}

function addIsoDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);

  const value = new Date(Date.UTC(year, month - 1, day + amount));

  return value.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ============================================================
// SUMMARY CARD
// ============================================================

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}

function SummaryCard({ icon, label, value, helper }: SummaryCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>

          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>

        <div className="rounded-lg bg-muted p-2 text-muted-foreground">{icon}</div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

// ============================================================
// CONFIRMATION COPY
// ============================================================

function getConfirmationTitle(type: ConfirmActionType): string {
  if (type === "soft-delete") {
    return "Arsipkan transaksi?";
  }

  if (type === "restore") {
    return "Pulihkan transaksi?";
  }

  return "Hapus transaksi permanen?";
}

function getConfirmationDescription(action: ConfirmAction): string {
  const number = action.transaction.transactionNumber;

  if (action.type === "soft-delete") {
    return `${number} akan diarsipkan. Transaksi tidak lagi terlihat oleh Staff dan Admin, tetapi masih dapat dipulihkan oleh Super Admin.`;
  }

  if (action.type === "restore") {
    return `${number} akan dikembalikan menjadi transaksi aktif dan dapat terlihat kembali sesuai hak akses pengguna.`;
  }

  return `${number} akan dihapus permanen beserta seluruh item transaksinya. Tindakan ini tidak dapat dibatalkan.`;
}

function getConfirmationButtonLabel(type: ConfirmActionType): string {
  if (type === "soft-delete") {
    return "Arsipkan";
  }

  if (type === "restore") {
    return "Pulihkan";
  }

  return "Hapus permanen";
}

// ============================================================
// ERROR NORMALIZER
// ============================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Terjadi kesalahan yang tidak diketahui.";
}
