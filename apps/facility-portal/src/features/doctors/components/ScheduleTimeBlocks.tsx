"use client";

import { useState } from "react";
import { Button } from "@startup/web-ui/components/ui/button";
import { ClockTimePicker } from "./ClockTimePicker";
import type { ScheduleTimeBlocksProps } from "../types/scheduleTimeBlocks";

/** IDs belong to this editing session and never enter the published settings. */
export function ScheduleTimeBlocks({ initialBlocks, end, pending, onChange }: ScheduleTimeBlocksProps) {
  const [rows, setRows] = useState(() => initialBlocks.map((block) => ({ id: crypto.randomUUID(), block })));
  const changeRows = (next: typeof rows) => {
    setRows(next);
    onChange(next.map((row) => row.block));
  };
  return <>
    {rows.map((row, position) => <div key={row.id} className="space-y-3">
      <p className="text-sm font-medium">Time block {position + 1}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ClockTimePicker label="Start Time" value={row.block.start} disabled={pending} onChange={(start) => changeRows(rows.map((item) => item.id === row.id ? { ...item, block: { ...item.block, start } } : item))} />
        <ClockTimePicker label="End Time" value={row.block.end} disabled={pending} endOfDay onChange={(finish) => changeRows(rows.map((item) => item.id === row.id ? { ...item, block: { ...item.block, end: finish } } : item))} />
      </div>
      {rows.length > 1 ? <Button type="button" variant="outline" disabled={pending} onClick={() => changeRows(rows.filter((item) => item.id !== row.id))}>Remove time block {position + 1}</Button> : null}
    </div>)}
    <Button type="button" variant="outline" disabled={pending || rows.length >= 8 || end === "24:00"} onClick={() => {
      const [hours, minutes] = end.split(":").map(Number);
      const finish = Math.min(hours * 60 + minutes + 60, 1440);
      changeRows([...rows, { id: crypto.randomUUID(), block: { start: end, end: `${String(Math.floor(finish / 60)).padStart(2, "0")}:${String(finish % 60).padStart(2, "0")}` } }]);
    }}>Add time block</Button>
  </>;
}
