import { useEffect, useMemo, useState } from "react";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";

import { toDateInput } from "@/lib/format";

import { AlertCircle, CalendarDays } from "lucide-react";

import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type RangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "last_year"
  | "custom";

export interface DateRange {
  preset: RangePreset;
  from: Date;
  to: Date;
}

export interface DateRangeFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  disabled?: boolean;
  maxDate?: Date;
}

interface PresetOption {
  value: RangePreset;
  label: string;
}

const PRESET_OPTIONS: PresetOption[] = [
  {
    value: "today",
    label: "Hari Ini",
  },
  {
    value: "yesterday",
    label: "Kemarin",
  },
  {
    value: "last_7_days",
    label: "7 Hari Terakhir",
  },
  {
    value: "last_30_days",
    label: "30 Hari Terakhir",
  },
  {
    value: "this_week",
    label: "Minggu Ini",
  },
  {
    value: "last_week",
    label: "Minggu Lalu",
  },
  {
    value: "this_month",
    label: "Bulan Ini",
  },
  {
    value: "last_month",
    label: "Bulan Lalu",
  },
  {
    value: "last_3_months",
    label: "3 Bulan Terakhir",
  },
  {
    value: "this_year",
    label: "Tahun Ini",
  },
  {
    value: "last_year",
    label: "Tahun Lalu",
  },
  {
    value: "custom",
    label: "Rentang Tanggal",
  },
];

/**
 * Menghasilkan rentang tanggal berdasarkan preset.
 *
 * Preset periode berjalan seperti minggu, bulan, dan tahun berakhir pada hari
 * ini agar dashboard tidak memasukkan tanggal masa depan.
 */
export function computeRange(
  preset: RangePreset,
  customFrom?: Date,
  customTo?: Date,
  referenceDate: Date = new Date(),
): DateRange {
  const now = startOfDay(referenceDate);

  switch (preset) {
    case "today":
      return {
        preset,
        from: startOfDay(now),
        to: endOfDay(now),
      };

    case "yesterday": {
      const yesterday = subDays(now, 1);

      return {
        preset,
        from: startOfDay(yesterday),
        to: endOfDay(yesterday),
      };
    }

    case "last_7_days":
      return {
        preset,
        from: startOfDay(subDays(now, 6)),
        to: endOfDay(now),
      };

    case "last_30_days":
      return {
        preset,
        from: startOfDay(subDays(now, 29)),
        to: endOfDay(now),
      };

    case "this_week":
      return {
        preset,
        from: startOfWeek(now, {
          weekStartsOn: 1,
        }),
        to: endOfDay(now),
      };

    case "last_week": {
      const previousWeekReference = subDays(
        startOfWeek(now, {
          weekStartsOn: 1,
        }),
        1,
      );

      return {
        preset,
        from: startOfWeek(previousWeekReference, {
          weekStartsOn: 1,
        }),
        to: endOfWeek(previousWeekReference, {
          weekStartsOn: 1,
        }),
      };
    }

    case "this_month":
      return {
        preset,
        from: startOfMonth(now),
        to: endOfDay(now),
      };

    case "last_month": {
      const previousMonth = subMonths(now, 1);

      return {
        preset,
        from: startOfMonth(previousMonth),
        to: endOfMonth(previousMonth),
      };
    }

    case "last_3_months":
      return {
        preset,
        from: startOfDay(subMonths(now, 3)),
        to: endOfDay(now),
      };

    case "this_year":
      return {
        preset,
        from: startOfYear(now),
        to: endOfDay(now),
      };

    case "last_year": {
      const previousYear = subYears(now, 1);

      return {
        preset,
        from: startOfYear(previousYear),
        to: endOfYear(previousYear),
      };
    }

    case "custom": {
      const safeFrom = isValidDate(customFrom)
        ? startOfDay(customFrom)
        : startOfMonth(now);

      const safeTo = isValidDate(customTo)
        ? endOfDay(customTo)
        : endOfDay(now);

      return {
        preset,
        from: safeFrom,
        to: safeTo,
      };
    }
  }
}

/**
 * Menghasilkan periode sebelumnya dengan jumlah hari yang sama.
 *
 * Contoh:
 * 1–22 Juli dibandingkan dengan 9–30 Juni.
 *
 * Fungsi ini akan dipakai dashboard untuk growth.
 */
export function computePreviousRange(
  range: DateRange,
): DateRange {
  const from = startOfDay(range.from);
  const to = endOfDay(range.to);

  const durationInMilliseconds =
    startOfDay(to).getTime() - from.getTime();

  const previousTo = endOfDay(
    new Date(from.getTime() - 24 * 60 * 60 * 1000),
  );

  const previousFrom = startOfDay(
    new Date(
      previousTo.getTime() -
        durationInMilliseconds,
    ),
  );

  return {
    preset: "custom",
    from: previousFrom,
    to: previousTo,
  };
}

/**
 * Mengubah YYYY-MM-DD menjadi Date lokal.
 *
 * Hindari new Date("YYYY-MM-DD") karena format tersebut diproses sebagai UTC
 * oleh sebagian runtime dan dapat bergeser satu hari.
 */
export function parseDateInput(
  value: string,
): Date | null {
  const parts = value.split("-");

  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(
    year,
    month - 1,
    day,
  );

  const hasMatchingParts =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return hasMatchingParts ? date : null;
}

export function isDateRangeValid(
  range: DateRange,
): boolean {
  return (
    isValidDate(range.from) &&
    isValidDate(range.to) &&
    startOfDay(range.from).getTime() <=
      startOfDay(range.to).getTime()
  );
}

