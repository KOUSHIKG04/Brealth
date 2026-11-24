import { useToastFeedback, type NotificationItem } from "@startup/mobile-ui";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dismissMyNotification,
  listMyNotifications,
  markMyNotificationsRead,
} from "@startup/data-access";
import { type InAppNotification, notificationTime } from "@startup/contracts";
import { supabase } from "../../../services/supabase";
import { router } from "expo-router";
import { appointmentDetailsRoute } from "../../appointments/utils/appointmentNavigation";
import { scheduleNotificationCopy } from "../utils/scheduleNotificationCopy";

import type { NotificationDrawerProps } from "../types/notifications";

export function useNotificationDrawer({
  visible,
  onClose,
}: NotificationDrawerProps) {
  const [showModal, setShowModal] = useState(visible);
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => listMyNotifications(supabase!),
    enabled: Boolean(supabase && showModal),
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => markMyNotificationsRead(supabase!, ids),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["my-notifications"] }),
  });
  const removeNotification = useMutation({
    mutationFn: (id: string) => dismissMyNotification(supabase!, id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<InAppNotification[]>(
        ["my-notifications"],
        (current) => current?.filter((item) => item.id !== id)
      );
      void queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    },
  });
  useToastFeedback({
    error: removeNotification.isError
      ? "Could not delete notification. Try again."
      : notificationsQuery.isError
        ? "Could not load notifications. Close and reopen to retry."
        : markRead.isError
          ? "Could not mark notifications read. Try again."
          : "",
  });
  const notifications: NotificationItem[] = (notificationsQuery.data ?? []).map(
    (item) => {
      const status = item.safe_parameters.status;
      const isAppointment = item.template_key.startsWith("appointment.");
      const isAmbulance = item.template_key.startsWith("ambulance.");
      const schedule = scheduleNotificationCopy(
        item.template_key,
        item.safe_parameters
      );
      return {
        id: item.id,
        title:
          item.template_key === "appointment.check_in"
            ? "Patient arrived at clinic"
            : item.template_key === "appointment.requested"
              ? "Appointment requested"
              : item.template_key === "appointment.auto_confirmed" ||
                  item.template_key === "appointment.approve"
                ? "Appointment confirmed"
                : isAppointment
                  ? "Appointment update"
                  : isAmbulance
                    ? "Ambulance trip update"
                    : item.template_key.startsWith("verification.")
                      ? "Verification update"
                      : (schedule?.title ?? "Notification"),
        message:
          item.template_key === "appointment.requested"
            ? "Open this request to review the patient and accept or reject the appointment."
            : item.template_key === "appointment.check_in" &&
                typeof item.safe_parameters.booking_code === "string"
              ? `Booking ${item.safe_parameters.booking_code} - Patient checked in`
              : schedule
                ? schedule.message
                : typeof status === "string"
                  ? `Status: ${status.replaceAll("_", " ")}`
                  : "You have a new update.",
        time: notificationTime(item.created_at),
        type: isAppointment ? ("appointment" as const) : ("general" as const),
        read: item.is_read,
        important: item.is_important,
        emergency: item.is_emergency,
      };
    }
  );
  const markAllAsRead = useCallback(() => {
    markRead.mutate();
  }, [markRead]);

  const handleCardPress = useCallback(
    (id: string) => {
      const item = notifications.find((n) => n.id === id);
      if (item && !item.read) {
        markRead.mutate([id]);
      }
      const notification = notificationsQuery.data?.find(
        (entry) => entry.id === id
      );
      const route = appointmentDetailsRoute(
        notification?.safe_parameters.appointment_id
      );
      if (route) {
        onClose();
        router.push(route);
      } else if (
        notification &&
        scheduleNotificationCopy(
          notification.template_key,
          notification.safe_parameters
        )
      ) {
        // Rotation and schedule decisions open that service's schedule.
        const mode = notification.safe_parameters.service_mode;
        onClose();
        router.push(
          mode === "clinic" || mode === "online" || mode === "home"
            ? { pathname: "/schedule", params: { mode } }
            : "/schedule"
        );
      }
    },
    [notifications, notificationsQuery.data, markRead, onClose]
  );

  return {
    onRefresh: () => notificationsQuery.refetch({ throwOnError: true }),
    onVisibilityChange: setShowModal,
    notifications,
    loading: notificationsQuery.isLoading,
    loadFailed: notificationsQuery.isError,
    onMarkAllRead: markAllAsRead,
    onNotificationPress: handleCardPress,
    onDelete: (id: string) => removeNotification.mutate(id),
    deletingId: removeNotification.isPending
      ? removeNotification.variables
      : undefined,
  };
}
