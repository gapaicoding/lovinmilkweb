import { createFileRoute } from "@tanstack/react-router";
import { VisitorVisitManager } from "@/components/VisitorVisitManager";

export const Route = createFileRoute("/_authenticated/kunjungan")({
  component: VisitorVisitManager,
});
