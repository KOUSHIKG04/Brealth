"use client";

import { useAddDoctorAction } from "../hooks/useAddDoctorAction";

import { Plus } from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import { AddDoctorDialog } from "./AddDoctorDialog";

export function AddDoctorAction({
  onSuccess,
}: { onSuccess?: () => void } = {}) {
  const { isAddDoctorOpen, setIsAddDoctorOpen } = useAddDoctorAction();
  return (
    <>
      <AddDoctorDialog
        open={isAddDoctorOpen}
        onOpenChange={setIsAddDoctorOpen}
        onSuccess={onSuccess}
      />
      <Button
        onClick={() => setIsAddDoctorOpen(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 min-h-10 cursor-pointer items-center gap-2 rounded-lg px-4 py-0 text-sm font-medium transition-colors"
      >
        <Plus aria-hidden="true" className="size-4 stroke-2" />
        <span>Add new Doctor</span>
      </Button>
    </>
  );
}
