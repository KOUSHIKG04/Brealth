import { userErrorMessage } from "@startup/contracts";
import { filters } from "../utils/unavailableTimeConstants";
import type { Scope } from "../types/unavailable-time-manager";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useToast } from "@startup/mobile-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addClinicUnavailability,
  getMyDoctorProfile,
  listClinicUnavailability,
  listMyPractices,
  listMyScheduleChangeRequests,
  revokeClinicUnavailability,
  scheduleChangeRequiresApproval,
  submitScheduleChangeRequest,
} from "@startup/data-access";
import {
  type ClinicUnavailability,
  type ClinicPractice,
} from "@startup/contracts";
import { supabase, useMobileSession } from "../../../services/supabase";
import {
  getSelectedPracticeId,
  setSelectedPracticeId,
} from "../../practices/services/selectedPractice";
import { selectedPracticeQueryKey } from "../../practices/utils/practiceQueryKeys";
import { practiceTimeIso } from "../utils/unavailableTime";

export function useUnavailableTimeManager() {
  const client = useQueryClient();
  const { showToast } = useToast();
  const { profile } = useMobileSession();
  const doctorId = profile?.doctor?.id;
  const practices = useQuery({
    queryKey: ["my-practices"],
    queryFn: () => listMyPractices(supabase!),
    enabled: Boolean(supabase),
  });
  const doctor = useQuery({
    queryKey: ["my-doctor-profile"],
    queryFn: () => getMyDoctorProfile(supabase!),
    enabled: Boolean(supabase),
  });
  const preferred = useQuery({
    queryKey: selectedPracticeQueryKey(doctorId),
    queryFn: () => getSelectedPracticeId(doctorId!),
    enabled: Boolean(doctorId),
  });
  const availablePractices = practices.data as ClinicPractice[] | undefined;
  const [practice, setPractice] = useState<string | null>(null);
  const practiceId =
    availablePractices?.find((p) => p.practice_id === practice)?.practice_id ??
    availablePractices?.find((p) => p.practice_id === preferred.data)
      ?.practice_id ??
    availablePractices?.[0]?.practice_id;
  const unavailable = useQuery({
    queryKey: ["doctor-clinic-unavailability", practiceId],
    queryFn: () => listClinicUnavailability(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId),
  });
  useFocusEffect(
    useCallback(() => {
      void client.invalidateQueries({
        queryKey: ["doctor-clinic-unavailability"],
      });
    }, [client])
  );
  // At hospitals and clinics the doctor does not run, time off is approved.
  const approval = useQuery({
    queryKey: ["schedule-approval", practiceId],
    queryFn: () => scheduleChangeRequiresApproval(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId),
  });
  const approvalRequired = approval.data === true;
  const changeRequests = useQuery({
    queryKey: ["schedule-change-requests", practiceId],
    queryFn: () => listMyScheduleChangeRequests(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId && approvalRequired),
  });
  const timeOffRequests = (changeRequests.data ?? []).filter(
    (request) =>
      request.status === "pending" &&
      (request.kind === "time_off_add" || request.kind === "time_off_remove")
  );
  const facilityName =
    availablePractices?.find((p) => p.practice_id === practiceId)
      ?.facility_name ?? "The facility";
  const [scopes, setScopes] = useState<Scope[]>(["all"]);
  function toggleScope(value: Scope) {
    setScopes((current) => {
      if (value === "all") return ["all"];
      const next = current.filter((item) => item !== "all");
      const chosen = next.includes(value)
        ? next.filter((item) => item !== value)
        : [...next, value];
      return chosen.length === 0 || chosen.length === 3 ? ["all"] : chosen;
    });
  }
  const scopeLabel = scopes.includes("all")
    ? "all services"
    : filters
        .filter(([value]) => scopes.includes(value))
        .map(([, label]) => label)
        .join(" and ");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const zone = doctor.data?.booking_timezone;
  const busy = pending !== null;
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({
        queryKey: ["schedule-change-requests", practiceId],
      }),
      client.invalidateQueries({
        queryKey: ["doctor-clinic-unavailability", practiceId],
      }),
      client.invalidateQueries({
        queryKey: ["doctor-clinic-sessions", practiceId],
      }),
    ]);
  }
  async function add() {
    if (!supabase || !practiceId || !zone || busy) return;
    setPending("add-leave");
    try {
      const day = date;
      if (!day) throw new Error("Choose a date.");
      const startsAt = practiceTimeIso(day, start, zone);
      const endsAt = practiceTimeIso(day, end, zone);
      if (endsAt <= startsAt)
        throw new Error("End time must be after start time.");
      if (approvalRequired)
        await submitScheduleChangeRequest(supabase, {
          practiceId,
          kind: "time_off_add",
          payload: {
            starts_at: startsAt,
            ends_at: endsAt,
            reason,
            service_modes: scopes,
          },
        });
      else
        await addClinicUnavailability(supabase, {
          practiceId,
          startsAt,
          endsAt,
          reason,
          serviceModes: scopes,
        });
      await refresh();
      setDate("");
      setStart("");
      setEnd("");
      setReason("");
      showToast(
        approvalRequired
          ? {
              title: "Time off sent for approval",
              message: `${facilityName} will review it. Your slots stay open until it is approved.`,
              type: "success",
            }
          : { title: "Unavailable time saved", type: "success" }
      );
    } catch (cause) {
      showToast({
        title: "Could not add unavailable time",
        message: userErrorMessage(cause, "Try again."),
        type: "error",
      });
    } finally {
      setPending(null);
    }
  }
  async function remove(item: ClinicUnavailability) {
    if (!supabase || busy) return;
    setPending(`remove-leave:${item.id}`);
    try {
      if (approvalRequired) {
        await submitScheduleChangeRequest(supabase, {
          practiceId: practiceId!,
          kind: "time_off_remove",
          // Dates and reason are shown to the approver; the server uses the id.
          payload: {
            exception_id: item.id,
            expected_version: Number(item.row_version),
            starts_at: item.starts_at,
            ends_at: item.ends_at,
            reason: item.reason,
          },
        });
        showToast({
          title: "Removal sent for approval",
          message: `${facilityName} will review it.`,
          type: "success",
        });
      } else
        await revokeClinicUnavailability(supabase, {
          exceptionId: item.id,
          expectedVersion: Number(item.row_version),
        });
      await refresh();
    } catch (cause) {
      showToast({
        title: "Could not remove unavailable time",
        message: userErrorMessage(cause, "Refresh and try again."),
        type: "error",
      });
    } finally {
      setPending(null);
    }
  }

  function selectPractice(p: ClinicPractice) {
    setPractice(p.practice_id);
    if (doctorId)
      void setSelectedPracticeId(doctorId, p.practice_id)
        .then(() =>
          client.setQueryData(selectedPracticeQueryKey(doctorId), p.practice_id)
        )
        .catch(() =>
          showToast({
            title: "Could not remember clinic",
            type: "error",
          })
        );
  }
  return {
    selectPractice,
    client,
    showToast,
    doctorId,
    practices,
    doctor,
    availablePractices,
    setPractice,
    practiceId,
    unavailable,
    scopes,
    toggleScope,
    scopeLabel,
    date,
    setDate,
    start,
    setStart,
    end,
    setEnd,
    reason,
    setReason,
    pending,
    zone,
    busy,
    add,
    remove,
    approvalRequired,
    timeOffRequests,
    facilityName,
  };
}
