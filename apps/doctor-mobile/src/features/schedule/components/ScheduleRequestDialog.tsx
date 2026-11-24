import { View } from "react-native";
import { AppDialog, Button } from "@startup/mobile-ui";
import {
  formatDisplayDate,
  type ScheduleChangeRequest,
} from "@startup/contracts";
import { Label } from "../../../components/DoctorScreen";

/**
 * Pop-up for facilities that approve this doctor's changes: the approval rule
 * and the pending request, with withdraw and edit.
 */
export function ScheduleRequestDialog({
  visible,
  request,
  facilityName,
  busy,
  onClose,
  onWithdraw,
  onEdit,
}: {
  visible: boolean;
  request?: ScheduleChangeRequest;
  facilityName: string;
  busy: boolean;
  onClose: () => void;
  onWithdraw: (requestId: string) => void;
  onEdit: () => void;
}) {
  const pending = request?.status === "pending";
  return (
    <AppDialog
      theme="doctor"
      visible={visible}
      title="Approval required"
      busy={busy}
      onClose={onClose}
      actions={
        pending ? (
          <>
            <Button
              theme="doctor"
              label="Edit request"
              disabled={busy}
              onPress={() => {
                onClose();
                onEdit();
              }}
            />
            <Button
              theme="doctor"
              variant="outline"
              label="Withdraw request"
              disabled={busy}
              onPress={() => {
                onClose();
                onWithdraw(request.id);
              }}
            />
          </>
        ) : undefined
      }
      confirmLabel="Close"
    >
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
        {pending ? (
          <Label variant="caption" muted>
            Editing and submitting again replaces this request.
          </Label>
        ) : null}
      </View>
    </AppDialog>
  );
}
