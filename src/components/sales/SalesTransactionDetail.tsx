import {
  Archive,
  CalendarDays,
  FileText,
  Package,
  ReceiptText,
  Store,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
} from "@/lib/format";
import {
  calculateTotalQuantity,
  calculateTransactionTotal,
  formatTransactionNumber,
  summarizeSubunits,
  type SalesTransaction,
} from "@/lib/salesTransactions";

export interface SalesTransactionDetailProps {
  transaction: SalesTransaction;
}

export function SalesTransactionDetail({
  transaction,
}: SalesTransactionDetailProps) {
  const sortedItems = [...transaction.items].sort(
    (left, right) =>
      left.lineNo - right.lineNo,
  );

  const totalQuantity =
    calculateTotalQuantity(
      sortedItems,
    );

  const itemTotal =
    calculateTransactionTotal(
      sortedItems,
    );

  const totalHpp = sortedItems.reduce(
    (total, item) => total + item.hppAmount,
    0,
  );

  const grossProfit =
    transaction.totalAmount - totalHpp;

  const hasProvisionalHpp = sortedItems.some(
    (item) => item.hppStatus === "provisional",
  );

  const subunitSummary =
    summarizeSubunits(
      sortedItems,
    );

  const isDeleted =
    Boolean(
      transaction.deletedAt,
    );

  const hasTotalMismatch =
    Math.abs(
      transaction.totalAmount -
        itemTotal,
    ) >= 0.01;

  return (
    <div className="space-y-6">
      {/* =====================================================
          TRANSACTION IDENTITY
          ===================================================== */}

      <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ReceiptText className="h-5 w-5 text-muted-foreground" />

            <h3 className="text-lg font-semibold">
              {formatTransactionNumber(
                transaction.transactionNumber,
              )}
            </h3>

            {isDeleted ? (
              <Badge variant="destructive">
                Diarsipkan
              </Badge>
            ) : (
              <Badge variant="outline">
                Aktif
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />

              {formatDate(
                transaction.transactionDate,
              )}
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Store className="h-4 w-4" />

              {subunitSummary}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {formatEntrySource(
              transaction.entrySource,
            )}
          </Badge>

          <Badge variant="outline">
            {sortedItems.length} baris
          </Badge>

          <Badge variant="outline">
            {formatNumber(
              totalQuantity,
              2,
            )}{" "}
            qty
          </Badge>
        </div>
      </div>

      {/* =====================================================
          NOTES
          ===================================================== */}

      {transaction.notes ? (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />

            <p className="text-sm font-medium">
              Catatan transaksi
            </p>
          </div>

          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {transaction.notes}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Penginput saat dicatat</p>
        <p className="mt-1 font-medium">{transaction.inputterName ?? "—"}</p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Kunjungan Pengunjung</h3>
        </div>
        {transaction.linkedVisit ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{transaction.linkedVisit.visitorName}</p>
              <p className="text-sm text-muted-foreground">
                {transaction.linkedVisit.adultCount} dewasa · {transaction.linkedVisit.childCount} anak ·{" "}
                {transaction.linkedVisit.totalVisitors} pengunjung · {formatDate(transaction.linkedVisit.visitDate)}
              </p>
            </div>
            <Button asChild type="button" variant="outline" size="sm">
              <Link to="/kunjungan" search={{ visitId: transaction.linkedVisit.visitId }}>
                Lihat Kunjungan
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tidak ada kunjungan yang dicatat.</p>
        )}
      </div>

      {/* =====================================================
          ITEMS
          ===================================================== */}

      <div className="space-y-3">
        <div>
          <h3 className="font-semibold">
            Item transaksi
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Nama Product, Category, Subunit, dan Unit menggunakan snapshot saat
            transaksi dibuat.
          </p>
        </div>

        {sortedItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground" />

            <p className="mt-3 font-medium">
              Tidak ada item transaksi
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Header transaksi tersedia, tetapi tidak ada item yang dapat
              ditampilkan.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {/* DESKTOP HEADER */}

            <div className="hidden grid-cols-12 gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground md:grid">
              <div className="col-span-1">
                No.
              </div>

              <div className="col-span-5">
                Product
              </div>

              <div className="col-span-2 text-right">
                Qty
              </div>

              <div className="col-span-2 text-right">
                Harga
              </div>

              <div className="col-span-2 text-right">
                Subtotal
              </div>
            </div>

            {/* ITEM ROWS */}

            <div className="divide-y">
              {sortedItems.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    key={item.id}
                    className="grid gap-4 px-4 py-4 md:grid-cols-12 md:gap-3"
                  >
                    {/* LINE NUMBER */}

                    <div className="hidden text-sm text-muted-foreground md:col-span-1 md:block">
                      {item.lineNo ||
                        index + 1}
                    </div>

                    {/* PRODUCT SNAPSHOT */}

                    <div className="space-y-2 md:col-span-5">
                      <div className="flex items-start gap-2">
                        <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                        <div className="min-w-0">
                          <p className="font-medium">
                            {
                              item.productNameSnapshot
                            }
                          </p>

                          {item.productSkuSnapshot ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              SKU:{" "}
                              {
                                item.productSkuSnapshot
                              }
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {
                            item.subunitNameSnapshot
                          }
                        </Badge>

                        <Badge variant="secondary">
                          {
                            item.categoryNameSnapshot
                          }
                        </Badge>

                        <span className="text-xs text-muted-foreground">
                          Unit:{" "}
                          {
                            item.unitSnapshot
                          }
                        </span>

                        <Badge variant={item.hppStatus === "provisional" ? "destructive" : "outline"}>
                          HPP {formatRupiah(item.hppAmount)} ·{" "}
                          {item.hppStatus === "provisional" ? "Provisional" : "Final"}
                        </Badge>
                      </div>

                      {item.notes ? (
                        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          {item.notes}
                        </div>
                      ) : null}
                    </div>

                    {/* MOBILE MONEY SUMMARY */}

                    <div className="grid grid-cols-3 gap-3 md:hidden">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Qty
                        </p>

                        <p className="mt-1 text-sm font-medium">
                          {formatNumber(
                            item.quantity,
                            2,
                          )}{" "}
                          {
                            item.unitSnapshot
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">
                          Harga
                        </p>

                        <p className="mt-1 text-sm font-medium">
                          {formatRupiah(
                            item.unitPrice,
                          )}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Subtotal
                        </p>

                        <p className="mt-1 text-sm font-semibold">
                          {formatRupiah(
                            item.amount,
                          )}
                        </p>
                      </div>
                    </div>

                    {/* DESKTOP QTY */}

                    <div className="hidden text-right md:col-span-2 md:block">
                      <p className="text-sm font-medium">
                        {formatNumber(
                          item.quantity,
                          2,
                        )}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {
                          item.unitSnapshot
                        }
                      </p>
                    </div>

                    {/* DESKTOP UNIT PRICE */}

                    <div className="hidden text-right md:col-span-2 md:block">
                      <p className="text-sm">
                        {formatRupiah(
                          item.unitPrice,
                        )}
                      </p>
                    </div>

                    {/* DESKTOP SUBTOTAL */}

                    <div className="hidden text-right md:col-span-2 md:block">
                      <p className="font-semibold">
                        {formatRupiah(
                          item.amount,
                        )}
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================
          TRANSACTION SUMMARY
          ===================================================== */}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">
            Ringkasan transaksi
          </h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <SummaryMetric
              label="Jumlah baris"
              value={String(
                sortedItems.length,
              )}
            />

            <SummaryMetric
              label="Total quantity"
              value={formatNumber(
                totalQuantity,
                2,
              )}
            />

            <SummaryMetric
              label="Subunit"
              value={subunitSummary}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="space-y-3">
            <MoneySummaryRow
              label="Total item"
              value={itemTotal}
            />

            <MoneySummaryRow
              label={hasProvisionalHpp ? "HPP · Provisional" : "HPP"}
              value={totalHpp}
            />

            <MoneySummaryRow
              label="Gross Profit"
              value={grossProfit}
            />

            <div className="border-t pt-3">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total transaksi
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Nilai canonical pada header transaksi
                  </p>
                </div>

                <p className="text-xl font-bold">
                  {formatRupiah(
                    transaction.totalAmount,
                  )}
                </p>
              </div>
            </div>
          </div>

          {hasTotalMismatch ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Total header berbeda dengan jumlah subtotal item. Jangan mengubah
              histori transaksi sebelum data diperiksa.
            </div>
          ) : null}
        </div>
      </div>

      {/* =====================================================
          ARCHIVE INFORMATION
          ===================================================== */}

      {isDeleted ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <Archive className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

            <div>
              <p className="font-medium">
                Transaksi telah diarsipkan
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Dihapus sementara pada{" "}
                {formatDateTime(
                  transaction.deletedAt,
                )}
                .
              </p>

              {transaction.deletedBy ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Actor ID:{" "}
                  {
                    transaction.deletedBy
                  }
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* =====================================================
          AUDIT INFORMATION
          ===================================================== */}

      <div className="rounded-lg border p-4">
        <h3 className="font-semibold">
          Informasi sistem
        </h3>

        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <AuditValue
            label="Dibuat"
            value={formatDateTime(
              transaction.createdAt,
            )}
          />

          <AuditValue
            label="Terakhir diperbarui"
            value={formatDateTime(
              transaction.updatedAt,
            )}
          />

          <AuditValue
            label="Dibuat oleh"
            value={
              transaction.createdBy ??
              "—"
            }
          />

          <AuditValue
            label="Terakhir diperbarui oleh"
            value={
              transaction.updatedBy ??
              "—"
            }
          />
        </div>
      </div>
    </div>
  );
}

interface SummaryMetricProps {
  label: string;
  value: string;
}

function SummaryMetric({
  label,
  value,
}: SummaryMetricProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 font-semibold">
        {value}
      </p>
    </div>
  );
}

interface MoneySummaryRowProps {
  label: string;
  value: number;
}

function MoneySummaryRow({
  label,
  value,
}: MoneySummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">
        {label}
      </span>

      <span className="font-medium">
        {formatRupiah(
          value,
        )}
      </span>
    </div>
  );
}

interface AuditValueProps {
  label: string;
  value: string;
}

function AuditValue({
  label,
  value,
}: AuditValueProps) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 break-all text-sm">
        {value}
      </p>
    </div>
  );
}

function formatEntrySource(
  source: SalesTransaction["entrySource"],
): string {
  if (source === "visitor") {
    return "Pengunjung";
  }

  return "Manual";
}
