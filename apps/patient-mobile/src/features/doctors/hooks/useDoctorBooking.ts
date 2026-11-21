import { userErrorMessage } from "@startup/contracts";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { router, useFocusEffect, type Href } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  prepareAppointmentBooking,
  getAppointmentBookingOptions,
  getMyPatientProfileDetail,
  getPublicPracticeBio,
  listClinicAppointments,
  listMyFamilyProfiles,
  listMyPatientLocations,
  listPracticeClinicSlots,
  listPracticeClinicTimeBoard,
  listPublicDoctorPractices,
  releaseAppointmentBooking,
} from "@startup/data-access";
import { useToast, useToastFeedback } from "@startup/mobile-ui";
import type { ProfileTab } from "../types/booking-calendar";
import type { ConsultationType } from "../../appointments/types/appointment";
import { supabase, useMobileSession } from "../../../services/supabase";
import { formatSavedLocation } from "../../locations/utils/locationDisplay";
import type { SavedPatientLocation } from "@startup/contracts";
import {
  isRetryablePaymentFailure,
  loadPaymentCheckout,
  payForAppointment,
} from "../../../services/paymentCheckout";

/** A reservation whose payment failed; the patient can retry or cancel. */
type PaymentFailure = {
  appointmentId: string;
  policyVersion: string;
  patientName: string;
  holdUntil: string | null;
};

