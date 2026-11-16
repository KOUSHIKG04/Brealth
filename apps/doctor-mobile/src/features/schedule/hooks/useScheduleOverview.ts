import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyDoctorProfile,
  getMySchedulePreferences,
  listMyScheduleChangeRequests,
  scheduleChangeRequiresApproval,
} from "@startup/data-access";
import { supabase } from "../../../services/supabase";
import type { ServiceStatus } from "../types/schedule-overview";
import {
  serviceStatus,
  serviceSummary,
  weekChart,
} from "../utils/scheduleOverview";
import { useSchedulePractice } from "./useSchedulePractice";

const modes = ["clinic", "online", "home"] as const;

/** Status and hours of each service at the chosen practice. */
export function useScheduleOverview() {
  const client = useQueryClient();
  const practice = useSchedulePractice();
  const { practiceId, selectedPractice } = practice;
  const doctor = useQuery({
    queryKey: ["my-doctor-profile"],
    queryFn: () => getMyDoctorProfile(supabase!),
    enabled: Boolean(supabase),
  });
  const saved = useQuery({
    queryKey: ["my-doctor-schedule", practiceId],
    queryFn: () => getMySchedulePreferences(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId),
  });
  const approval = useQuery({
    queryKey: ["schedule-approval", practiceId],
    queryFn: () => scheduleChangeRequiresApproval(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId && selectedPractice?.verified),
  });
  const changeRequests = useQuery({
    queryKey: ["schedule-change-requests", practiceId],
    queryFn: () => listMyScheduleChangeRequests(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId && approval.data === true),
  });
  // Editors publish on their own screens; refresh the cards on return.
  useFocusEffect(
    useCallback(() => {
      void client.invalidateQueries({ queryKey: ["my-doctor-schedule"] });
      void client.invalidateQueries({
        queryKey: ["schedule-change-requests"],
      });
    }, [client])
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: doctor.data?.booking_timezone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const services = Object.fromEntries(
    modes.map((mode) => {
      const status = serviceStatus(saved.data, mode, {
        pendingRequest: changeRequests.data?.find(
          (request) =>
            request.kind === "schedule" &&
            request.service_mode === mode &&
            request.status === "pending"
        ),
        verified: Boolean(selectedPractice?.verified),
        today,
      });
      const published = saved.data?.published_modes?.includes(mode) ?? false;
      return [
        mode,
        {
          status,
          summary:
            saved.data && published ? serviceSummary(saved.data, mode) : null,
        },
      ];
    })
  ) as Record<
    (typeof modes)[number],
    { status: ServiceStatus; summary: string | null }
  >;
  return { ...practice, saved, services, week: weekChart(saved.data) };
}
