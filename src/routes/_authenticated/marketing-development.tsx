import { createFileRoute } from "@tanstack/react-router";
import { MarketingDevelopmentManager } from "@/components/marketing/MarketingDevelopmentManager";
export const Route = createFileRoute("/_authenticated/marketing-development")({
  component: MarketingDevelopmentManager,
});
