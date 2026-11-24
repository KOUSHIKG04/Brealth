"use client";

import type { AddDoctorDialogProps } from "../types/addDoctorDialog";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@startup/web-ui/components/ui/dialog";
import { AddDoctorCard } from "./AddDoctorCard";
import { toast } from "@startup/web-ui/components/ui/toast";

export function AddDoctorDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddDoctorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Add New Doctor</DialogTitle>
        <DialogDescription>
          Invite a doctor to your hospital or clinic. They must accept the
          invitation before joining.
        </DialogDescription>
        <AddDoctorCard
          onSuccess={() => {
            onOpenChange(false);
            onSuccess?.();
            toast.add({
              title: "Invitation sent to doctor",
              description: "You can track it in Notifications.",
              type: "success",
            });
          }}
          showOuterHeader={false}
        />
      </DialogContent>
    </Dialog>
  );
}
