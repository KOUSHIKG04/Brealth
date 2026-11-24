import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  endShiftPlan,
  getMyDoctorProfile,
  getShiftPlans,
  scheduleChangeRequiresApproval,
  submitShiftPlan,
  withdrawShiftPlan,
} from "@startup/data-access";
import { userErrorMessage, type ShiftPlanInput } from "@startup/contracts";
import { useToast } from "@startup/mobile-ui";
import { supabase } from "../../../services/supabase";

type Mode = "clinic" | "online" | "home";

/** A service's shift plans at the practice, and saving, withdrawing, ending. */
export function useShiftPlan(practiceId: string | null, mode: Mode) {
  const client = useQueryClient();
  const { showToast } = useToast();
  const plans = useQuery({
    queryKey: ["shift-plans", practiceId],
    queryFn: () => getShiftPlans(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId),
  });
  const approval = useQuery({
    queryKey: ["schedule-approval", practiceId],
    queryFn: () => scheduleChangeRequiresApproval(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId),
  });
  const doctor = useQuery({
    queryKey: ["my-doctor-profile"],
    queryFn: () => getMyDoctorProfile(supabase!),
    enabled: Boolean(supabase),
  });
  const zone = doctor.data?.booking_timezone || "Asia/Kolkata";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const forMode = (plans.data ?? []).filter(
    (plan) => plan.service_mode === mode
  );
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["shift-plans"] });
    void client.invalidateQueries({ queryKey: ["my-doctor-schedule"] });
    void client.invalidateQueries({ queryKey: ["clinic-slots"] });
  };
  const fail = (title: string) => (cause: unknown) =>
    showToast({
      title,
      message: userErrorMessage(cause, "Try again."),
      type: "error",
    });
  const submit = useMutation({
    mutationFn: (input: { plan: ShiftPlanInput; effectiveFrom: string }) =>
      submitShiftPlan(supabase!, { practiceId: practiceId!, mode, ...input }),
    onSuccess: (result) => {
      refresh();
      showToast(
        result.status === "pending"
          ? {
              title: "Rotation sent for approval",
              message: "Your current schedule stays until it is approved.",
              type: "success",
            }
          : {
              title: "Rotation published",
              message: `${result.shifts_created ?? 0} shifts were created for the next 30 days.`,
              type: "success",
            }
      );
    },
    onError: fail("Could not save the rotation"),
  });
  const withdraw = useMutation({
    mutationFn: (planId: string) => withdrawShiftPlan(supabase!, planId),
    onSuccess: () => {
      refresh();
      showToast({ title: "Request withdrawn", type: "success" });
    },
    onError: fail("Could not withdraw the request"),
  });
  const end = useMutation({
    mutationFn: (from: string) =>
      endShiftPlan(supabase!, { practiceId: practiceId!, mode, from }),
    onSuccess: () => {
      refresh();
      showToast({
        title: "Rotation ended",
        message: "Publish a weekly schedule to keep taking bookings.",
        type: "success",
      });
    },
    onError: fail("Could not end the rotation"),
  });
  return {
    loading: plans.isLoading,
    active: forMode.find((plan) => plan.status === "active"),
    pending: forMode.find((plan) => plan.status === "pending"),
    rejected: forMode.find((plan) => plan.status === "rejected"),
    approvalRequired: approval.data === true,
    zone,
    today,
    submit,
    withdraw,
    end,
  };
}

/** Which services at the practice follow an active or pending rotation. */
export function useShiftRotationServices(practiceId: string | null) {
  const plans = useQuery({
    queryKey: ["shift-plans", practiceId],
    queryFn: () => getShiftPlans(supabase!, practiceId!),
    enabled: Boolean(supabase && practiceId),
  });
  return (mode: Mode) =>
    (plans.data ?? []).some(
      (plan) =>
        plan.service_mode === mode &&
        (plan.status === "active" || plan.status === "pending")
    );
}
