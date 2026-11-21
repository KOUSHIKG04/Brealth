"use client";

import { useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@startup/web-ui/components/ui/toast";
import type { ShiftPlanInput } from "@startup/contracts";
import {
  endFacilityShiftPlan,
  loadFacilityShiftPlans,
  submitFacilityShiftPlan,
} from "../server/scheduleActions";
import type { Mode } from "../types/facilityDoctorScheduleScreen";

/** A doctor's shift rotation for one service, published by facility staff. */
export function useFacilityShiftPlan(practiceId: string, mode: Mode) {
  const client = useQueryClient();
  const [pending, startTransition] = useTransition();
  const query = useQuery({
    queryKey: ["facility-shift-plans", practiceId],
    queryFn: () => loadFacilityShiftPlans(practiceId),
  });
  const data = query.data && query.data.ok ? query.data : null;
  const forMode = (data?.plans ?? []).filter(
    (plan) => plan.service_mode === mode
  );
  const timezone = data?.timezone ?? "Asia/Kolkata";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["facility-shift-plans"] }),
      client.invalidateQueries({ queryKey: ["facility-shift-plan-requests"] }),
      client.invalidateQueries({ queryKey: ["facility-practice-schedule"] }),
    ]);
  function publish(
    plan: ShiftPlanInput,
    effectiveFrom: string,
    onDone: () => void
  ) {
    startTransition(async () => {
      const result = await submitFacilityShiftPlan({
        practiceId,
        mode,
        plan,
        effectiveFrom,
      });
      if (!result.ok) {
        toast.add({
          title: "Could not publish the rotation",
          description: result.error,
          type: "error",
        });
        return;
      }
      toast.add({
        title: "Rotation published",
        description: `${result.shiftsCreated} shifts were created for the next 30 days.`,
        type: "success",
      });
      onDone();
      await refresh();
    });
  }
  function end(from: string) {
    startTransition(async () => {
      const result = await endFacilityShiftPlan({ practiceId, mode, from });
      if (!result.ok) {
        toast.add({
          title: "Could not end the rotation",
          description: result.error,
          type: "error",
        });
        return;
      }
      toast.add({
        title: "Rotation ended",
        description: "Publish a weekly schedule to keep taking bookings.",
        type: "success",
      });
      await refresh();
    });
  }
  return {
    loading: query.isPending,
    loadError: query.data && !query.data.ok ? query.data.error : null,
    active: forMode.find((plan) => plan.status === "active"),
    pending: forMode.find((plan) => plan.status === "pending"),
    timezone,
    today,
    busy: pending,
    publish,
    end,
  };
}
