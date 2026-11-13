"use client";

import {
  DataTable,
  createDisplayColumns,
} from "@startup/web-ui/components/data-table";
import { assignmentTableHeaders } from "../utils/doctorSchedulesConstants";
import { formatDisplayDate } from "@startup/contracts";
import type { DoctorAssignmentsTableProps } from "../types/doctorAssignmentsTable";

import { Avatar, AvatarFallback } from "@startup/web-ui/components/ui/avatar";

const assignmentColumns = createDisplayColumns(assignmentTableHeaders);

export function DoctorAssignmentsTable({
  assignments,
  selectedDay,
}: DoctorAssignmentsTableProps) {
  const tableRows = assignments.map((doc) => {
    return {
      id: doc.id,
      cells: [
        <div key="doctor" className="px-3 py-3.5">
          <div className="text-foreground flex items-center gap-3 font-semibold">
            <Avatar className="border-border size-8 rounded-full border">
              <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                {doc.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span>{doc.name}</span>
          </div>
        </div>,
        <div
          key="department"
          className="text-muted-foreground px-3 py-3.5 font-medium"
        >
          {doc.department}
        </div>,
        <div
          key="time"
          className="text-foreground px-3 py-3.5 font-medium whitespace-nowrap tabular-nums"
        >
          {doc.shiftTime}
        </div>,
        <div key="status" className="px-3 py-3.5">
          {doc.status === "In Surgery" && (
            <span className="bg-destructive/10 text-destructive inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold">
              In Surgery
            </span>
          )}
          {doc.status === "On Duty" && (
            <span className="bg-muted text-primary inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold">
              On Duty
            </span>
          )}
          {doc.status === "On Call" && (
            <span className="bg-muted text-muted-foreground inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold">
              On Call
            </span>
          )}
          {doc.status === "Home Visit" && (
            <span className="bg-muted text-primary inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold">
              Home Visit
            </span>
          )}
        </div>,
        <div
          key="contact"
          className="text-muted-foreground px-3 py-3.5 font-medium"
        >
          {doc.contact}
        </div>,
      ],
    };
  });
  return (
    <div className="border-border bg-card min-w-0 rounded-xl border p-4 sm:p-5">
      <div className="border-border border-b pb-4">
        <h2 className="text-foreground text-lg font-semibold">
          Doctor assignments
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Upcoming published shifts for{" "}
          {formatDisplayDate(
            new Date(selectedDay + "T12:00:00Z"),
            "Asia/Kolkata"
          )}
        </p>
      </div>

      <div className="mt-2 overflow-x-auto">
        <DataTable
          columns={assignmentColumns}
          data={tableRows}
          enableColumnResizing
          manualPagination
          hidePagination
          bare
          cellClassName="p-0 align-top"
          getRowId={(row) => row.id}
          emptyMessage="No published doctor assignments for the selected date."
        />
      </div>
    </div>
  );
}
