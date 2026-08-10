import { createFileRoute } from "@tanstack/react-router";
import { OperationalExpenseManager } from "@/components/expenses/OperationalExpenseManager";

export const Route = createFileRoute("/_authenticated/pengeluaran")({
  component: LegacyExpensesPage,
});

function LegacyExpensesPage() {
  return <OperationalExpenseManager />;
}
