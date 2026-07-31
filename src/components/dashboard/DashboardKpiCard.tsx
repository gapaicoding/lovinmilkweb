import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface DashboardKpiCardProps {
  title: string;

  value: string;

  icon: LucideIcon;

  loading?: boolean;

  helper?: string;

  growth?: number | null;

  iconBackground?: string;

  valueClassName?: string;

  compact?: boolean;
}

export function DashboardKpiCard({
  title,
  value,
  icon: Icon,
  loading = false,
  helper,
  growth = null,
  iconBackground = "bg-primary/10",
  valueClassName = "",
  compact = false,
}: DashboardKpiCardProps) {
  const growthPositive = growth !== null && growth > 0;
  const growthNegative = growth !== null && growth < 0;
  const growthNeutral = growth === null || growth === 0;

  return (
    <div className={`rounded-xl border bg-card shadow-sm transition-all hover:shadow-md ${compact ? "p-4" : "p-5"}`}>

      <div className="flex items-start justify-between">

        <div className="min-w-0 flex-1">

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>

          {loading ? (
            <Skeleton className="mt-3 h-8 w-36" />
          ) : (
            <h2
              className={`${compact ? "mt-1.5 break-words text-xl" : "mt-2 truncate text-2xl"} font-bold ${valueClassName}`}
            >
              {value}
            </h2>
          )}

          {loading ? (
            <Skeleton className="mt-3 h-4 w-28" />
          ) : helper ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {helper}
            </p>
          ) : null}
        </div>

        <div
          className={`flex shrink-0 items-center justify-center rounded-xl ${compact ? "h-10 w-10" : "h-12 w-12"} ${iconBackground}`}
        >
          <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </div>
      </div>

      {growth !== null && (
        <div className="mt-5 flex items-center gap-2">

          {growthPositive && (
            <>
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />

              <span className="text-sm font-semibold text-emerald-600">
                +{growth.toFixed(1)}%
              </span>

              <span className="text-xs text-muted-foreground">
                dibanding periode sebelumnya
              </span>
            </>
          )}

          {growthNegative && (
            <>
              <ArrowDownRight className="h-4 w-4 text-destructive" />

              <span className="text-sm font-semibold text-destructive">
                {growth.toFixed(1)}%
              </span>

              <span className="text-xs text-muted-foreground">
                dibanding periode sebelumnya
              </span>
            </>
          )}

          {growthNeutral && (
            <>
              <Minus className="h-4 w-4 text-muted-foreground" />

              <span className="text-sm text-muted-foreground">
                Tidak berubah
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
