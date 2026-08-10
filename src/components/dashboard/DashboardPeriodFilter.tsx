import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashboardPeriodPreset } from "@/lib/businessPeriod";

const PRESETS: {
  value: DashboardPeriodPreset;
  label: string;
}[] = [
  {
    value: "today",
    label: "Hari Ini",
  },
  {
    value: "last7",
    label: "7 Hari",
  },
  {
    value: "monthToDate",
    label: "Bulan Berjalan",
  },
  {
    value: "previousMonth",
    label: "Bulan Lalu",
  },
  {
    value: "custom",
    label: "Custom",
  },
];

export function DashboardPeriodFilter({
  preset,
  startDate,
  endDate,
  onPreset,
  onRange,
}: {
  preset: DashboardPeriodPreset;
  startDate: string;
  endDate: string;
  onPreset: (
    value: DashboardPeriodPreset,
  ) => void;
  onRange: (
    startDate: string,
    endDate: string,
  ) => void;
}) {
  const safeStartDate =
    typeof startDate === "string"
      ? startDate
      : "";

  const safeEndDate =
    typeof endDate === "string"
      ? endDate
      : "";

  return (
    <div className="flex flex-col gap-2 lg:items-end">
      <div
        className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-xl border bg-muted/30 p-1"
        aria-label="Pilih periode Dashboard"
      >
        {PRESETS.map((item) => (
          <Button
            key={item.value}
            type="button"
            size="sm"
            variant={
              preset === item.value
                ? "default"
                : "ghost"
            }
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() =>
              onPreset(item.value)
            }
          >
            {item.label}
          </Button>
        ))}
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
          <CalendarDays className="ml-1 h-4 w-4 text-muted-foreground" />

          <Input
            aria-label="Tanggal mulai"
            className="h-8 w-36 border-0 bg-transparent px-2 shadow-none focus-visible:ring-1"
            type="date"
            value={safeStartDate}
            onChange={(event) =>
              onRange(
                event.target.value,
                safeEndDate,
              )
            }
          />

          <span className="text-xs text-muted-foreground">
            sampai
          </span>

          <Input
            aria-label="Tanggal akhir"
            className="h-8 w-36 border-0 bg-transparent px-2 shadow-none focus-visible:ring-1"
            type="date"
            value={safeEndDate}
            onChange={(event) =>
              onRange(
                safeStartDate,
                event.target.value,
              )
            }
          />
        </div>
      ) : null}
    </div>
  );
}