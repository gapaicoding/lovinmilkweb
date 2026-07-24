import { createFileRoute } from "@tanstack/react-router";
import { VisitorManager } from "@/components/VisitorManager";

export const Route = createFileRoute("/_authenticated/pengunjung")({
  component: VisitorManager,
});
