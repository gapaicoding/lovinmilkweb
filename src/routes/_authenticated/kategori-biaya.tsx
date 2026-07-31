import { createFileRoute } from "@tanstack/react-router";

import { CostCategoryManager } from "@/components/CostCategoryManager";

export const Route = createFileRoute(
  "/_authenticated/kategori-biaya",
)({
  component: CostCategoryPage,
});

function CostCategoryPage() {
  return <CostCategoryManager />;
}