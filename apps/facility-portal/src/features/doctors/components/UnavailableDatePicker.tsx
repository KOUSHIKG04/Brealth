"use client";

import type { UnavailableDatePickerProps } from "../types/unavailableDatePicker";
import { Calendar } from "@startup/web-ui/components/ui/calendar";

export function UnavailableDatePicker({
  value,
  onChange,
  timeZone,
  disabled,
  minDate,
  label = "Select date",
}: UnavailableDatePickerProps) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const firstDay = minDate ?? today;
  // Parse calendar dates locally so the selected day never shifts with UTC conversion.
  const asDate = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  };
  const max = new Date(today + "T12:00:00Z");
  max.setUTCFullYear(max.getUTCFullYear() + 1);
  const lastDay = max.toISOString().slice(0, 10);
  return (
    <div className="min-w-0 space-y-2" role="group" aria-label={label}>
      <p className="text-foreground text-sm font-medium">{label}</p>
      <Calendar
        mode="single"
        selected={value ? asDate(value) : undefined}
        defaultMonth={asDate(value || firstDay)}
        startMonth={asDate(firstDay)}
        endMonth={asDate(lastDay)}
        captionLayout="dropdown"
        weekStartsOn={1}
        showOutsideDays={false}
        disabled={
          disabled
            ? true
            : [{ before: asDate(firstDay) }, { after: asDate(lastDay) }]
        }
        className="border-border max-w-full rounded-xl border p-3 text-sm tabular-nums [--cell-size:--spacing(9)]"
        onSelect={(date) => {
          if (!date || disabled) return;
          onChange(
            [
              date.getFullYear(),
              String(date.getMonth() + 1).padStart(2, "0"),
              String(date.getDate()).padStart(2, "0"),
            ].join("-")
          );
        }}
      />
    </div>
  );
}
