import { createFileRoute } from "@tanstack/react-router";

import { SalesTransactionManager } from "@/components/sales/SalesTransactionManager";
import { JulyAggregateHistory } from "@/components/sales/JulyAggregateHistory";
import { SalesRecap } from "@/components/sales/SalesRecap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/penjualan")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.visitId === "string" && /^[0-9a-f-]{36}$/i.test(search.visitId)
      ? { visitId: search.visitId }
      : {}),
    ...(typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
      ? { date: search.date }
      : {}),
    ...(typeof search.transactionId === "string" && /^[0-9a-f-]{36}$/i.test(search.transactionId)
      ? { transactionId: search.transactionId }
      : {}),
  }),
  component: SalesPage,
});

function SalesPage() {
  return <Tabs defaultValue="operational" className="space-y-4">
    <TabsList><TabsTrigger value="operational">Transaksi</TabsTrigger><TabsTrigger value="recap">Rekap Sales</TabsTrigger><TabsTrigger value="aggregate">Riwayat Historis</TabsTrigger></TabsList>
    <TabsContent value="operational"><SalesTransactionManager /></TabsContent>
    <TabsContent value="recap"><SalesRecap /></TabsContent>
    <TabsContent value="aggregate"><JulyAggregateHistory /></TabsContent>
  </Tabs>;
}
