import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/item-pengeluaran")({
  component: () => <Navigate to="/pengeluaran" replace />,
});
