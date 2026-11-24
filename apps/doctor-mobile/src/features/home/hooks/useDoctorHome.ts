import { userErrorMessage } from "@startup/contracts";
import { useTimeGreeting } from "@startup/mobile-ui";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyDoctorPresence,
  getMyDoctorProfile,
  listMyPracticeAppointments,
  listMyDoctorLocations,
  setMyDoctorPresence,
} from "@startup/data-access";
import { useToastFeedback } from "@startup/mobile-ui";
import { supabase, useMobileSession } from "../../../services/supabase";
import { doctorDayBoard } from "../utils/dayBoard";

export function useDoctorHome() {
  const greeting = useTimeGreeting();
  const insets = useSafeAreaInsets();
  const { profile } = useMobileSession();
  const [showNotifications, setShowNotifications] = useState(false);
  const [presenceError, setPresenceError] = useState("");
  const presenceBusyRef = useRef(false);
  const client = useQueryClient();
  const locations = useQuery({
    queryKey: ["my-doctor-locations", profile?.doctor?.id],
    queryFn: () => listMyDoctorLocations(supabase!),
    enabled: Boolean(supabase && profile?.doctor?.id),
  });
  const selectedLocation = locations.data?.find((item) => item.selected);
  useToastFeedback({
    error: locations.isError
      ? "Could not load saved locations. Tap the location to retry."
      : "",
  });
  const doctorProfile = useQuery({
    queryKey: ["my-doctor-profile", profile?.doctor?.id],
    queryFn: () => getMyDoctorProfile(supabase!),
    enabled: Boolean(supabase && profile?.doctor?.id),
  });
  const appointments = useQuery({
    queryKey: ["doctor-clinic-appointments", "all"],
    queryFn: () => listMyPracticeAppointments(supabase!),
    enabled: Boolean(supabase),
  });
  const presence = useQuery({
    queryKey: ["my-doctor-presence"],
    queryFn: () => getMyDoctorPresence(supabase!),
    enabled: Boolean(supabase && profile?.doctor?.id),
  });

  // Keep queue counts current while the dashboard is visible, as the
  // Appointments screen does; live updates still refresh it immediately.
  const refetchAppointments = appointments.refetch;
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => void refetchAppointments(), 30000);
      return () => clearInterval(timer);
    }, [refetchAppointments])
  );
  const board = doctorDayBoard(appointments.data ?? []);
  const todayAppointments = board.ordered;
  const { waiting, withDoctor, needsReview, pendingRequests } = board;
  const homeAppointments = [
    ...pendingRequests,
    ...todayAppointments.filter(
      (item) => !pendingRequests.some((request) => request.id === item.id)
    ),
  ];
  async function changePresence(value: boolean) {
    if (!supabase || presenceBusyRef.current) return;
    presenceBusyRef.current = true;
    setPresenceError("");
    try {
      await setMyDoctorPresence(supabase, value);
      await client.invalidateQueries({ queryKey: ["my-doctor-presence"] });
    } catch (cause) {
      setPresenceError(
        userErrorMessage(cause, "Could not update your presence.")
      );
    } finally {
      presenceBusyRef.current = false;
    }
  }

  return {
    refresh: () => [
      appointments.refetch({ throwOnError: true }),
      doctorProfile.refetch({ throwOnError: true }),
      presence.refetch({ throwOnError: true }),
      locations.refetch({ throwOnError: true }),
    ],
    greeting,
    insets,
    showNotifications,
    setShowNotifications,
    presenceError,
    selectedLocation,
    doctorProfile,
    appointments,
    presence,
    todayAppointments,
    todayCount: board.today,
    waiting,
    withDoctor,
    needsReview,
    pendingRequests,
    homeAppointments,
    changePresence,
  };
}
