import { createFileRoute } from "@tanstack/react-router";

import { InventoryManager } from "@/components/inventory/InventoryManager";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: InventoryPage,
});

function InventoryPage() {
  return <InventoryManager />;
}
