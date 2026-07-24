import { createFileRoute } from "@tanstack/react-router";
import { VisitorVisitManager } from "@/components/VisitorVisitManager";
import { validateVisitorDateSearch } from "@/lib/visitorDatePeriod";

export const Route = createFileRoute("/_authenticated/kunjungan")({
  validateSearch: validateVisitorDateSearch,
  component: VisitorVisitManager,
});
