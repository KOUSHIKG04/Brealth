"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreVertical, Eye, Edit } from "lucide-react";
import { FacilityDoctorScheduleDrawer } from "./FacilityDoctorScheduleDrawer";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@startup/web-ui/components/ui/avatar";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@startup/web-ui/components/ui/dropdown-menu";
import type { DoctorRecord } from "../types/doctorManagement";

export const doctorColumns: ColumnDef<DoctorRecord>[] = [
  {
    accessorKey: "name",
    header: "Doctor",
    cell: ({ row }) => {
      const doctor = row.original;
      return (
        <div className="flex items-center gap-2.5">
          <Avatar className="border-border size-8 shrink-0 rounded-full border">
            <AvatarImage src={doctor.avatar} alt={doctor.name} />
            <AvatarFallback className="bg-muted text-primary text-xs font-semibold">
              {doctor.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-foreground truncate leading-tight font-semibold">
              {doctor.name}
            </p>
            {doctor.phone ? (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {doctor.phone}
              </p>
            ) : null}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "specialization",
    header: "Specialization",
    cell: ({ row }) => (
      <div className="text-foreground flex items-center gap-1.5 font-medium">
        <span>{row.original.specialization}</span>
      </div>
    ),
  },
  {
    accessorKey: "clinzoId",
    header: "Clinzo ID",
    cell: ({ row }) => (
      <span className="bg-muted text-primary rounded px-2 py-0.5 font-mono text-xs font-semibold">
        {row.original.clinzoId.split("-").at(-1)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      const badgeStyle =
        status === "Active"
          ? "bg-muted text-primary border-border"
          : status === "On Call"
            ? "bg-muted text-primary border-border"
            : "bg-muted text-muted-foreground border-border";

      const dotColor =
        status === "Active"
          ? "bg-primary"
          : status === "On Call"
            ? "bg-primary"
            : "bg-muted-foreground";

      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}
        >
          <span className={`size-1.5 rounded-full ${dotColor}`} />
          {status}
        </span>
      );
    },
  },
  {
    id: "schedule",
    header: "Manage schedule",
    cell: ({ row }) => {
      const doctor = row.original;
      return (
        <div className="whitespace-nowrap">
          {doctor.verified ? (
            <FacilityDoctorScheduleDrawer
              practiceId={doctor.practiceId}
              doctorName={doctor.name}
            />
          ) : (
            <p className="text-muted-foreground text-xs">
              Schedule available after verification
            </p>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => {
      const doctor = row.original;
      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-muted hover:text-foreground size-8 rounded-lg p-0"
              >
                <MoreVertical className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-sm">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-bold uppercase">
                {doctor.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex cursor-pointer items-center gap-2">
                <Eye className="text-muted-foreground size-3.5" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="flex cursor-pointer items-center gap-2">
                <Edit className="text-muted-foreground size-3.5" />
                Edit Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600">
                Deactivate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
