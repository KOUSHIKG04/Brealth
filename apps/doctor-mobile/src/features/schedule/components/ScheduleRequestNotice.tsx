import { View } from "react-native";
import { Button } from "@startup/mobile-ui";
import {
  formatDisplayDate,
  type ScheduleChangeRequest,
} from "@startup/contracts";
import { Label } from "../../../components/DoctorScreen";
import { palette } from "../../../components/theme";
import { ScheduleSection } from "./ScheduleSection";

/**
 * Shown at facilities that approve this doctor's changes: the approval rule,
 * a pending request (with withdraw) or the latest decision.
 */
export function ScheduleRequestNotice({
  request,
  facilityName,
  busy,
  onWithdraw,
}: {
  request?: ScheduleChangeRequest;
  facilityName: string;
  busy: boolean;
  onWithdraw: (requestId: string) => void;
}) {
  const pending = request?.status === "pending";
  return (
    <ScheduleSection title="Approval required">
      <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
        <Label variant="caption" muted>
          {facilityName} approves changes to your schedule here. Your current
          schedule stays live until a change is approved.
        </Label>
        {pending ? (
          <Label>
            Waiting for approval · sent {formatDisplayDate(request.created_at)}
            {request.effective_from
              ? ` · starts ${formatDisplayDate(request.effective_from)}`
              : ""}
          </Label>
        ) : null}
        {request?.status === "rejected" ? (
          <Label style={{ color: palette.danger }}>
            Declined on{" "}
            {formatDisplayDate(request.decided_at ?? request.created_at)}
            {request.decision_reason ? `: ${request.decision_reason}` : "."}
          </Label>
        ) : null}
        {request?.status === "stale" ? (
          <Label style={{ color: palette.danger }}>
            {facilityName} changed this schedule after your request. Review the
            current hours and submit again.
          </Label>
        ) : null}
        {request?.status === "approved" ? (
          <Label muted>
            Last request approved on{" "}
            {formatDisplayDate(request.decided_at ?? request.created_at)}.
          </Label>
        ) : null}
        {pending ? (
          <Button
            theme="doctor"
            variant="outline"
            label="Withdraw request"
            disabled={busy}
            onPress={() => onWithdraw(request.id)}
          />
        ) : null}
      </View>
    </ScheduleSection>
  );
}
