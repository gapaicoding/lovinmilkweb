import { createFileRoute } from "@tanstack/react-router";
import { CustomerInterviewManager } from "@/components/interviews/CustomerInterviewManager";
export const Route=createFileRoute("/_authenticated/wawancara-orang-tua")({component:CustomerInterviewManager});
