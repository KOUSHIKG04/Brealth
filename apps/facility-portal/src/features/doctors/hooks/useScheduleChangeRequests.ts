"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@startup/web-ui/components/ui/toast";
import {
  scheduleChangeRequestTitle,
  type ScheduleChangePreview,
  type ScheduleChangeRequest,
  type ScheduleConflictDecision,
} from "@startup/contracts";
import {
  approveFacilityScheduleChangeRequest,
  loadFacilityScheduleChangeRequests,
  previewFacilityScheduleChangeRequest,
  rejectFacilityScheduleChangeRequest,
} from "../server/scheduleActions";

/** Pending doctor requests and the approve / decline workflow. */
export function useScheduleChangeRequests() {
  const client = useQueryClient();
  const requests = useQuery({
    queryKey: ["facility-schedule-change-requests"],
    queryFn: () => loadFacilityScheduleChangeRequests(),
  });
  const list = requests.data && requests.data.ok ? requests.data.requests : [];
  const [pending, startTransition] = useTransition();
  // A schedule request whose preview found conflicts or affected bookings.
  const [review, setReview] = useState<{
    request: ScheduleChangeRequest;
    preview: ScheduleChangePreview;
  } | null>(null);
  const [rejecting, setRejecting] = useState<ScheduleChangeRequest | null>(
    null
  );

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: ["facility-schedule-change-requests"],
      }),
      client.invalidateQueries({ queryKey: ["facility-practice-schedule"] }),
      client.invalidateQueries({ queryKey: ["schedule-adjustments"] }),
    ]);
  const fail = (message: string) => {
    toast.add({
      title: "Request action failed",
      description: message,
      type: "error",
    });
  };
  const staleNotice = () => {
    toast.add({
      title: "Schedule changed since this request",
      description: "The doctor has been asked to review and submit again.",
      type: "info",
    });
  };

  async function decide(
    request: ScheduleChangeRequest,
    previewToken?: string,
    decision?: ScheduleConflictDecision
  ) {
    const result = await approveFacilityScheduleChangeRequest(
      request.id,
      previewToken,
      decision
    );
    if (!result.ok) {
      fail(result.error);
      await refresh();
      return;
    }
    setReview(null);
    if (result.status === "stale") staleNotice();
    else
      toast.add({
        title: "Request approved",
        description: `${scheduleChangeRequestTitle(request)} for ${request.doctor_name} is now live.`,
        type: "success",
      });
    await refresh();
  }

  const approve = (request: ScheduleChangeRequest) =>
    startTransition(async () => {
      if (request.kind !== "schedule") {
        await decide(request);
        return;
      }
      const checked = await previewFacilityScheduleChangeRequest(request.id);
      if (!checked.ok) {
        fail(checked.error);
        return;
      }
      if (checked.status === "stale") {
        staleNotice();
        await refresh();
        return;
      }
      if (checked.preview.conflicts.length) {
        setReview({ request, preview: checked.preview });
        return;
      }
      await decide(request, checked.preview.token);
    });

  const confirmConflict = (decision?: ScheduleConflictDecision) => {
    if (!review) return;
    startTransition(() =>
      decide(review.request, review.preview.token, decision)
    );
  };

  const reject = (reason: string) => {
    if (!rejecting) return;
    const request = rejecting;
    startTransition(async () => {
      const result = await rejectFacilityScheduleChangeRequest(
        request.id,
        reason
      );
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setRejecting(null);
      toast.add({
        title: "Request declined",
        description: `${request.doctor_name} has been told your reason.`,
        type: "success",
      });
      await refresh();
    });
  };

  return {
    requests,
    list,
    pending,
    approve,
    review,
    dismissReview: () => setReview(null),
    confirmConflict,
    rejecting,
    startReject: (request: ScheduleChangeRequest) => setRejecting(request),
    cancelReject: () => setRejecting(null),
    reject,
  };
}
