"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@startup/web-ui/components/ui/toast";
import type { ShiftPlan } from "@startup/contracts";
import {
  decideFacilityShiftPlan,
  loadFacilityShiftPlanRequests,
} from "../server/scheduleActions";

/** Pending shift rotations and the approve / decline workflow. */
export function useShiftPlanRequests() {
  const client = useQueryClient();
  const requests = useQuery({
    queryKey: ["facility-shift-plan-requests"],
    queryFn: () => loadFacilityShiftPlanRequests(),
  });
  const plans = requests.data && requests.data.ok ? requests.data.plans : [];
  const [pending, startTransition] = useTransition();
  const [declining, setDeclining] = useState<ShiftPlan | null>(null);
  function decide(plan: ShiftPlan, approve: boolean, reason?: string) {
    startTransition(async () => {
      const result = await decideFacilityShiftPlan(plan.id, approve, reason);
      if (!result.ok) {
        toast.add({
          title: "Rotation action failed",
          description: result.error,
          type: "error",
        });
        return;
      }
      setDeclining(null);
      toast.add({
        title: approve ? "Rotation approved" : "Rotation declined",
        description: approve
          ? "Shifts are created for the next 30 days."
          : "The doctor can see your reason and submit again.",
        type: "success",
      });
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["facility-shift-plan-requests"],
        }),
        client.invalidateQueries({ queryKey: ["facility-practice-schedule"] }),
      ]);
    });
  }
  return {
    plans,
    loadError: requests.data && !requests.data.ok ? requests.data.error : null,
    pending,
    declining,
    setDeclining,
    decide,
  };
}
