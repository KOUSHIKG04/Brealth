"use client";

import type { ClinicAppointment } from "@startup/contracts";
import { X } from "lucide-react";
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

export function PatientDetailsDrawer({ item }: { item: ClinicAppointment }) {
  return (
    <Drawer swipeDirection="right">
      <DrawerTrigger
        render={
          <Button
            variant="link"
            size="sm"
            className="text-foreground hover:text-primary h-auto min-w-0 justify-start p-0 text-left text-sm font-semibold whitespace-normal focus-visible:ring-2"
          />
        }
        aria-label={"Patient details for " + item.patient_name}
      >
        {item.patient_name}
      </DrawerTrigger>
      <DrawerContent className="w-full max-w-full rounded-none data-[swipe-axis=x]:w-full motion-reduce:transition-none sm:data-[swipe-axis=x]:w-[min(28rem,100vw)]">
        <DrawerHeader className="border-border border-b p-5">
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle className="text-lg font-semibold">
              Patient details
            </DrawerTitle>
            <DrawerClose
              render={<Button size="icon" variant="ghost" />}
              aria-label="Close patient details"
            >
              <X className="size-4" />
            </DrawerClose>
          </div>
          <DrawerDescription>
            {item.patient_name} · {item.patient_public_code.split("-").at(-1)}
          </DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <dl className="divide-border [&_dt]:text-muted-foreground divide-y text-sm [&_dd]:leading-6 [&_dd]:break-words [&>div]:space-y-1.5 [&>div]:py-4 [&>div:first-child]:pt-0">
            <div>
              <dt>Name</dt>
              <dd className="font-medium">{item.patient_name}</dd>
            </div>
            <div>
              <dt>Patient ID</dt>
              <dd className="font-medium tabular-nums">
                {item.patient_public_code.split("-").at(-1)}
              </dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{item.patient_age_years ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Gender</dt>
              <dd>{item.patient_gender ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{item.patient_phone ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Reason for visit</dt>
              <dd className="whitespace-pre-wrap">
                {item.reason || "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Appointment</dt>
              <dd className="tabular-nums">{item.public_code.slice(-8)}</dd>
            </div>
          </dl>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
