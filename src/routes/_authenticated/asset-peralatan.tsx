import { createFileRoute } from "@tanstack/react-router";
import { OperationalAssetManager } from "@/components/assets/OperationalAssetManager";

export const Route = createFileRoute("/_authenticated/asset-peralatan")({
  component: OperationalAssetManager,
});
