import { createFileRoute } from "@tanstack/react-router";
import { TransactionManager } from "@/components/TransactionManager";

export const Route = createFileRoute("/_authenticated/penjualan")({
  component: () => <TransactionManager kind="sales" />,
});