export function useDoctorBooking({
  practiceId: initialPracticeId,
  serviceId,
  consultationType,
}: {
  practiceId: string;
  serviceId: string;
  consultationType: string;
}) {
  const [selectedPracticeId, setSelectedPracticeId] =
    useState(initialPracticeId);
  const { profile } = useMobileSession();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const reservation = useRef<string | null>(null);
  // Payment details for the reservation being paid, kept for a retry.
  const pendingPayment = useRef<PaymentFailure | null>(null);
  const [paymentFailure, setPaymentFailure] = useState<PaymentFailure | null>(
    null
  );
  const [recoveringPayment, setRecoveringPayment] = useState<
    "retry" | "cancel" | null
  >(null);
  const [bookingStage, setBookingStage] = useState<
    | "booking"
    | "preparing"
    | "checkout"
    | "verifying"
    | "reconciling"
    | "finishing"
    | null
  >(null);
  const [acceptedPolicy, setAcceptedPolicy] = useState("");
  const [activeTab, setRenderedTab] = useState<ProfileTab>("about");
  // The tab bar moves at once; the heavy slot section renders in a transition
  // so the screen can show a loader instead of freezing on the old tab.
  const [requestedTab, setRequestedTab] = useState<ProfileTab>("about");
  const [switchingTab, startTabSwitch] = useTransition();
  const setActiveTab = useCallback((tab: ProfileTab) => {
    setRequestedTab(tab);
    startTabSwitch(() => setRenderedTab(tab));
  }, []);
  const [overrideConsultationType, setOverrideConsultationType] =
    useState<ConsultationType | null>(null);
  const selectedConsultationType =
    overrideConsultationType ?? (consultationType as ConsultationType);
  const isOnline = selectedConsultationType === "Online";
  const serviceMode = isOnline
    ? "online"
    : selectedConsultationType === "Home Visit"
      ? "home"
      : "clinic";
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    Crypto.randomUUID()
  );
  const [confirmation, setConfirmation] = useState<{
    patientId: string;
    windowId: string;
    reason: string;
    practiceId: string;
    mode: string;
    doctor: string;
    facility: string;
    address: string;
    startsAt: string;
    timezone: string;
    fee: string;
    locationId?: string;
  } | null>(null);
  const [openingConfirmation, setOpeningConfirmation] = useState(false);
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const savedLocations = useQuery({
    queryKey: ["my-patient-locations", profile?.patient_id],
    queryFn: () => listMyPatientLocations(supabase!),
    enabled: Boolean(supabase && profile?.patient_id && !isOnline),
  });
  const selectedLocation = savedLocations.data?.find(
    (item: SavedPatientLocation) => item.selected
  );
  const homeAddress = selectedLocation
    ? formatSavedLocation(selectedLocation)
    : "";

  useEffect(() => {
    if (isOnline) return;
    if (savedLocations.isLoading) return;
    if (
      selectedLocation?.latitude != null &&
      selectedLocation.longitude != null
    ) {
      if (
        coordinates?.latitude !== selectedLocation.latitude ||
        coordinates?.longitude !== selectedLocation.longitude
      ) {
        setCoordinates({
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        });
      }
      return;
    }
    if (coordinates) return;
    let active = true;

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return;
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (active)
          setCoordinates({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
      } catch {
        /* Doctor details remain available when location cannot be read. */
      }
    })();
    return () => {
      active = false;
    };
  }, [
    coordinates,
    isOnline,
    savedLocations.isLoading,
    selectedLocation?.latitude,
    selectedLocation?.longitude,
  ]);

  const practiceQuery = useQuery({
    queryKey: [
      "public-practice",
      initialPracticeId,
      serviceMode,
      isOnline ? null : coordinates?.latitude,
      isOnline ? null : coordinates?.longitude,
    ],
    queryFn: () =>
      listPublicDoctorPractices(
        supabase!,
        initialPracticeId,
        serviceMode,
        isOnline ? null : coordinates
      ),
    enabled: Boolean(supabase && initialPracticeId),
  });

  const locations = practiceQuery.data ?? [];
  const practiceId =
    locations.find((item) => item.practice_id === selectedPracticeId)
      ?.practice_id ??
    locations[0]?.practice_id ??
    initialPracticeId;
  useToastFeedback({
    error: practiceQuery.isError ? "Could not load this doctor." : "",
  });

  const servicePrefix =
    selectedConsultationType === "Online"
      ? "online-"
      : selectedConsultationType === "Home Visit"
        ? "home-"
        : "clinic-";

  const matchingServices =
    practiceQuery.data?.filter(
      (item) =>
        item.practice_id === practiceId &&
        item.service_code.startsWith(servicePrefix)
    ) ?? [];

  const slotsQuery = useQuery({
    queryKey: ["clinic-slots", practiceId, serviceMode],
    // Up to 288 five-minute options per day across a rolling 30-day horizon.
    queryFn: () =>
      listPracticeClinicSlots(
        supabase!,
        practiceId,
        undefined,
        10000,
        serviceMode
      ),
    enabled: Boolean(supabase && practiceId),
  });

  // In-person times the app cannot book (taken, walk-in only, full), shown
  // with a label. Shares the "clinic-slots" prefix, so every refresh of the
  // slots also refreshes these.
  const clinicBoardQuery = useQuery({
    queryKey: ["clinic-slots", practiceId, "board"],
    queryFn: () => listPracticeClinicTimeBoard(supabase!, practiceId),
    enabled: Boolean(supabase && practiceId && serviceMode === "clinic"),
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({
        queryKey: ["public-practice", initialPracticeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["practice-bio", practiceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["clinic-slots", practiceId],
      });
    }, [practiceId, initialPracticeId, queryClient])
  );

  const familyQuery = useQuery({
    queryKey: ["my-family-profiles"],
    queryFn: () => listMyFamilyProfiles(supabase!),
    enabled: Boolean(supabase && profile?.patient_id),
  });

  const patientDetail = useQuery({
    queryKey: ["my-patient-profile-detail"],
    queryFn: () => getMyPatientProfileDetail(supabase!),
    enabled: Boolean(supabase && profile?.patient_id),
  });

  const slots =
    slotsQuery.data?.filter(
      (item) =>
        item.practice_id === practiceId && item.service_mode === serviceMode
    ) ?? [];

  const displayedServiceId =
    slots[0]?.practice_service_id ??
    matchingServices.find((item) => item.practice_service_id === serviceId)
      ?.practice_service_id ??
    matchingServices[0]?.practice_service_id;

  const practice =
    matchingServices.find(
      (item) => item.practice_service_id === displayedServiceId
    ) ?? matchingServices[0];

  const bioQuery = useQuery({
    queryKey: ["practice-bio", practiceId, displayedServiceId],
    queryFn: () =>
      getPublicPracticeBio(supabase!, practiceId, displayedServiceId!),
    enabled: Boolean(supabase && practiceId && displayedServiceId),
  });

  const confirmationSlot = slots.find(
    (slot) => slot.window_id === confirmation?.windowId
  );
  const bookingOptions = useQuery({
    queryKey: [
      "appointment-booking-options",
      confirmationSlot?.window_id,
      confirmationSlot?.practice_service_id,
    ],
    queryFn: () =>
      getAppointmentBookingOptions(
        supabase!,
        confirmationSlot!.window_id,
        confirmationSlot!.practice_service_id
      ),
    enabled: Boolean(supabase && confirmationSlot),
    staleTime: 0,
  });
  useEffect(() => {
    setAcceptedPolicy("");
  }, [confirmation?.windowId, confirmation?.locationId]);

  /** Confirmation feedback and navigation once a booking (and payment) ends. */
  async function finishBooking(result: {
    appointment_id: string;
    requires_payment: boolean;
  }) {
    setBookingStage("finishing");
    const appointmentId = result.appointment_id;
    setOpeningConfirmation(false);
    setConfirmation(null);
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    ).catch(() => {});
    let confirmed = false;
    let reservationEnded = false;
    await listClinicAppointments(supabase!)
      .then((appointments) => {
        queryClient.setQueryData(["patient-clinic-appointments"], appointments);
        const booked = appointments.find((item) => item.id === appointmentId);
        reservationEnded = Boolean(
          booked?.confirmation_payment_pending &&
          ["rejected", "cancelled"].includes(booked.status)
        );
        if (booked?.status === "confirmed") {
          confirmed = true;
          showToast({
            title: "Appointment confirmed",
            message: `Your ${booked.visit_mode === "online" ? "online consultation" : booked.visit_mode === "home" ? "home visit" : "in-person (OPD) visit"} with ${booked.doctor_name} is confirmed.`,
            type: "success",
          });
        }
        if (
          booked?.status === "pending" &&
          !booked.confirmation_payment_pending
        ) {
          showToast({
            title: "Appointment requested",
            message: "Waiting for the doctor to accept it.",
            type: "info",
          });
        }
      })
      .catch(() =>
        showToast({
          title: "Check appointment status",
          message: "Open Appointments to check its current status.",
          type: "info",
        })
      );
    setIdempotencyKey(Crypto.randomUUID());
    void queryClient.invalidateQueries({ queryKey: ["clinic-slots"] });
    void queryClient.invalidateQueries({
      queryKey: ["patient-clinic-appointments"],
    });
    if (result.requires_payment && !confirmed) {
      showToast({
        title: reservationEnded
          ? "Reservation ended"
          : "Payment verification pending",
        message: reservationEnded
          ? "Your booking is not confirmed. Review payment status and request a refund for any received amount."
          : "Your reservation is not confirmed yet. Check its payment status.",
        type: "info",
      });
      router.push({
        pathname: "/appointment-details/[id]",
        params: { id: appointmentId },
      } as Href);
    } else router.push("/appointments" as Href);
    setBookingStage(null);
    reservation.current = null;
  }

  function notifyPaymentFailed() {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Error
    ).catch(() => {});
    showToast({
      title: "Payment failed",
      message:
        "Your payment didn't go through and no money was taken. Retry payment or cancel the booking.",
      type: "error",
    });
  }

  async function retryPayment() {
    const failure = paymentFailure;
    if (!failure || recoveringPayment) return;
    setRecoveringPayment("retry");
    setPaymentFailure(null);
    try {
      await payForAppointment(supabase!, {
        appointmentId: failure.appointmentId,
        policyVersion: failure.policyVersion,
        patientName: failure.patientName,
        reservation: true,
        releaseUnpaid: false,
        onStageChange: setBookingStage,
      });
      await finishBooking({
        appointment_id: failure.appointmentId,
        requires_payment: true,
      });
    } catch (cause) {
      setBookingStage(null);
      const message = cause instanceof Error ? cause.message : "";
      if (isRetryablePaymentFailure(cause)) {
        setPaymentFailure(failure);
        notifyPaymentFailed();
      } else if (message.includes("Reservation expired")) {
        showToast({
          title: "Reservation expired",
          message: "The held time was released. Choose a time to book again.",
          type: "error",
        });
        setIdempotencyKey(Crypto.randomUUID());
        void queryClient.invalidateQueries({ queryKey: ["clinic-slots"] });
      } else {
        showToast({
          title: "Check payment status",
          message: userErrorMessage(
            cause,
            "We could not confirm the payment. Check it in Appointment Details."
          ),
          type: "info",
        });
        router.push({
          pathname: "/appointment-details/[id]",
          params: { id: failure.appointmentId },
        } as Href);
      }
    } finally {
      setRecoveringPayment(null);
    }
  }

  async function cancelFailedBooking() {
    const failure = paymentFailure;
    if (!failure || recoveringPayment) return;
    setRecoveringPayment("cancel");
    try {
      await releaseAppointmentBooking(supabase!, failure.appointmentId);
      setPaymentFailure(null);
      setIdempotencyKey(Crypto.randomUUID());
      showToast({
        title: "Booking cancelled",
        message: "No payment was taken and the time is free again.",
        type: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["clinic-slots"] });
      void queryClient.invalidateQueries({
        queryKey: ["patient-clinic-appointments"],
      });
    } catch (cause) {
      showToast({
        title: "Could not cancel booking",
        message: userErrorMessage(cause, "Try again."),
        type: "error",
      });
    } finally {
      setRecoveringPayment(null);
    }
  }

  /** Close the prompt but keep the reservation; it can be paid from its details. */
  function dismissPaymentFailure() {
    const failure = paymentFailure;
    if (!failure || recoveringPayment) return;
    setPaymentFailure(null);
    setIdempotencyKey(Crypto.randomUUID());
    router.push({
      pathname: "/appointment-details/[id]",
      params: { id: failure.appointmentId },
    } as Href);
  }

  const book = useMutation({
    mutationFn: async ({
      patientId,
      windowId,
      reason,
    }: {
      patientId: string;
      windowId: string;
      reason: string;
    }) => {
      if (!profile?.patient_id) throw new Error("Patient profile is missing.");
      reservation.current = null;
      const selectedSlot = slots.find((slot) => slot.window_id === windowId);
      if (!selectedSlot)
        throw new Error("This visit type has no published slots.");
      const locationId =
        serviceMode === "home" ? confirmation?.locationId : undefined;
      if (
        serviceMode === "home" &&
        (!locationId ||
          !selectedLocation ||
          selectedLocation.id !== locationId ||
          selectedLocation.latitude == null ||
          selectedLocation.longitude == null ||
          !selectedLocation.building?.trim() ||
          !selectedLocation.city?.trim())
      )
        throw new Error(
          "Choose a saved visit address with a map pin, building and city before booking."
        );
      const options = bookingOptions.data;
      if (!options || bookingOptions.isError)
        throw new Error("Load the latest booking options before continuing.");
      const prepaid = options.requires_payment;
      if (prepaid && acceptedPolicy !== options.policy_version)
        throw new Error(
          "Accept the payment and refund terms before continuing."
        );
      setBookingStage(prepaid ? "preparing" : "booking");
      setConfirmation(null);
      setOpeningConfirmation(false);
      const openCheckout = prepaid ? await loadPaymentCheckout() : undefined;
      const result = await prepareAppointmentBooking(supabase!, {
        patientId,
        windowId,
        practiceServiceId: selectedSlot.practice_service_id,
        reason,
        idempotencyKey,
        paymentMethod: "online",
        ...(locationId ? { locationId } : {}),
      });
      reservation.current = result.appointment_id;
      if (result.requires_payment) {
        if (!prepaid)
          throw new Error(
            "Booking options changed. Review payment in Appointment Details to confirm this reservation."
          );
        setConfirmation(null);
        setOpeningConfirmation(false);
        const patientName =
          patientId === profile.patient_id
            ? (patientDetail.data?.full_name ??
              profile.display_name ??
              "Patient")
            : (familyQuery.data?.find((member) => member.id === patientId)
                ?.full_name ?? "Patient");
        pendingPayment.current = {
          appointmentId: result.appointment_id,
          policyVersion: options.policy_version,
          patientName,
          holdUntil: result.reservation_expires_at ?? null,
        };
        // Keep an unpaid reservation so the patient can retry or cancel.
        await payForAppointment(supabase!, {
          appointmentId: result.appointment_id,
          policyVersion: options.policy_version,
          patientName,
          reservation: true,
          releaseUnpaid: false,
          openCheckout,
          onStageChange: setBookingStage,
        });
        pendingPayment.current = null;
      }
      return result;
    },

    onSuccess: (result) => finishBooking(result),

    onError: (cause) => {
      setBookingStage(null);
      // Checkout failed with no money taken: keep the reservation and offer
      // Retry payment or Cancel booking instead of leaving the screen.
      if (isRetryablePaymentFailure(cause) && pendingPayment.current) {
        setPaymentFailure(pendingPayment.current);
        pendingPayment.current = null;
        reservation.current = null;
        setConfirmation(null);
        setOpeningConfirmation(false);
        notifyPaymentFailed();
        return;
      }
      pendingPayment.current = null;
      const message =
        cause &&
        typeof cause === "object" &&
        "message" in cause &&
        typeof cause.message === "string"
          ? cause.message
          : "";
      const feedback = message.includes("Daily booking limit reached")
        ? "This doctor has reached the daily booking limit. Please choose another day."
        : message.includes("already booked this time")
          ? "You already booked this time. Choose another slot."
          : message.includes("Slot is full") ||
              message.includes("Slot no longer available")
            ? "This slot is no longer available. Choose another time."
            : userErrorMessage(
                cause,
                "Could not request this appointment. Refresh the slots and try again."
              );
      showToast({ title: "Booking failed", message: feedback, type: "error" });
      if (message.includes("Reservation expired")) {
        setIdempotencyKey(Crypto.randomUUID());
        void queryClient.invalidateQueries({ queryKey: ["clinic-slots"] });
      }
      if (reservation.current) {
        const appointmentId = reservation.current;
        reservation.current = null;
        setConfirmation(null);
        setOpeningConfirmation(false);
        setIdempotencyKey(Crypto.randomUUID());
        void queryClient.invalidateQueries({ queryKey: ["clinic-slots"] });
        void queryClient.invalidateQueries({
          queryKey: ["patient-clinic-appointments"],
        });
        router.push({
          pathname: "/appointment-details/[id]",
          params: { id: appointmentId },
        } as Href);
      }
    },
  });

  return {
    bookingStage,
    paymentFailure,
    recoveringPayment,
    retryPayment,
    cancelFailedBooking,
    dismissPaymentFailure,
    bookingOptions,
    acceptedPolicy,
    setAcceptedPolicy,
    refresh: () => [
      practiceQuery.refetch({ throwOnError: true }),
      ...(practiceId
        ? [
            slotsQuery.refetch({ throwOnError: true }),
            ...(displayedServiceId
              ? [bioQuery.refetch({ throwOnError: true })]
              : []),
          ]
        : []),
      familyQuery.refetch({ throwOnError: true }),
    ],
    setSelectedPracticeId,
    profile,
    activeTab,
    requestedTab,
    switchingTab,
    setActiveTab,
    setOverrideConsultationType,
    selectedConsultationType,
    isOnline,
    serviceMode,
    homeAddress,
    setIdempotencyKey,
    confirmation,
    setConfirmation,
    openingConfirmation,
    setOpeningConfirmation,
    selectedLocation,
    homeLocationReady: Boolean(
      selectedLocation?.latitude != null &&
      selectedLocation.longitude != null &&
      selectedLocation.building?.trim() &&
      selectedLocation.city?.trim()
    ),
    practiceQuery,
    locations,
    practiceId,
    slotsQuery,
    familyQuery,
    slots,
    unavailableTimes:
      serviceMode === "clinic" ? (clinicBoardQuery.data ?? []) : [],
    practice,
    bioQuery,
    book,
  };
}
