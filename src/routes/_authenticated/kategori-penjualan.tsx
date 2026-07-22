import { createFileRoute } from "@tanstack/react-router";
import { CategoryManager } from "@/components/CategoryManager";

export const Route = createFileRoute("/_authenticated/kategori-penjualan")({
  component: () => <CategoryManager table="sales_categories" title="Kategori Penjualan" />,
});
