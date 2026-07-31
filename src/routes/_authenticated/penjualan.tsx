import { createFileRoute } from "@tanstack/react-router";

import { SalesTransactionManager } from "@/components/sales/SalesTransactionManager";
import { JulyAggregateHistory } from "@/components/sales/JulyAggregateHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/penjualan")({
  component: SalesPage,
});

function SalesPage() {
  return <Tabs defaultValue="operational" className="space-y-4">
    <TabsList><TabsTrigger value="operational">Transaksi Operasional</TabsTrigger><TabsTrigger value="aggregate">Riwayat Aktual Agregat</TabsTrigger></TabsList>
    <TabsContent value="operational"><SalesTransactionManager /></TabsContent>
    <TabsContent value="aggregate"><JulyAggregateHistory /></TabsContent>
  </Tabs>;
}
