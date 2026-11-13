import {
  appointmentBillingSchema,
  appointmentCheckoutSchema,
} from "@startup/contracts";
import { executePortalAppointmentCheckout } from "../server/paymentActions";
import { loadPortalRazorpay, openPortalRazorpay } from "./razorpayCheckout";

export async function payPortalAppointment({
  appointmentId,
  policyVersion,
  patientName,
  onStage,
}: {
  appointmentId: string;
  policyVersion: string;
  patientName: string;
  onStage: (stage: string) => void;
}) {
  onStage("Preparing secure payment…");
  const Razorpay = await loadPortalRazorpay();
  const checkout = appointmentCheckoutSchema.parse(
    await executePortalAppointmentCheckout({
      action: "checkout",
      appointmentId,
      policyVersion,
    })
  );
  onStage("Complete payment in Razorpay…");
  const response = await openPortalRazorpay(Razorpay, checkout, patientName);
  onStage("Verifying payment…");
  return appointmentBillingSchema.parse(
    await executePortalAppointmentCheckout({
      action: "verify",
      appointmentId,
      attemptId: checkout.attemptId,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    })
  );
}
