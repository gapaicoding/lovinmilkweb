import { VisitorDailyRecapPanel } from "@/components/visitor/VisitorDailyRecapPanel";
import { VisitorVisitManager } from "@/components/VisitorVisitManager";

export function VisitorRecapPage() {
  return (
    <div className="space-y-8">
      <VisitorDailyRecapPanel />
      <section className="space-y-3 border-t pt-6">
        <div>
          <h2 className="text-lg font-semibold">Kunjungan Sesi / Data Lama</h2>
          <p className="text-sm text-muted-foreground">
            Check-in dan checkout berikut dipertahankan untuk data sesi lama. Rekap kedatangan di atas tidak memerlukan checkout.
          </p>
        </div>
        <VisitorVisitManager />
      </section>
    </div>
  );
}
