import type { appointmentCheckoutSchema } from "@startup/contracts";
import type { z } from "zod";

export type PortalCheckout = z.infer<typeof appointmentCheckoutSchema>;

export type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type RazorpayConstructor = new (options: {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
}) => { open: () => void };
