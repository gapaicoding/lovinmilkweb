import { createFileRoute } from "@tanstack/react-router";

import { SubunitManager } from "@/components/SubunitManager";

export const Route = createFileRoute(
  "/_authenticated/subunit-bisnis",
)({
  component: SubunitBusinessPage,
});

function SubunitBusinessPage() {
  return <SubunitManager />;
}