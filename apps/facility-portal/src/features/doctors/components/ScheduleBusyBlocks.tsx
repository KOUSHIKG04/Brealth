"use client";

import {
  scheduleBlockSummary,
  scheduleServiceLabel,
  type ScheduleBusyBlock,
} from "@startup/contracts";

/** Time already published for this doctor's other services or practices. */
export function ScheduleBusyBlocks({
  blocks,
  overlaps,
}: {
  blocks: ScheduleBusyBlock[];
  overlaps: ScheduleBusyBlock[];
}) {
  if (!blocks.length) return null;
  const clashing = new Set(overlaps.map((item) => item.rule_id));
  return (
    <div className="space-y-2 rounded-lg border border-[#E2E8F0] p-3">
      <p className="text-foreground text-sm font-medium">
        Already scheduled elsewhere
      </p>
      <p className="text-muted-foreground text-sm">
        Choose hours outside these blocks to publish without conflicts.
      </p>
      {overlaps.length ? (
        <p className="text-destructive text-sm" role="status">
          These hours overlap{" "}
          {overlaps.length === 1 ? "one block" : `${overlaps.length} blocks`}{" "}
          below. Publishing will ask how to adjust them.
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {blocks.map((item) => (
          <li
            key={item.rule_id}
            className={
              clashing.has(item.rule_id)
                ? "text-destructive text-sm"
                : "text-foreground text-sm"
            }
          >
            <span className="font-medium">
              {scheduleServiceLabel(item.mode)} · {item.facility_name}
              {clashing.has(item.rule_id) ? " · overlaps" : ""}
            </span>
            <span className="text-muted-foreground block">
              {scheduleBlockSummary(item)}
              {item.travel_buffer_minutes
                ? ` · ${item.travel_buffer_minutes} min travel buffer`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
