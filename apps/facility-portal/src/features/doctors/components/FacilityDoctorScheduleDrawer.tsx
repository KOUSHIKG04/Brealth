"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, CalendarDays, X } from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@startup/web-ui/components/ui/drawer";
import type { Mode } from "../types/facilityDoctorScheduleScreen";
import { FacilityDoctorScheduleScreen } from "../screens/FacilityDoctorScheduleScreen";

export function FacilityDoctorScheduleDrawer({
  practiceId,
  doctorName,
}: {
  practiceId: string;
  doctorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <Drawer
      swipeDirection="right"
      open={open}
      disablePointerDismissal
      onOpenChange={(next, event) => {
        if (!next && pending) {
          event.cancel();
          return;
        }
        setOpen(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setMode(undefined);
      }}
    >
      <DrawerTrigger
        render={
          <Button size="sm" variant="outline" className="min-h-9 gap-2" />
        }
        aria-label={`Manage schedule for ${doctorName}`}
      >
        <CalendarDays aria-hidden="true" className="size-4" />
        Manage schedule
      </DrawerTrigger>
      <DrawerContent className="w-full max-w-full rounded-none data-[swipe-axis=x]:w-full motion-reduce:transition-none sm:data-[swipe-axis=x]:w-[min(46rem,100vw)]">
        <DrawerHeader className="border-border gap-2 border-b p-5">
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle className="text-lg font-semibold">
              Manage schedule
            </DrawerTitle>
            <DrawerClose
              disabled={pending}
              render={<Button variant="ghost" size="icon" />}
              aria-label="Close schedule drawer"
            >
              <X className="size-4" />
            </DrawerClose>
          </div>
          <DrawerDescription>
            {doctorName} · Clinic, online and home-visit availability
          </DrawerDescription>
          {mode ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setMode(undefined)}
              className="w-fit gap-2 px-0"
            >
              <ArrowLeft className="size-4" />
              All services
            </Button>
          ) : null}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {open ? (
            <FacilityDoctorScheduleScreen
              key={`${practiceId}:${mode ?? "services"}`}
              practiceId={practiceId}
              mode={mode}
              onSelectMode={setMode}
              transition={[pending, startTransition]}
            />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
