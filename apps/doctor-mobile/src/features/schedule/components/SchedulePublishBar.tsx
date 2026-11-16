import { useState } from "react";
import { View } from "react-native";
import { Button } from "@startup/mobile-ui";
import { Calendar } from "lucide-react-native";
import { Label } from "../../../components/DoctorScreen";

/**
 * Fixed footer of the schedule editor. "Review" expands a short summary in
 * place (no pop-up) before the doctor publishes or submits for approval.
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
}) {
  const [reviewing, setReviewing] = useState(false);
  const timing = approvalFacility
    ? `${approvalFacility} reviews changes before they go live.`
    : `New appointment times apply from ${startsFromLabel}.`;
  if (!reviewing)
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
      </>
    );
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
      <Label variant="label">Review your schedule</Label>
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
      <Button
        theme="doctor"
        label={publishLabel}
        disabled={disabled}
        loading={loading}
        onPress={() => {
          setReviewing(false);
          void onPublish();
        }}
      />
      <Button
        theme="doctor"
        variant="ghost"
        label="Keep editing"
        disabled={loading}
        onPress={() => setReviewing(false)}
      />
    </View>
  );
}
