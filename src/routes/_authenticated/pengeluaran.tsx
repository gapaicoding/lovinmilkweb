import { createFileRoute } from "@tanstack/react-router";
import { History, Info } from "lucide-react";

import { OperationalExpenseManager } from "@/components/expenses/OperationalExpenseManager";
import { TransactionManager } from "@/components/TransactionManager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/pengeluaran")({
  component: LegacyExpensesPage,
});

function LegacyExpensesPage() {
  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Sumber pengeluaran dipisahkan berdasarkan periode</AlertTitle>
        <AlertDescription>
          Pengeluaran Operasional menjadi sumber laporan setelah tanggal cutover Outlet. Data lama
          tetap tersedia sebagai histori dan tidak dihitung ulang.
        </AlertDescription>
      </Alert>
      <Tabs defaultValue="operational">
        <TabsList><TabsTrigger value="operational">Pengeluaran Operasional</TabsTrigger><TabsTrigger value="legacy"><History className="mr-2 h-4 w-4" />Data Historis</TabsTrigger></TabsList>
        <TabsContent value="operational" className="mt-4"><OperationalExpenseManager /></TabsContent>
        <TabsContent value="legacy" className="mt-4"><TransactionManager kind="expenses" /></TabsContent>
      </Tabs>
    </div>
  );
}
