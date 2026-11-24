import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelMyAmbulanceBooking,
  getMyActiveAmbulanceTracking,
  getMyPatientVerificationPin,
  listMyAmbulanceBookings,
  listPublicHospitals,
  refreshMyAmbulanceDispatch,
  requestMySos,
} from "@startup/data-access";
import { userErrorMessage } from "@startup/contracts";
import { useToast } from "@startup/mobile-ui";
import { supabase, useMobileSession } from "../../../services/supabase";
import { formatGeocodedAddress } from "../../locations/utils/locationDisplay";
import type { SosEmergencyScreenProps, SosPhase } from "../types/sos";
import {
  sosActiveStatuses,
  sosAddressTimeoutMs,
  sosDefaultSummary,
  sosDispatchEnabled,
  sosDispatchRefreshMs,
} from "../utils/sosConstants";

type Point = { latitude: number; longitude: number };

async function currentPoint(): Promise<Point> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error("location-permission");
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

async function pickupAddress(point: Point) {
  const fallback = `Location ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
  const lookup = Location.reverseGeocodeAsync(point)
    .then(([address]) => formatGeocodedAddress(address) || fallback)
    .catch(() => fallback);
  const timeout = new Promise<string>((resolve) =>
    setTimeout(() => resolve(fallback), sosAddressTimeoutMs)
  );
  const label = await Promise.race([lookup, timeout]);
  return label.trim().length >= 5 ? label : fallback;
}

export function useSosEmergency({ onClose }: SosEmergencyScreenProps) {
  const { profile } = useMobileSession();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<SosPhase>("starting");
  const [failure, setFailure] = useState("");
  const [pickup, setPickup] = useState<Point | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const abandoned = useRef(false);
  const started = useRef(false);

  const bookings = useQuery({
    queryKey: ["my-ambulance-bookings"],
    queryFn: () => listMyAmbulanceBookings(supabase!),
    enabled: Boolean(supabase && sosDispatchEnabled && profile?.patient_id),
  });
  const active = bookings.data?.find(
    (booking) =>
      booking.booking_type === "sos" &&
      (sosActiveStatuses as readonly string[]).includes(booking.status)
  );
  const sent = bookingId
    ? bookings.data?.find((booking) => booking.id === bookingId)
    : undefined;
  const booking = active ?? sent;

  const request = useMutation({
    mutationFn: async (point: Point) =>
      requestMySos(supabase!, {
        patientId: profile!.patient_id!,
        pickupLatitude: point.latitude,
        pickupLongitude: point.longitude,
        pickupAddress: await pickupAddress(point),
        summary: sosDefaultSummary,
        idempotencyKey: Crypto.randomUUID(),
      }),
  });

  async function start() {
    setFailure("");
    setPhase("locating");
    try {
      if (!sosDispatchEnabled || !supabase || !profile?.patient_id)
        throw new Error("dispatch-unavailable");
      const point = await currentPoint();
      if (abandoned.current) return;
      setPickup(point);
      setPhase("sending");
      const id = await request.mutateAsync(point);
      setBookingId(id);
      await queryClient.invalidateQueries({
        queryKey: ["my-ambulance-bookings"],
      });
      setPhase("live");
    } catch (cause) {
      if (abandoned.current) return;
      // Another SOS is already running: show it instead of failing.
      const refreshed = await bookings.refetch();
      if (
        refreshed.data?.some(
          (item) =>
            item.booking_type === "sos" &&
            (sosActiveStatuses as readonly string[]).includes(item.status)
        )
      ) {
        setPhase("live");
        return;
      }
      setFailure(
        cause instanceof Error && cause.message === "location-permission"
          ? "Location access is off. Allow it in settings, or call 108 or 112 now."
          : cause instanceof Error && cause.message === "dispatch-unavailable"
            ? "In-app ambulance dispatch is unavailable. Call 108 or 112 now."
            : userErrorMessage(
                cause,
                "We couldn’t send your SOS. Call 108 or 112 now."
              )
      );
      setPhase("failed");
    }
  }

  // Open straight onto a running SOS; otherwise start one automatically.
  useEffect(() => {
    if (started.current || bookings.isLoading) return;
    started.current = true;
    if (active) {
      setPhase("live");
      void currentPoint()
        .then(setPickup)
        .catch(() => undefined);
    } else void start();
    // Runs once, after the first bookings load; start reads the latest state.
  }, [bookings.isLoading]);

  const searching = active?.status === "searching";
  useEffect(() => {
    if (!searching || !active) return;
    const timer = setInterval(() => {
      void refreshMyAmbulanceDispatch(supabase!, active.id)
        .then(() => bookings.refetch())
        .catch(() => undefined);
    }, sosDispatchRefreshMs);
    return () => clearInterval(timer);
  }, [searching, active, bookings]);

  const tracking = useQuery({
    queryKey: ["active-ambulance-tracking", active?.id],
    queryFn: () => getMyActiveAmbulanceTracking(supabase!, active!.id),
    enabled: Boolean(supabase && active?.status === "assigned"),
    refetchInterval: 15_000,
  });
  const pinVisible =
    active?.trip_status === "in_progress" ||
    active?.trip_status === "arrived_at_destination";
  const verificationPin = useQuery({
    queryKey: ["patient-completion-pin", profile?.patient_id, active?.id],
    queryFn: () => getMyPatientVerificationPin(supabase!, profile!.patient_id!),
    enabled: Boolean(supabase && profile?.patient_id && pinVisible),
  });
  const hospitals = useQuery({
    queryKey: ["public-hospitals", "sos", pickup?.latitude, pickup?.longitude],
    queryFn: () => listPublicHospitals(supabase!, pickup!),
    enabled: Boolean(supabase && pickup && phase === "live"),
  });

  const cancel = useMutation({
    mutationFn: () =>
      cancelMyAmbulanceBooking(supabase!, {
        bookingId: active!.id,
        expectedVersion: Number(active!.row_version),
      }),
    onSuccess: () => {
      setCancelOpen(false);
      showToast({ title: "SOS cancelled", type: "success" });
      void queryClient.invalidateQueries({
        queryKey: ["my-ambulance-bookings"],
      });
      onClose();
    },
    onError: () =>
      showToast({
        title: "Could not cancel",
        message: "A driver may have accepted. Call 108 if you need help.",
        type: "error",
      }),
  });

  function leaveBeforeSending() {
    abandoned.current = true;
    onClose();
  }

  return {
    phase,
    failure,
    pickup,
    booking,
    active,
    tracking: tracking.data ?? null,
    pinVisible,
    verificationPin,
    hospital: hospitals.data?.[0] ?? null,
    retry: () => void start(),
    leaveBeforeSending,
    cancelOpen,
    setCancelOpen,
    cancel,
  };
}
