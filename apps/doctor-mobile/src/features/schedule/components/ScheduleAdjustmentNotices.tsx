import { View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, useToast } from "@startup/mobile-ui";
import { listMyScheduleAdjustments } from "@startup/data-access";
import {
  scheduleServiceLabel,
  type ScheduleAdjustmentNotice,
} from "@startup/contracts";
import { supabase, useMobileSession } from "../../../services/supabase";
import { setSelectedPracticeId } from "../../practices/services/selectedPractice";
import { selectedPracticeQueryKey } from "../../practices/utils/practiceQueryKeys";
import { Heading, Label } from "../../../components/DoctorScreen";

export function ScheduleAdjustmentNotices({
  onSelectPractice,
}: {
  onSelectPractice?: (practiceId: string) => void;
}) {
  const { profile } = useMobileSession();
  const { showToast } = useToast();
  const doctorId = profile?.doctor?.id;
  const client = useQueryClient();
  const notices = useQuery({
    queryKey: ["schedule-adjustments", doctorId],
    queryFn: () => listMyScheduleAdjustments(supabase!),
    enabled: Boolean(supabase && doctorId),
  });
  return (
    <>
      {notices.data?.map((notice: ScheduleAdjustmentNotice) => (
        <View
          key={`${notice.practice_id}:${notice.mode}`}
          style={{ gap: 8 }}
          accessibilityLiveRegion="polite"
        >
          <Heading>
            {scheduleServiceLabel(notice.mode)} schedule needs review
          </Heading>
          <Label muted>
            {notice.facility_name}: {notice.message}
          </Label>
          <Button
            theme="doctor"
            variant="outline"
            label={
              notice.message.startsWith("Waiting for rescheduling.")
                ? "Review affected bookings"
                : `Set ${scheduleServiceLabel(notice.mode)} hours`
            }
            onPress={async () => {
              if (notice.message.startsWith("Waiting for rescheduling.")) {
                router.push("/appointments");
                return;
              }
              if (!doctorId) return;
              try {
                await setSelectedPracticeId(doctorId, notice.practice_id);
                client.setQueryData(
                  selectedPracticeQueryKey(doctorId),
                  notice.practice_id
                );
                onSelectPractice?.(notice.practice_id);
                router.push(`/manage-schedule/${notice.mode}`);
              } catch {
                showToast({
                  title: "Could not open schedule",
                  message: "Try again.",
                  type: "error",
                });
              }
            }}
          />
        </View>
      ))}
    </>
  );
}
