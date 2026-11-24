import type { ReactNode } from "react";

export type ScheduleScreenProps = {
  mode: "clinic" | "online" | "home";
  /** Render as one section of the Manage Schedule page, with its own publish bar. */
  embedded?: boolean;
  /** Show the schedule tip (only the first section on the page does). */
  showHelp?: boolean;
  /** Reports unpublished edits so the page can ask before discarding them. */
  onChangesChange?: (hasChanges: boolean) => void;
  /** Practice-wide sections shown below a standalone editor. */
  overview?: ReactNode;
};
