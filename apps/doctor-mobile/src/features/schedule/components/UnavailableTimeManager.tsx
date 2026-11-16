import { useUnavailableTimeManager } from "../hooks/useUnavailableTimeManager";
import { filters } from "../utils/unavailableTimeConstants";

export type { Scope } from "../types/unavailable-time-manager";

import { View } from "react-native";
import { fontFamilies } from "@startup/design-tokens";
import { Chip, FadedScrollView, Loader } from "@startup/mobile-ui";

import {
  formatDisplayDateTime,
  type ClinicUnavailability,
} from "@startup/contracts";

import { Heading, Label, Panel } from "../../../components/DoctorScreen";
import { UnavailableTimePanel } from "./UnavailableTimePanel";

export function UnavailableTimeManager({
  practiceId: selectedPracticeId,
}: {
  practiceId: string | undefined;
}) {
  const {
    practices,
    doctor,
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
  } = useUnavailableTimeManager(selectedPracticeId);
  return (
    <>
      <Panel>
        <Heading>Unavailable time / Leave</Heading>
        <FadedScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {filters.map(([value, label]) => (
            <Chip
              key={value}
              theme="doctor"
              variant="radio"
              label={label}
              accessibilityRole="checkbox"
              selected={scopes.includes(value)}
              disabled={busy}
              onPress={() => toggleScope(value)}
            />
          ))}
        </FadedScrollView>
        <Label muted>This block applies to {scopeLabel.toLowerCase()}.</Label>
        {approvalRequired ? (
          <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
            <Label variant="caption" muted>
              {facilityName} approves time off here. Adding or removing time off
              sends a request; your slots change once it is approved.
            </Label>
            {timeOffRequests.map((request) => (
              <Label key={request.id}>
                {request.kind === "time_off_add"
                  ? "Time off waiting for approval"
                  : "Removal waiting for approval"}
                {typeof request.payload.starts_at === "string"
                  ? ` · ${formatDisplayDateTime(request.payload.starts_at, zone)}`
                  : ""}
              </Label>
            ))}
          </View>
        ) : null}
        {practices.isLoading || unavailable.isLoading ? (
          <Loader theme="doctor" />
        ) : null}
        {!practices.isLoading && !practiceId ? (
          <Label muted>
            An active practice is required to manage unavailable time.
          </Label>
        ) : null}
        {practiceId ? (
          <UnavailableTimePanel
            timeZone={zone}
            leaveDate={date}
            onLeaveDateChange={setDate}
            leaveStart={start}
            onLeaveStartChange={setStart}
            leaveEnd={end}
            onLeaveEndChange={setEnd}
            leaveReason={reason}
            onLeaveReasonChange={setReason}
            busy={busy}
            pendingAction={pending}
            canAdd={Boolean(
              zone &&
              date &&
              start &&
              end &&
              reason.trim().length >= 2 &&
              !unavailable.isFetching
            )}
            onAddLeave={() => void add()}
            unavailable={(
              unavailable.data as ClinicUnavailability[] | undefined
            )?.filter(
              (item) =>
                scopes.includes("all") ||
                item.service_mode === "all" ||
                scopes.includes(item.service_mode)
            )}
            onRemoveLeave={remove}
            isError={unavailable.isError || practices.isError || doctor.isError}
          />
        ) : null}
      </Panel>
    </>
  );
}
