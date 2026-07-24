import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  PackageCheck,
  PackageX,
} from "lucide-react";

import { formatNumber } from "@/lib/format";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductAnalyticsPreviewProps {
  totalQuantity: number;
  productsSold: number;
  productsWithoutSales: number;
  periodLabel: string;
  loading?: boolean;
}

export function ProductAnalyticsPreview({
  totalQuantity,
  productsSold,
  productsWithoutSales,
  periodLabel,
  loading = false,
}: ProductAnalyticsPreviewProps) {
  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-base">
            Ringkasan Analitik Produk
          </CardTitle>

          <p className="mt-1 text-sm text-muted-foreground">
            Ringkasan performa produk pada periode{" "}
            {periodLabel}.
          </p>
        </div>

        <Button asChild size="sm">
          <Link to="/analitik-produk">
            Lihat Analitik Produk
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
        <PreviewMetric
          title="Quantity Terjual"
          value={formatNumber(
            totalQuantity,
            2,
          )}
          icon={PackageCheck}
          loading={loading}
        />

        <PreviewMetric
          title="Produk Terjual"
          value={formatNumber(
            productsSold,
          )}
          icon={Boxes}
          loading={loading}
        />

        <PreviewMetric
          title="Tanpa Penjualan"
          value={formatNumber(
            productsWithoutSales,
          )}
          icon={PackageX}
          loading={loading}
        />
      </CardContent>
    </Card>
  );
}

function PreviewMetric({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  icon: typeof PackageCheck;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {title}
        </p>

        {loading ? (
          <Skeleton className="mt-1 h-6 w-20" />
        ) : (
          <p className="mt-0.5 truncate text-lg font-semibold">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
