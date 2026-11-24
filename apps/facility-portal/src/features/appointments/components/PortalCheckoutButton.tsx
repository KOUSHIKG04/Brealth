"use client";

import { userErrorMessage } from "@startup/contracts";
import { reportError } from "@startup/data-access";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { appointmentMoney, type AppointmentBilling } from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import { toast } from "@startup/web-ui/components/ui/toast";
import { executePortalAppointmentCheckout } from "../server/paymentActions";
import { payPortalAppointment } from "../services/appointmentCheckout";
import { PaymentTermsDialog } from "./PaymentTermsDialog";

export function PortalCheckoutButton({
  billing,
  patientName,
  onBusyChange,
}: {
  billing: AppointmentBilling;
  patientName: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const client = useQueryClient();
  const router = useRouter();
  async function pay() {
    if (stage || !accepted) return;
    onBusyChange(true);
    setStage("Preparing secure payment…");
    try {
      const verified = await payPortalAppointment({
        appointmentId: billing.appointment_id,
        policyVersion: billing.policy_version,
        patientName,
        onStage: setStage,
      });
      toast.add({
        title:
          verified.due_minor === 0 && verified.captured_minor > 0
            ? "Payment received"
            : "Payment verification pending",
        type:
          verified.due_minor === 0 && verified.captured_minor > 0
            ? "success"
            : "info",
      });
    } catch (error) {
      setStage("Checking payment status…");
      await executePortalAppointmentCheckout({
        action: "reconcile",
        appointmentId: billing.appointment_id,
      }).catch((reconcileError) =>
        reportError(reconcileError, { source: "payment-reconcile" })
      );
      toast.add({
        title: "Check payment status",
        description: userErrorMessage(
          error,
          "Payment could not be verified. Refresh before retrying."
        ),
        type: "warning",
      });
    } finally {
      await client.invalidateQueries({ queryKey: ["appointment-billing"] });
      await client.invalidateQueries({ queryKey: ["portal-transactions"] });
      router.refresh();
      setStage(null);
      onBusyChange(false);
    }
  }
  return (
    <div className="space-y-3">
      <PaymentTermsDialog text={billing.policy_text} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary mt-1 size-4"
          checked={accepted}
          disabled={Boolean(stage)}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        The patient agrees to these payment and refund terms.
      </label>
      <Button disabled={!accepted || Boolean(stage)} onClick={() => void pay()}>
        {stage ?? `Pay via Razorpay · ${appointmentMoney(billing.due_minor)}`}
      </Button>
      {stage ? (
        <p role="status" className="text-muted-foreground text-sm">
          {stage}
        </p>
      ) : null}
    </div>
  );
}
