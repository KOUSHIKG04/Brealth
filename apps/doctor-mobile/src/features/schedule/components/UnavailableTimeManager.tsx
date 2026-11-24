import { useUnavailableTimeManager } from "../hooks/useUnavailableTimeManager";
import { filters } from "../utils/unavailableTimeConstants";

export type { Scope } from "../types/unavailable-time-manager";

import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { fontFamilies } from "@startup/design-tokens";
import { Button, Chip, FadedScrollView, Loader } from "@startup/mobile-ui";

import {
  formatDisplayDateTime,
  type ClinicUnavailability,
} from "@startup/contracts";

import { Heading, Label, Panel } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
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
  // The form stays folded away until the doctor adds time off.
  const [adding, setAdding] = useState(false);
  const active = (
    (unavailable.data as ClinicUnavailability[] | undefined) ?? []
  ).filter(
    (item) =>
      item.state === "active" && new Date(item.ends_at).getTime() > Date.now()
  );
  return (
    <>
      <Panel>
        <View style={ui.between}>
          <View style={{ flex: 1, gap: 2 }}>
            <Heading>Time off</Heading>
            <Label variant="caption" muted>
              {active.length ? `${active.length} upcoming` : "Nothing planned"}
            </Label>
          </View>
          {practiceId ? (
            <Button
              theme="doctor"
              variant={adding ? "ghost" : "outline"}
              label={adding ? "Cancel" : "Add time off"}
              leftIcon={
                adding ? undefined : <Plus size={16} color={palette.primary} />
              }
              disabled={busy}
              onPress={() => setAdding((open) => !open)}
            />
          ) : null}
        </View>
        {adding ? (
          <>
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
            <Label muted>
              This block applies to {scopeLabel.toLowerCase()}.
            </Label>
          </>
        ) : null}
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
            formOpen={adding}
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
                !adding ||
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
