import type {
  PortalCheckout,
  RazorpayConstructor,
  RazorpayResponse,
} from "../types/razorpayCheckout";
import { colors } from "@startup/design-tokens";

let loading: Promise<RazorpayConstructor> | undefined;

export function loadPortalRazorpay(): Promise<RazorpayConstructor> {
  const browser = window as typeof window & { Razorpay?: RazorpayConstructor };
  if (browser.Razorpay) return Promise.resolve(browser.Razorpay);
  if (loading) return loading;
  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const timer = window.setTimeout(() => fail(), 15000);
    const clean = () => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };
    const fail = () => {
      clean();
      script.remove();
      reject(
        new Error(
          "Razorpay could not load. Check your connection and try again."
        )
      );
    };
    script.onerror = fail;
    script.onload = () => {
      clean();
      if (browser.Razorpay) resolve(browser.Razorpay);
      else fail();
    };
    document.head.appendChild(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export function openPortalRazorpay(
  Razorpay: RazorpayConstructor,
  checkout: PortalCheckout,
  patientName: string
): Promise<RazorpayResponse> {
  return new Promise((resolve, reject) => {
    const instance = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: "Clinic consultation",
      description: "Consultation fee",
      prefill: { name: patientName },
      theme: { color: colors.patient.primary },
      handler: (response) => {
        if (response.razorpay_order_id !== checkout.orderId)
          reject(
            new Error("Checkout order did not match. Refresh payment status.")
          );
        else resolve(response);
      },
      modal: {
        ondismiss: () =>
          reject(
            new Error(
              "Checkout closed. No payment has been confirmed; refresh its status before retrying."
            )
          ),
      },
    });
    instance.open();
  });
}
