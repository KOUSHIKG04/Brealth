import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMySchedulePreferences,
  scheduleChangeRequiresApproval,
  setAppointmentRecoveryPolicy,
  submitScheduleChangeRequest,
} from "@startup/data-access";
import {
  Accordion,
  Button,
  ClockDurationPicker,
  useToast,
} from "@startup/mobile-ui";
import { Label } from "../../../components/DoctorScreen";
import { supabase } from "../../../services/supabase";
import { NumberSetting } from "./NumberSetting";
import { RescheduleCutoffPicker } from "./RescheduleCutoffPicker";

type PolicyDraft = {
  onlineGraceMinutes: number;
  clinicGraceMinutes: number;
  rescheduleCutoffMinutes: number;
  maxSelfReschedules: number;
  expectedVersion: number;
};

export function AppointmentRecoveryPolicy({
  practiceId,
}: {
  practiceId: string;
}) {
  const client = useQueryClient();
  const { showToast } = useToast();
  const saved = useQuery({
    queryKey: ["my-doctor-schedule", practiceId],
    queryFn: () => getMySchedulePreferences(supabase!, practiceId),
  });
  const [edits, setEdits] = useState<PolicyDraft | null>(null);
  const draft = edits ?? {
    onlineGraceMinutes: saved.data?.online_grace_minutes ?? 15,
    clinicGraceMinutes: saved.data?.clinic_grace_minutes ?? 10,
    rescheduleCutoffMinutes: saved.data?.reschedule_cutoff_minutes ?? 0,
    maxSelfReschedules: saved.data?.max_self_reschedules ?? 1,
    expectedVersion: Number(saved.data?.row_version ?? 0),
  };
  // At hospitals and clinics the doctor does not run, policy changes are approved.
  const approval = useQuery({
    queryKey: ["schedule-approval", practiceId],
    queryFn: () => scheduleChangeRequiresApproval(supabase!, practiceId),
  });
  const approvalRequired = approval.data === true;
  const request = useMutation({
    mutationFn: () =>
      submitScheduleChangeRequest(supabase!, {
        practiceId,
        kind: "recovery_policy",
        expectedVersion: draft.expectedVersion,
        payload: {
          online_grace_minutes: draft.onlineGraceMinutes,
          clinic_grace_minutes: draft.clinicGraceMinutes,
          reschedule_cutoff_minutes: draft.rescheduleCutoffMinutes,
          max_self_reschedules: draft.maxSelfReschedules,
        },
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["schedule-change-requests", practiceId],
      });
      setEdits(null);
      showToast({
        title: "Policy sent for approval",
        message: "The current policy stays in place until it is approved.",
        type: "success",
      });
    },
    onError: () =>
      showToast({
        title: "Could not send the request",
        message: "Reload the latest settings and try again.",
        type: "error",
      }),
  });
  const mutation = useMutation({
    mutationFn: () =>
      setAppointmentRecoveryPolicy(supabase!, { practiceId, ...draft }),
    onSuccess: (data) => {
      client.setQueryData(["my-doctor-schedule", practiceId], data);
      void client.invalidateQueries({
        queryKey: ["doctor-clinic-appointments"],
      });
      void client.invalidateQueries({
        queryKey: ["doctor-reschedule-options"],
      });
      setEdits(null);
      showToast({ title: "Recovery policy saved", type: "success" });
    },
    onError: () => {
      void saved.refetch();
      showToast({
        title: "Could not save policy",
        message:
          "The settings may have changed. Reload the latest settings before editing again.",
        type: "error",
      });
    },
  });
  const update = (value: Partial<PolicyDraft>) =>
    setEdits({ ...draft, ...value });
  const summary = saved.data
    ? `Clinic grace ${saved.data.clinic_grace_minutes ?? 10} min · Online grace ${saved.data.online_grace_minutes ?? 15} min`
    : "Late arrivals and patient reschedules";
  return (
    <Accordion
      title="Appointment recovery"
      subtitle={edits ? `${summary} · Unsaved changes` : summary}
      theme="doctor"
      variant="outlined"
      contentStyle={{ gap: 12 }}
    >
      <Label muted>
        Clinic grace applies after the booked start time. Later arrivals need
        reception review before returning to the queue. Video consultation grace
        applies after the booked end time.
      </Label>
      {saved.isError ? (
        <Button
          theme="doctor"
          label="Retry policy"
          variant="outline"
          onPress={() => void saved.refetch()}
        />
      ) : null}
      <ClockDurationPicker
        theme="doctor"
        label="In-person (OPD) arrival grace"
        value={draft.clinicGraceMinutes}
        min={0}
        max={180}
        disabled={!saved.data || mutation.isPending}
        onChange={(clinicGraceMinutes) => update({ clinicGraceMinutes })}
      />
      <ClockDurationPicker
        theme="doctor"
        label="Online attendance grace"
        value={draft.onlineGraceMinutes}
        min={0}
        max={180}
        disabled={!saved.data || mutation.isPending}
        onChange={(onlineGraceMinutes) => update({ onlineGraceMinutes })}
      />
      <RescheduleCutoffPicker
        value={draft.rescheduleCutoffMinutes}
        disabled={!saved.data || mutation.isPending}
        onChange={(rescheduleCutoffMinutes) =>
          update({ rescheduleCutoffMinutes })
        }
      />
      <NumberSetting
        title="Allowed self-service reschedules"
        value={draft.maxSelfReschedules}
        suffix=""
        min={0}
        max={10}
        disabled={!saved.data || mutation.isPending}
        onChange={(maxSelfReschedules) => update({ maxSelfReschedules })}
      />
      {mutation.isError ? (
        <>
          <Label>Reloading replaces your unsaved changes.</Label>
          <Button
            theme="doctor"
            variant="outline"
            label="Reload latest settings"
            disabled={saved.isFetching}
            onPress={async () => {
              const result = await saved.refetch();
              if (!result.isError) {
                setEdits(null);
                mutation.reset();
              }
            }}
          />
        </>
      ) : null}
      <Button
        theme="doctor"
        label={
          approvalRequired ? "Submit for approval" : "Save recovery policy"
        }
        disabled={
          !edits || !saved.data || mutation.isPending || request.isPending
        }
        loading={mutation.isPending || request.isPending}
        onPress={() =>
          approvalRequired ? request.mutate() : mutation.mutate()
        }
      />
    </Accordion>
  );
}
