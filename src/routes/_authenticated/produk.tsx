import { createFileRoute } from "@tanstack/react-router";
import { ProductManager } from "@/components/ProductManager";

export const Route = createFileRoute("/_authenticated/produk")({
  component: () => <ProductManager />,
});