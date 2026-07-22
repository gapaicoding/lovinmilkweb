import { createFileRoute } from "@tanstack/react-router";
import { CategoryManager } from "@/components/CategoryManager";

export const Route = createFileRoute("/_authenticated/kategori-pengeluaran")({
  component: () => <CategoryManager table="expense_categories" title="Kategori Pengeluaran" />,
});