export function getRangePresetLabel(
  preset: RangePreset,
): string {
  return (
    PRESET_OPTIONS.find(
      (option) => option.value === preset,
    )?.label ?? "Periode"
  );
}

export function DateRangeFilter({
  value,
  onChange,
  disabled = false,
  maxDate = new Date(),
}: DateRangeFilterProps) {
  const [fromInput, setFromInput] = useState(
    toDateInput(value.from),
  );

  const [toInput, setToInput] = useState(
    toDateInput(value.to),
  );

  const maxDateInput = useMemo(
    () => toDateInput(maxDate),
    [maxDate],
  );

  const parsedFrom = useMemo(
    () => parseDateInput(fromInput),
    [fromInput],
  );

  const parsedTo = useMemo(
    () => parseDateInput(toInput),
    [toInput],
  );

  const customRangeError = useMemo(() => {
    if (value.preset !== "custom") {
      return null;
    }

    if (!fromInput || !toInput) {
      return "Tanggal awal dan tanggal akhir wajib diisi.";
    }

    if (!parsedFrom || !parsedTo) {
      return "Format tanggal tidak valid.";
    }

    if (
      startOfDay(parsedFrom).getTime() >
      startOfDay(parsedTo).getTime()
    ) {
      return "Tanggal awal tidak boleh melewati tanggal akhir.";
    }

    if (
      startOfDay(parsedFrom).getTime() >
        startOfDay(maxDate).getTime() ||
      startOfDay(parsedTo).getTime() >
        startOfDay(maxDate).getTime()
    ) {
      return "Tanggal tidak boleh melewati hari ini.";
    }

    return null;
  }, [
    value.preset,
    fromInput,
    toInput,
    parsedFrom,
    parsedTo,
    maxDate,
  ]);

  useEffect(() => {
    setFromInput(toDateInput(value.from));
    setToInput(toDateInput(value.to));
  }, [value.from, value.to]);

  const handlePresetChange = (
    presetValue: string,
  ) => {
    const preset =
      presetValue as RangePreset;

    if (preset === "custom") {
      const customRange = computeRange(
        "custom",
        value.from,
        value.to,
      );

      setFromInput(
        toDateInput(customRange.from),
      );

      setToInput(
        toDateInput(customRange.to),
      );

      onChange(customRange);
      return;
    }

    const nextRange = computeRange(preset);

    setFromInput(
      toDateInput(nextRange.from),
    );

    setToInput(
      toDateInput(nextRange.to),
    );

    onChange(nextRange);
  };

  const handleFromChange = (
    nextValue: string,
  ) => {
    setFromInput(nextValue);

    const nextFrom =
      parseDateInput(nextValue);
    const currentTo =
      parseDateInput(toInput);

    if (!nextFrom || !currentTo) {
      return;
    }

    if (
      startOfDay(nextFrom).getTime() >
        startOfDay(currentTo).getTime() ||
      startOfDay(nextFrom).getTime() >
        startOfDay(maxDate).getTime()
    ) {
      return;
    }

    onChange(
      computeRange(
        "custom",
        nextFrom,
        currentTo,
      ),
    );
  };

  const handleToChange = (
    nextValue: string,
  ) => {
    setToInput(nextValue);

    const currentFrom =
      parseDateInput(fromInput);
    const nextTo = parseDateInput(nextValue);

    if (!currentFrom || !nextTo) {
      return;
    }

    if (
      startOfDay(currentFrom).getTime() >
        startOfDay(nextTo).getTime() ||
      startOfDay(nextTo).getTime() >
        startOfDay(maxDate).getTime()
    ) {
      return;
    }

    onChange(
      computeRange(
        "custom",
        currentFrom,
        nextTo,
      ),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="w-full md:w-[220px]">
          <Label
            htmlFor="dashboard-period"
            className="mb-1.5 block text-xs"
          >
            Periode
          </Label>

          <Select
            value={value.preset}
            disabled={disabled}
            onValueChange={handlePresetChange}
          >
            <SelectTrigger id="dashboard-period">
              <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Pilih periode" />
            </SelectTrigger>

            <SelectContent>
              {PRESET_OPTIONS.map(
                (option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        {value.preset === "custom" && (
          <>
            <div className="w-full md:w-auto">
              <Label
                htmlFor="dashboard-date-from"
                className="mb-1.5 block text-xs"
              >
                Dari
              </Label>

              <Input
                id="dashboard-date-from"
                type="date"
                value={fromInput}
                max={maxDateInput}
                disabled={disabled}
                aria-invalid={Boolean(
                  customRangeError,
                )}
                onChange={(event) =>
                  handleFromChange(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="w-full md:w-auto">
              <Label
                htmlFor="dashboard-date-to"
                className="mb-1.5 block text-xs"
              >
                Sampai
              </Label>

              <Input
                id="dashboard-date-to"
                type="date"
                value={toInput}
                min={fromInput || undefined}
                max={maxDateInput}
                disabled={disabled}
                aria-invalid={Boolean(
                  customRangeError,
                )}
                onChange={(event) =>
                  handleToChange(
                    event.target.value,
                  )
                }
              />
            </div>
          </>
        )}
      </div>

      {customRangeError && (
        <Alert
          variant="destructive"
          className="py-2"
        >
          <AlertCircle className="h-4 w-4" />

          <AlertDescription className="text-xs">
            {customRangeError}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function isValidDate(
  value: Date | undefined,
): value is Date {
  return (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  );
}