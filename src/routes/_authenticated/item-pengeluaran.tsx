import { createFileRoute } from "@tanstack/react-router";
import { ExpenseItemManager } from "@/components/ExpenseItemManager";

export const Route = createFileRoute(
  "/_authenticated/item-pengeluaran",
)({
  component: () => <ExpenseItemManager />,
});
