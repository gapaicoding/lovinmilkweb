import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Play, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ModuleError, ModuleInitialLoading } from "@/components/actual/ActualModuleUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { actualClient, getActualDataErrorMessage } from "@/lib/actualData";

interface BatchRow {
  id: string;
  batch_key: string;
  description: string;
  status: string;
  facts_period_start: string | null;
  facts_period_end: string | null;
  expected_metrics: Record<string, unknown>;
  completed_at: string | null;
}

interface ReconciliationRow {
  id: string;
  import_batch_id: string;
  phase: string;
  metric_key: string;
  expected_value: string | null;
  actual_value: string | null;
  passed: boolean;
  checked_at: string;
  details: Record<string, unknown>;
}

interface ReconciliationClient {
  rpc(
    functionName: "admin_run_batch_reconciliation",
    args: { p_batch_id: string },
  ): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
}

export const Route = createFileRoute("/_authenticated/kontrol-data")({
  component: DataControlPage,
});

function DataControlPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const batchesQuery = useQuery({
    queryKey: ["data-control", "batches"],
    enabled: isAdmin,
    queryFn: async (): Promise<BatchRow[]> => {
      const [batchResult, resultResult] = await Promise.all([
        actualClient
          .from<BatchRow>("data_import_batches")
          .select(
            "id,batch_key,description,status,facts_period_start,facts_period_end,expected_metrics,completed_at",
          )
          .order("created_at", { ascending: false }),
        actualClient
          .from<ReconciliationRow>("data_import_reconciliation_results")
          .select(
            "id,import_batch_id,phase,metric_key,expected_value,actual_value,passed,checked_at,details",
          )
          .order("checked_at", { ascending: false }),
      ]);
      const error = batchResult.error ?? resultResult.error;
      if (error) throw error;
      const results = resultResult.data ?? [];
      return (batchResult.data ?? []).map((batch) => ({
        ...batch,
        reconciliationResults: results.filter((result) => result.import_batch_id === batch.id),
      }));
    },
  });
  const mutation = useMutation({
    mutationFn: async (batchId: string) => {
      const client = actualClient as unknown as ReconciliationClient;
      const { data, error } = await client.rpc("admin_run_batch_reconciliation", {
        p_batch_id: batchId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (result) => {
      toast.success(result?.passed ? "Rekonsiliasi berhasil." : "Rekonsiliasi menemukan selisih.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["data-control"] }),
        queryClient.invalidateQueries({ queryKey: ["actual-finance"] }),
      ]);
    },
    onError: (error: unknown) =>
      toast.error("Rekonsiliasi gagal dijalankan.", {
        description: getActualDataErrorMessage(error),
      }),
  });

  if (batchesQuery.isPending) return <ModuleInitialLoading label="Memuat kontrol data" />;
  if (batchesQuery.isError)
    return <ModuleError title="Kontrol data gagal dimuat" error={batchesQuery.error} onRetry={() => void batchesQuery.refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Kontrol Data / Rekonsiliasi" description="Verifikasi historical baseline tanpa menjalankan SQL atau membuka Supabase." />
      {batchesQuery.data?.length ? (
        <div className="grid gap-4">
          {batchesQuery.data.map((batch) => {
            const results = (
              batch as BatchRow & { reconciliationResults: ReconciliationRow[] }
            ).reconciliationResults;
            const latestByMetric = new Map<string, ReconciliationRow>();
            for (const result of results) {
              if (!latestByMetric.has(result.metric_key)) latestByMetric.set(result.metric_key, result);
            }
            const latestResults = [...latestByMetric.values()];
            const differences = latestResults.filter((result) => !result.passed);
            const dirtyReason = results.find(
              (result) => result.phase === "manual_mutation" && !result.passed,
            );
            return (
            <Card key={batch.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div><CardTitle>{batch.batch_key}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{batch.description}</p></div>
                <Badge variant={batch.status === "reconciled" ? "secondary" : "destructive"}>
                  {batch.status === "reconciled" ? "Terverifikasi" : "Perlu rekonsiliasi"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{batch.facts_period_start ?? "—"} – {batch.facts_period_end ?? "—"}</p>
                  <p>
                    Rekonsiliasi terakhir:{" "}
                    {results[0]?.checked_at
                      ? new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(results[0].checked_at))
                      : "Belum pernah"}
                  </p>
                  {dirtyReason ? (
                    <p className="text-destructive">
                      Alasan perubahan:{" "}
                      {String(dirtyReason.details.reason ?? dirtyReason.metric_key)}
                    </p>
                  ) : null}
                  {latestResults.length ? (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="min-w-[34rem] text-left text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="px-3 py-2">Metrik</th>
                            <th className="px-3 py-2">Expected</th>
                            <th className="px-3 py-2">Actual</th>
                            <th className="px-3 py-2">Hasil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestResults.map((result) => (
                            <tr key={result.id} className="border-b last:border-0">
                              <td className="px-3 py-2">{result.metric_key}</td>
                              <td className="px-3 py-2">{result.expected_value ?? "—"}</td>
                              <td className="px-3 py-2">{result.actual_value ?? "—"}</td>
                              <td className="px-3 py-2">
                                {result.passed ? "Sesuai" : "Berbeda"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>{Object.keys(batch.expected_metrics ?? {}).length} metrik kontrol</p>
                  )}
                  {differences.length ? (
                    <p className="font-medium text-destructive">
                      {differences.length} metrik masih berbeda.
                    </p>
                  ) : null}
                </div>
                <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(batch.id)}>
                  {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : batch.status === "reconciled" ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                  Jalankan Rekonsiliasi
                </Button>
              </CardContent>
            </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={ShieldCheck} title="Belum ada batch historical" description="Batch import yang dapat diverifikasi akan muncul di sini." />
      )}
    </div>
  );
}
