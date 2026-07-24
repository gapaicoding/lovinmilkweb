import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, RotateCcw } from "lucide-react";

import {
  VISITOR_DATE_PERIODS,
  isDateKey,
  visitorDatePeriodLabel,
  type VisitorDateFilterValue,
  type VisitorDatePeriod,
} from "@/lib/visitorDatePeriod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VisitorDateFilterProps {
  value: VisitorDateFilterValue;
  onChange: (value: VisitorDateFilterValue) => void;
  idPrefix: string;
  disabled?: boolean;
}

export function VisitorDateFilter({
  value,
  onChange,
  idPrefix,
  disabled = false,
}: VisitorDateFilterProps) {
  const [customOpen, setCustomOpen] = useState(value.period === "custom");
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");

  useEffect(() => {
    setFrom(value.from ?? "");
    setTo(value.to ?? "");
    setCustomOpen(value.period === "custom");
  }, [value.from, value.period, value.to]);

  const error =
    !from || !to
      ? "Tanggal mulai dan tanggal selesai wajib dipilih."
      : !isDateKey(from) || !isDateKey(to)
        ? "Format tanggal tidak valid."
        : from > to
          ? "Tanggal selesai tidak boleh lebih kecil dari tanggal mulai."
          : null;

  const selectPeriod = (next: string) => {
    const period = next as VisitorDatePeriod;
    if (period === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange({ period });
  };

  return (
    <div className="flex w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <div className="w-full lg:w-[220px]">
        <Label htmlFor={`${idPrefix}-period`} className="sr-only">
          Filter periode kunjungan
        </Label>
        <Select
          value={customOpen ? "custom" : value.period}
          disabled={disabled}
          onValueChange={selectPeriod}
        >
          <SelectTrigger id={`${idPrefix}-period`} aria-label="Filter periode kunjungan">
            <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISITOR_DATE_PERIODS.map((period) => (
              <SelectItem key={period} value={period}>
                {visitorDatePeriodLabel(period)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {customOpen ? (
        <div className="grid w-full gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-[160px_160px_auto]">
          <div>
            <Label htmlFor={`${idPrefix}-from`} className="mb-1.5 block text-xs">
              Tanggal mulai
            </Label>
            <Input
              id={`${idPrefix}-from`}
              type="date"
              value={from}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-to`} className="mb-1.5 block text-xs">
              Tanggal selesai
            </Label>
            <Input
              id={`${idPrefix}-to`}
              type="date"
              value={to}
              min={from || undefined}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
            <Button
              className="flex-1"
              disabled={disabled || Boolean(error)}
              onClick={() => onChange({ period: "custom", from, to })}
            >
              Terapkan
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCustomOpen(false);
                setFrom(value.from ?? "");
                setTo(value.to ?? "");
              }}
            >
              Batal
            </Button>
          </div>
          {error ? (
            <p
              className="flex items-center gap-1 text-xs text-destructive sm:col-span-2 lg:col-span-3"
              role="alert"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {value.period !== "all" ? (
        <Button
          variant="ghost"
          className="w-full lg:w-auto"
          disabled={disabled}
          onClick={() => onChange({ period: "all" })}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset Periode
        </Button>
      ) : null}
    </div>
  );
}
