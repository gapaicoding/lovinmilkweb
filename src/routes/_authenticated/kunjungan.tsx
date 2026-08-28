import { createFileRoute } from "@tanstack/react-router";
import { VisitorRecapPage } from "@/components/VisitorRecapPage";
import { validateVisitorDateSearch } from "@/lib/visitorDatePeriod";

export const Route = createFileRoute("/_authenticated/kunjungan")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateVisitorDateSearch(search),
    ...(typeof search.visitId === "string" && /^[0-9a-f-]{36}$/i.test(search.visitId)
      ? { visitId: search.visitId }
      : {}),
  }),
  component: VisitorRecapPage,
});
