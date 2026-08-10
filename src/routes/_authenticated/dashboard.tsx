import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/PageHeader";
import { DashboardBusinessTrend } from "@/components/dashboard/DashboardBusinessTrend";
import { DashboardPeriodFilter } from "@/components/dashboard/DashboardPeriodFilter";
import { DashboardPrimaryKpis } from "@/components/dashboard/DashboardPrimaryKpis";
import { DashboardSubunitOverview } from "@/components/dashboard/DashboardSubunitOverview";
import {
  DashboardCoverage,
  DashboardOperationalStatus,
  DashboardOutletCosts,
  DashboardProductInsights,
} from "@/components/dashboard/DashboardSecondarySections";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  dashboardPeriodRange,
  type DashboardPeriodPreset,
} from "@/lib/businessPeriod";
import { formatDate } from "@/lib/format";
import {
  groupProductRowsByCategory,
  productRowsToRankingItems,
} from "@/lib/productAnalytics";
import {
  fetchCurrentInventory,
  fetchDashboardDailySeries,
  fetchOutletReport,
  fetchProductReport,
  fetchSubunitReport,
  getFinanceCoverage,
  hasJulyOverlap,
  sourceStatusLabel,
} from "@/lib/reporting";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const initial = useMemo(
    () => dashboardPeriodRange("monthToDate"),
    [],
  );

  const [preset, setPreset] =
    useState<DashboardPeriodPreset>("monthToDate");

  const [startDate, setStartDate] =
    useState<string>(initial.startDate);

  const [endDate, setEndDate] =
    useState<string>(initial.endDate);

  const validRange = Boolean(
    startDate &&
    endDate &&
    startDate <= endDate,
  );

  const structure = useQuery({
    queryKey: ["dashboard", "structure"],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [outlets, subunits] = await Promise.all([
        supabase
          .from("outlets")
          .select("id,name")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("is_default", { ascending: false }),

        supabase
          .from("business_subunits")
          .select("id,name,outlet_id,inventory_enabled")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name"),
      ]);

      if (outlets.error) throw outlets.error;
      if (subunits.error) throw subunits.error;

      const outlet = outlets.data?.[0];

      if (!outlet) {
        throw new Error("Outlet aktif belum tersedia.");
      }

      const outletSubunits =
        subunits.data?.filter(
          (row) => row.outlet_id === outlet.id,
        ) ?? [];

      return {
        outlet,
        subunits: outletSubunits,
      };
    },
  });

  const outletId = structure.data?.outlet.id;

  const lovin = structure.data?.subunits.find(
    (row) =>
      normalizeName(row.name) === "lovin milk",
  );

  const arayya = structure.data?.subunits.find(
    (row) =>
      normalizeName(row.name) === "arayya",
  );

  const common = {
    enabled: Boolean(outletId) && validRange,
    refetchOnWindowFocus: false,
  };

  const report = useQuery({
    queryKey: [
      "dashboard",
      "outlet",
      outletId,
      startDate,
      endDate,
    ],
    ...common,
    queryFn: () =>
      fetchOutletReport(
        outletId!,
        startDate,
        endDate,
      ),
  });

  const daily = useQuery({
    queryKey: [
      "dashboard",
      "daily",
      outletId,
      startDate,
      endDate,
    ],
    ...common,
    retry: 1,
    staleTime: 30_000,
    queryFn: () =>
      fetchDashboardDailySeries(
        outletId!,
        startDate,
        endDate,
      ),
  });

  const products = useQuery({
    queryKey: [
      "dashboard",
      "products",
      outletId,
      startDate,
      endDate,
    ],
    ...common,
    retry: false,
    queryFn: () =>
      fetchProductReport(
        outletId!,
        startDate,
        endDate,
      ),
  });

  const inventory = useQuery({
    queryKey: [
      "dashboard",
      "inventory",
      outletId,
    ],
    enabled: Boolean(outletId),
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () =>
      fetchCurrentInventory(outletId!),
  });

  const lovinReport = useQuery({
    queryKey: [
      "dashboard",
      "subunit",
      lovin?.id,
      startDate,
      endDate,
    ],
    enabled: Boolean(lovin?.id) && validRange,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () =>
      fetchSubunitReport(
        lovin!.id,
        startDate,
        endDate,
      ),
  });

  const arayyaReport = useQuery({
    queryKey: [
      "dashboard",
      "subunit",
      arayya?.id,
      startDate,
      endDate,
    ],
    enabled: Boolean(arayya?.id) && validRange,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () =>
      fetchSubunitReport(
        arayya!.id,
        startDate,
        endDate,
      ),
  });

  const dailyRows = Array.isArray(
    daily.data?.rows,
  )
    ? daily.data.rows
    : [];

  const productRows = useMemo(
    () => [
      ...(products.data?.legacy_rows ?? []),
      ...(products.data?.operational_rows ?? []),
    ],
    [products.data],
  );

  const mixedProducts =
    products.data?.source_status === "mixed";

  const ranking = useMemo(
    () =>
      mixedProducts
        ? []
        : productRowsToRankingItems(
            productRows,
          ),
    [mixedProducts, productRows],
  );

  const categories = useMemo(
    () =>
      mixedProducts
        ? []
        : groupProductRowsByCategory(
            productRows,
          ),
    [mixedProducts, productRows],
  );

  const dailyLovinRevenue = useMemo(
    () =>
      dailyRows.length
        ? dailyRows.reduce(
            (sum, row) =>
              sum +
              finiteNumber(
                row.lovin_revenue,
              ),
            0,
          )
        : null,
    [dailyRows],
  );

  const dailyArayyaRevenue = useMemo(
    () =>
      dailyRows.length
        ? dailyRows.reduce(
            (sum, row) =>
              sum +
              finiteNumber(
                row.arayya_revenue,
              ),
            0,
          )
        : null,
    [dailyRows],
  );

  const lovinRevenue =
    typeof lovinReport.data?.revenue === "number"
      ? lovinReport.data.revenue
      : dailyLovinRevenue;

  const arayyaRevenue =
    typeof arayyaReport.data?.revenue === "number"
      ? arayyaReport.data.revenue
      : dailyArayyaRevenue;

  const adult = nullableSum(
    dailyRows.map(
      (row) => row.visitor_adult,
    ),
  );

  const child = nullableSum(
    dailyRows.map(
      (row) => row.visitor_child,
    ),
  );

  const historicalOnly =
    report.data?.source_status === "legacy";

  const financeCoverage =
    getFinanceCoverage(
      startDate,
      endDate,
      hasJulyOverlap(
        startDate,
        endDate,
      ),
    );

  const coverage = [
    hasJulyOverlap(startDate, endDate)
      ? "Data biaya dan HPP historis Juli tidak tersedia; nilai yang tidak tersedia tidak diubah menjadi nol."
      : null,

    mixedProducts
      ? "Ranking produk tidak digabung untuk periode lintas sumber."
      : null,

    report.data?.has_provisional_hpp
      ? "Sebagian HPP operasional masih provisional."
      : null,
  ].filter(
    (value): value is string =>
      Boolean(value),
  );

  function selectPreset(
    value: DashboardPeriodPreset,
  ) {
    setPreset(value);

    if (value !== "custom") {
      const range =
        dashboardPeriodRange(value);

      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <PageHeader
            title="Dashboard"
            description="Ringkasan performa Outlet Kadirojo, Lovin Milk, dan Arayya."
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {report.data ? (
              <Badge
                variant="outline"
                className="text-[11px] font-normal"
              >
                {sourceStatusLabel(
                  report.data.source_status,
                )}
              </Badge>
            ) : null}

            <span className="text-xs text-muted-foreground">
              {formatPeriodLabel(
                startDate,
                endDate,
              )}
            </span>
          </div>
        </div>

        <DashboardPeriodFilter
          preset={preset}
          startDate={startDate}
          endDate={endDate}
          onPreset={selectPreset}
          onRange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      </header>

      {!validRange ? (
        <Alert variant="destructive">
          <AlertTitle>
            Rentang tanggal tidak valid
          </AlertTitle>
          <AlertDescription>
            Tanggal mulai tidak boleh melewati
            tanggal akhir.
          </AlertDescription>
        </Alert>
      ) : null}

      {report.isError ? (
        <Alert variant="destructive">
          <AlertTitle>
            Dashboard gagal dimuat
          </AlertTitle>
          <AlertDescription>
            Ringkasan utama belum dapat
            ditampilkan. Coba muat ulang halaman.
          </AlertDescription>
        </Alert>
      ) : null}

      <DashboardPrimaryKpis
        report={report.data}
        loading={report.isPending}
        historicalBillsPartial={Boolean(
          hasJulyOverlap(
            startDate,
            endDate,
          ),
        )}
      />

      {report.data &&
      report.data.revenue === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Belum ada transaksi pada periode ini.
        </div>
      ) : null}

      <DashboardBusinessTrend
        rows={dailyRows}
        loading={daily.isPending}
        error={daily.isError}
        onRetry={() => {
          void daily.refetch();
        }}
      />

      <DashboardSubunitOverview
        lovinRevenue={lovinRevenue}
        arayyaRevenue={arayyaRevenue}
        arayyaReport={arayyaReport.data}
        loading={
          (Boolean(lovin) &&
            lovinReport.isPending) ||
          (Boolean(arayya) &&
            arayyaReport.isPending)
        }
        historical={Boolean(
          historicalOnly,
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <DashboardOutletCosts
          report={report.data}
          unavailable={
            financeCoverage ===
            "FULLY_UNAVAILABLE"
          }
        />

        <DashboardProductInsights
          products={ranking}
          categories={categories}
          loading={products.isPending}
          mixed={Boolean(mixedProducts)}
          error={products.isError}
        />
      </div>

      <DashboardOperationalStatus
        inventory={inventory.data}
        loading={inventory.isPending}
        error={inventory.isError}
        visitors={
          report.data?.visitor_count ?? 0
        }
        adult={adult}
        child={child}
      />

      <DashboardCoverage
        messages={coverage}
      />
    </div>
  );
}

function nullableSum(
  values:
    | (number | null | undefined)[]
    | undefined,
): number | null {
  if (
    !values ||
    values.some(
      (value) =>
        value === null ||
        value === undefined,
    )
  ) {
    return null;
  }

  return values.reduce<number>(
    (sum, value) =>
      sum + finiteNumber(value),
    0,
  );
}

function finiteNumber(
  value: unknown,
): number {
  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : 0;
}

function normalizeName(
  value: unknown,
): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLocaleLowerCase("id-ID")
    : "";
}

function formatPeriodLabel(
  startDate: unknown,
  endDate: unknown,
): string {
  const start =
    typeof startDate === "string"
      ? startDate
      : null;

  const end =
    typeof endDate === "string"
      ? endDate
      : null;

  if (!start || !end) {
    return "Periode belum dipilih";
  }

  if (start === end) {
    return formatDate(start);
  }

  return `${formatDate(start)} – ${formatDate(end)}`;
}
