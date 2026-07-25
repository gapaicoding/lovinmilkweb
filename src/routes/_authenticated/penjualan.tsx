import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { TransactionManager } from "@/components/TransactionManager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/_authenticated/penjualan")({
  component: LegacySalesPage,
});

function LegacySalesPage() {
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Data operasional lama / simulasi</AlertTitle>
        <AlertDescription>
          Data di halaman ini dipertahankan untuk histori sistem dan tidak dicampurkan ke laporan
          aktual Juni 2026.
        </AlertDescription>
      </Alert>

      <TransactionManager kind="sales" />
    </div>
  );
}
