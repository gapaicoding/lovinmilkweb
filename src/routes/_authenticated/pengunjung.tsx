import { createFileRoute } from "@tanstack/react-router";
import { VisitorManager } from "@/components/VisitorManager";
import { validateVisitorDateSearch } from "@/lib/visitorDatePeriod";

export const Route = createFileRoute("/_authenticated/pengunjung")({
  validateSearch: validateVisitorDateSearch,
  component: VisitorManager,
});
