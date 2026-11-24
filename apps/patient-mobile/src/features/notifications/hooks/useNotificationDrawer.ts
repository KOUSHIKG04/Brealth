import { useToastFeedback, type NotificationItem } from "@startup/mobile-ui";
import { useCallback, useState } from "react";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dismissMyNotification,
  listClinicAppointments,
  listMyNotifications,
  markMyNotificationsRead,
} from "@startup/data-access";
import {
  type ClinicAppointment,
  type InAppNotification,
  notificationTime,
} from "@startup/contracts";
import { supabase } from "../../../services/supabase";

import type { NotificationDrawerProps } from "../types/notifications";
import {
  notificationCopy,
  notificationPrefixCopy,
} from "../utils/notificationsConstants";

function appointmentWhen(appointment: ClinicAppointment) {
  const date = new Date(appointment.starts_at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: appointment.timezone,
  }).format(date);
}

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
  // Same query (and cache) as Home and My Bookings, used to name the doctor
  // and time an appointment notification is about.
  const appointmentsQuery = useQuery({
    queryKey: ["patient-clinic-appointments"],
    queryFn: () => listClinicAppointments(supabase!),
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
      const params = item.safe_parameters;
      const copy = notificationCopy[item.template_key] ??
        notificationPrefixCopy.find(([prefix]) =>
          item.template_key.startsWith(prefix)
        )?.[1] ?? { kind: "general" as const, title: "Update", message: "" };
      const reason =
        typeof params.reason === "string" && params.reason.trim()
          ? params.reason.trim()
          : null;
      const status =
        typeof params.status === "string"
          ? `Status: ${params.status.replaceAll("_", " ")}`
          : null;
      const detail =
        item.template_key === "appointment.reschedule_requested"
          ? `Doctor’s reason: ${reason ?? "the doctor’s hours have changed"}. Choose another time or contact the hospital or clinic. Your booking and payment stay in place until a separate decision is made`
          : copy.message ||
            reason ||
            status ||
            "Open your bookings for details";
      const appointment = appointmentsQuery.data?.find(
        (entry) =>
          entry.id === params.appointment_id ||
          entry.public_code === params.booking_code
      );
      const when = appointment ? appointmentWhen(appointment) : null;
      const who = appointment
        ? [appointment.doctor_name, when].filter(Boolean).join(" · ")
        : null;
      return {
        id: item.id,
        title: copy.title,
        // Doctor and time when the booking is known; the event detail otherwise.
        // A reschedule request keeps its reason and next steps.
        message:
          who && item.template_key === "appointment.reschedule_requested"
            ? `${who}. ${detail}`
            : who || detail,
        time: notificationTime(item.created_at),
        createdAt: item.created_at,
        type: copy.kind,
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
      if (
        notification?.template_key === "appointment.reschedule_requested" &&
        typeof notification.safe_parameters.appointment_id === "string"
      ) {
        onClose();
        router.push({
          pathname: "/appointment-details/[id]",
          params: { id: notification.safe_parameters.appointment_id },
        });
      }
    },
    [notifications, markRead, notificationsQuery.data, onClose]
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
