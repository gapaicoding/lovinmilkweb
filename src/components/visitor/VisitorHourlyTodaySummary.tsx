import type { VisitorDailyRecap } from "@/lib/visitorRecap";
import { aggregateVisitorRecapBySlot } from "@/lib/visitorRecap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface VisitorHourlyTodaySummaryProps {
  today: string;
  recap: VisitorDailyRecap | null | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function VisitorHourlyTodaySummary({ today, recap, isLoading, error }: VisitorHourlyTodaySummaryProps) {
  const slots = aggregateVisitorRecapBySlot(recap?.entries ?? []);
  const totals = slots.reduce(
    (sum, slot) => ({
      adults: sum.adults + slot.adult_count,
      children: sum.children + slot.child_count,
      visitors: sum.visitors + slot.total_visitors,
    }),
    { adults: 0, children: 0, visitors: 0 },
  );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Rekap Pengunjung Per Jam Hari Ini</CardTitle>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{formatBusinessDate(today)}</p>
          <p>Ringkasan kedatangan pengunjung per 30 menit, pukul 07:00–22:00.</p>
          <p>Perekap: <span className="font-medium text-foreground">{recap?.recorder_name || "—"}</span></p>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">Memuat rekap pengunjung hari ini…</p>
        ) : error ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Rekap pengunjung hari ini gagal dimuat: {error.message}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">Jam Kedatangan</TableHead>
                  <TableHead className="text-right">Dewasa</TableHead>
                  <TableHead className="text-right">Anak</TableHead>
                  <TableHead className="bg-muted/40 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map((slot) => (
                  <TableRow key={slot.arrival_time}>
                    <TableCell className="font-medium">{slot.arrival_time}</TableCell>
                    <TableCell className="text-right tabular-nums">{slot.adult_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{slot.child_count}</TableCell>
                    <TableCell className="bg-muted/20 text-right font-medium tabular-nums">{slot.total_visitors}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{totals.adults}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{totals.children}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{totals.visitors}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatBusinessDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}
