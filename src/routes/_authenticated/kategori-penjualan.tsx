import { createFileRoute } from "@tanstack/react-router";

import { SalesCategoryManager } from "@/components/SalesCategoryManager";

export const Route = createFileRoute(
  "/_authenticated/kategori-penjualan",
)({
  component: SalesCategoryPage,
});

function SalesCategoryPage() {
  return <SalesCategoryManager />;
}