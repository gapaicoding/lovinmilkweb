import {
  Clock3,
  PackageX,
} from "lucide-react";

import type { ProductWithoutSalesItem } from "@/lib/productAnalytics";
import {
  formatDate,
  formatNumber,
  formatRupiah,
} from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProductsWithoutSalesProps {
  items: ProductWithoutSalesItem[];
  periodLabel: string;
  loading?: boolean;
  maxItems?: number;
}

export function ProductsWithoutSales({
  items,
  periodLabel,
  loading = false,
  maxItems = 10,
}: ProductsWithoutSalesProps) {
  const visibleItems = items.slice(
    0,
    maxItems,
  );

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <PackageX className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-semibold">
              Produk Tanpa Penjualan
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Produk aktif yang tidak memiliki transaksi pada
              periode {periodLabel}.
            </p>
          </div>
        </div>

        {!loading ? (
          <Badge
            variant="secondary"
            className="w-fit"
          >
            {formatNumber(items.length)} produk
          </Badge>
        ) : null}
      </div>

      <div className="p-5">
        {loading ? (
          <ProductsWithoutSalesSkeleton />
        ) : visibleItems.length === 0 ? (
          <ProductsWithoutSalesEmptyState />
        ) : (
          <>
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">
                      Harga Jual
                    </TableHead>
                    <TableHead>
                      Penjualan Terakhir
                    </TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {visibleItems.map((item) => (
                    <TableRow
                      key={item.productId}
                    >
                      <TableCell>
                        <p className="font-medium">
                          {item.name}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {item.sku || "-"}
                        </p>
                      </TableCell>

                      <TableCell>
                        {item.categoryName}
                      </TableCell>

                      <TableCell>
                        {item.unit}
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-right">
                        {formatRupiah(
                          item.sellingPrice,
                        )}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {item.lastSaleDate
                          ? formatDate(
                              item.lastSaleDate,
                            )
                          : "-"}
                      </TableCell>

                      <TableCell>
                        {item.neverSold ? (
                          <Badge variant="secondary">
                            Belum Pernah Terjual
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="whitespace-nowrap"
                          >
                            <Clock3 className="mr-1 h-3 w-3" />
                            {formatNumber(
                              item.daysSinceLastSale,
                            )}{" "}
                            hari
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {items.length > maxItems ? (
              <p className="mt-3 text-right text-xs text-muted-foreground">
                Menampilkan {formatNumber(
                  maxItems,
                )} dari{" "}
                {formatNumber(items.length)} produk.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function ProductsWithoutSalesSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map(
        (_, index) => (
          <Skeleton
            key={index}
            className="h-12 w-full"
          />
        ),
      )}
    </div>
  );
}

function ProductsWithoutSalesEmptyState() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed text-center">
      <PackageX className="h-9 w-9 text-emerald-600" />
      <h3 className="mt-3 text-sm font-semibold">
        Semua produk aktif memiliki penjualan
      </h3>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        Tidak ada produk aktif tanpa transaksi pada periode
        terpilih.
      </p>
    </div>
  );
}
