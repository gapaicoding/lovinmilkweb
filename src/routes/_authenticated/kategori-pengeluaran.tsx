import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/kategori-pengeluaran")({
  component: () => <Navigate to="/kategori-biaya" replace />,
});
