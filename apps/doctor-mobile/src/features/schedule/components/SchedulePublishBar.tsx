import { useState } from "react";
import { View } from "react-native";
import { AppDialog, Button } from "@startup/mobile-ui";
import { Calendar, Check, Pencil } from "lucide-react-native";
import { Label } from "../../../components/DoctorScreen";

/**
 * Fixed footer of the schedule editor. "Review" opens a pop-up summary before
 * the doctor publishes or submits for approval. While a request awaits the
 * facility, the footer shows "Pending request" and "Edit" instead. Once the
 * facility approves it, the footer shows "Approved" until the doctor changes
 * something, which brings back "Review & submit".
 */
export function SchedulePublishBar({
  publishLabel,
  approvalFacility,
  startsFromLabel,
  hasChanges,
  changes,
  summary,
  pausesService,
  disabled,
  loading,
  validate,
  onPublish,
  pending = false,
  onShowRequest,
  onEdit,
  approvedLabel,
}: {
  publishLabel: string;
  /** Facility that approves changes, when approval is required. */
  approvalFacility?: string;
  startsFromLabel: string;
  hasChanges: boolean;
  /** Changed settings; null for a first schedule. */
  changes: string[] | null;
  summary: string;
  pausesService: boolean;
  disabled: boolean;
  loading: boolean;
  validate: () => boolean;
  onPublish: () => void | Promise<void>;
  /** A request awaits the facility and the form is locked. */
  pending?: boolean;
  onShowRequest?: () => void;
  onEdit?: () => void;
  /** Set when the latest request was approved and nothing changed since. */
  approvedLabel?: string;
}) {
  const [reviewing, setReviewing] = useState(false);
  const timing = approvalFacility
    ? `${approvalFacility} reviews changes before they go live.`
    : `New appointment times apply from ${startsFromLabel}.`;
  if (pending)
    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          theme="doctor"
          variant="outline"
          label="Pending request"
          style={{ flex: 1 }}
          onPress={onShowRequest}
        />
        <Button
          theme="doctor"
          label="Edit"
          leftIcon={<Pencil size={16} color="white" />}
          style={{ flex: 1 }}
          onPress={onEdit}
        />
      </View>
    );
  if (approvedLabel && !hasChanges)
    return (
      <>
        <Label variant="caption" muted>
          {approvedLabel} Change any setting to submit a new request.
        </Label>
        <Button
          theme="doctor"
          label="Approved"
          leftIcon={<Check size={17} color="white" />}
          disabled
        />
      </>
    );
  return (
    <>
      <Label variant="caption" muted>
        {timing}
        {hasChanges ? " Unsaved changes." : ""}
      </Label>
      <Button
        theme="doctor"
        label={approvalFacility ? "Review & submit" : "Review & publish"}
        leftIcon={<Calendar size={17} color="white" />}
        disabled={disabled}
        loading={loading}
        onPress={() => {
          if (validate()) setReviewing(true);
        }}
      />
      <AppDialog
        theme="doctor"
        visible={reviewing}
        title={
          approvalFacility ? "Submit for approval" : "Review your schedule"
        }
        confirmLabel={publishLabel}
        cancelLabel="Keep editing"
        onClose={() => setReviewing(false)}
        onConfirm={() => {
          setReviewing(false);
          void onPublish();
        }}
      >
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <Label>{summary}</Label>
          <Label variant="caption" muted>
            {changes === null
              ? "New schedule."
              : changes.length
                ? `Changed: ${changes.join(", ")}.`
                : "No changes since it was last saved."}
          </Label>
          {pausesService ? (
            <Label variant="caption" muted>
              Home visits are off, so open home-visit times are withdrawn.
            </Label>
          ) : null}
          <Label variant="caption" muted>
            {timing} Existing appointments keep their times.
          </Label>
        </View>
      </AppDialog>
    </>
  );
}
