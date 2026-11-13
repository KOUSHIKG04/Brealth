"use client";

import { userErrorMessage } from "@startup/contracts";
import { reportError } from "@startup/data-access";
import type { NewAppointmentDialogProps } from "../types/newAppointmentDialog";
import type { Practice, Slot } from "../types/newAppointmentDialog";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@startup/web-ui/components/ui/toast";
import {
  createPortalWalkInAppointment,
  loadPortalWalkInPractices,
  loadPortalWalkInSlots,
  finishPortalWalkInBooking,
} from "../server/actions";
import { executePortalAppointmentCheckout } from "../server/paymentActions";
import { payPortalAppointment } from "../services/appointmentCheckout";
import { useQueryClient } from "@tanstack/react-query";

export function useNewAppointment({ onCreated }: NewAppointmentDialogProps) {
  const router = useRouter();
  const client = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [practices, setPractices] = React.useState<Practice[]>([]);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [clinicDay, setClinicDay] = React.useState<Awaited<
    ReturnType<typeof loadPortalWalkInSlots>
  > | null>(null);
  const [patientAge, setPatientAge] = React.useState("");
  const [patientGender, setPatientGender] = React.useState("");
  const [checkIn, setCheckIn] = React.useState(true);
  const [practiceId, setPracticeId] = React.useState("");
  const [windowId, setWindowId] = React.useState("");
  const [patientName, setPatientName] = React.useState("");
  const [patientPhone, setPatientPhone] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [requestKey, setRequestKey] = React.useState(() => crypto.randomUUID());
  const slotsRequest = React.useRef(0);
  const [paymentMethod, setPaymentMethod] = React.useState<"gateway" | "cash">(
    "gateway"
  );
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [cashReceived, setCashReceived] = React.useState(false);
  const [paymentStage, setPaymentStage] = React.useState<string | null>(null);
  const checkout = React.useRef<{
    appointmentId: string;
    patientName: string;
    policyVersion: string;
    checkIn: boolean;
  } | null>(null);
  React.useEffect(
    () => () => {
      checkout.current = null;
    },
    []
  );

  async function refreshPayments() {
    await client.invalidateQueries({ queryKey: ["appointment-billing"] });
    await client.invalidateQueries({ queryKey: ["portal-transactions"] });
    router.refresh();
  }

  function onDialogClosed(isOpen: boolean) {
    const next = checkout.current;
    if (isOpen || !next) return;
    checkout.current = null;
    startTransition(async () => {
      try {
        const billing = await payPortalAppointment({
          ...next,
          onStage: setPaymentStage,
        });
        if (billing.due_minor !== 0 || billing.captured_minor <= 0)
          throw new Error(
            "Payment is still being verified. Check its status before retrying."
          );
        const arrival = await finishPortalWalkInBooking(
          next.appointmentId,
          next.checkIn
        );
        toast.add({
          title: "Appointment booked",
          description:
            next.checkIn && !arrival.checkedIn
              ? "Payment received. Review the patient's arrival at reception."
              : "Payment received and appointment confirmed.",
          type: "success",
        });
        onCreated?.(next.appointmentId);
        router.push("/appointments");
      } catch (error) {
        setPaymentStage("Checking payment status…");
        await executePortalAppointmentCheckout({
          action: "reconcile",
          appointmentId: next.appointmentId,
        }).catch((reconcileError) =>
          reportError(reconcileError, { source: "payment-reconcile" })
        );
        toast.add({
          title: "Check booking payment",
          description: userErrorMessage(
            error,
            "The appointment is awaiting verified payment. You can resume payment from this reservation."
          ),
          type: "warning",
        });
        router.push(`/transactions?appointment=${next.appointmentId}`);
      } finally {
        setPaymentStage(null);
        await refreshPayments();
      }
    });
  }

  async function showDialog() {
    if (paymentStage) return;
    setOpen(true);
    setLoading(true);
    try {
      const available = await loadPortalWalkInPractices();
      setPractices(available);
    } catch {
      toast.add({
        title: "Could not load doctors",
        description: "Check your connection and try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function choosePractice(id: string, localDay?: string) {
    setPracticeId(id);
    setWindowId("");
    setSlots([]);
    setClinicDay(null);
    setTermsAccepted(false);
    setCashReceived(false);
    const request = ++slotsRequest.current;
    if (!id) {
      setLoadingSlots(false);
      return;
    }
    setLoadingSlots(true);
    try {
      const available = await loadPortalWalkInSlots(id, localDay);
      if (request === slotsRequest.current) {
        setSlots(available.slots);
        setClinicDay(available);
      }
    } catch {
      if (request === slotsRequest.current)
        toast.add({
          title: "Could not load clinic times",
          description: "Try another doctor or reopen this form.",
          type: "error",
        });
    } finally {
      if (request === slotsRequest.current) setLoadingSlots(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slot = slots.find((item) => item.windowId === windowId);
    if (
      !slot ||
      slot.state !== "open" ||
      !clinicDay ||
      clinicDay.walkin_remaining < 1 ||
      !practiceId ||
      patientName.trim().length < 2 ||
      (Number(slot.feeMinor) > 0 && !termsAccepted) ||
      !clinicDay.payment ||
      (Number(slot.feeMinor) > 0 && paymentMethod === "cash" && !cashReceived)
    )
      return;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: clinicDay.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const checkInNow = checkIn && clinicDay.local_day === today;
    startTransition(async () => {
      try {
        const result = await createPortalWalkInAppointment({
          practiceId,
          windowId: slot.windowId,
          practiceServiceId: slot.practiceServiceId,
          patientName: patientName.trim(),
          patientAge: patientAge === "" ? null : Number(patientAge),
          patientGender: patientGender || null,
          checkIn: checkInNow,
          patientPhone: patientPhone.trim(),
          reason: reason.trim(),
          idempotencyKey: requestKey,
          paymentMethod,
          termsAccepted,
          policyVersion: clinicDay.payment.policy_version,
          cashReceived,
        });
        if (result.error) {
          toast.add({
            title: "Could not create appointment",
            description: result.error,
            type: "error",
          });
          await choosePractice(practiceId, clinicDay.local_day);
          return;
        }
        if (!result.appointmentId)
          throw new Error("The booking service returned no reservation.");
        if (result.requiresPayment) {
          checkout.current = {
            appointmentId: result.appointmentId,
            patientName: patientName.trim(),
            policyVersion: clinicDay.payment.policy_version,
            checkIn: checkInNow,
          };
          setPaymentStage("Opening secure payment…");
        } else {
          if (result.status !== "confirmed")
            throw new Error(
              "The appointment has not been confirmed. Refresh its payment status."
            );
          toast.add({
            title: "Appointment booked",
            description:
              paymentMethod === "cash"
                ? "Cash received and appointment confirmed."
                : "Appointment confirmed.",
            type: "success",
          });
        }
        setOpen(false);
        setPatientName("");
        setPatientAge("");
        setPatientGender("");
        setCheckIn(true);
        setPatientPhone("");
        setReason("");
        setPracticeId("");
        setWindowId("");
        setSlots([]);
        setClinicDay(null);
        setTermsAccepted(false);
        setCashReceived(false);
        setRequestKey(crypto.randomUUID());
        if (!result.requiresPayment) {
          onCreated?.(result.appointmentId);
          router.push("/appointments");
          await refreshPayments();
        }
      } catch {
        toast.add({
          title: "Could not create appointment",
          description: "Check your connection and try again.",
          type: "error",
        });
      }
    });
  }

  return {
    open,
    setOpen,
    loading,
    loadingSlots,
    pending,
    practices,
    slots,
    practiceId,
    windowId,
    setWindowId,
    clinicDay,
    patientAge,
    setPatientAge,
    patientGender,
    setPatientGender,
    checkIn,
    setCheckIn,
    patientName,
    setPatientName,
    patientPhone,
    setPatientPhone,
    reason,
    setReason,
    showDialog,
    choosePractice,
    submit,
    paymentMethod,
    setPaymentMethod,
    termsAccepted,
    setTermsAccepted,
    cashReceived,
    setCashReceived,
    paymentStage,
    onDialogClosed,
  };
}
