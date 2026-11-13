import {
  appointmentBillingSchema,
  appointmentCheckoutSchema,
  appointmentPaymentCommandSchema,
  uuidSchema,
  portalAppointmentPaymentSummarySchema,
  portalTransactionCursorSchema,
  portalTransactionsSchema,
  portalWalkInPaymentPolicySchema,
  portalPaidWalkInBookingSchema,
  preparedAppointmentBookingSchema,
  type ClinicAppointment,
  type PortalTransactionCursor,
  type PortalPaidWalkInBookingInput,
} from "@startup/contracts";
import type { AppSupabaseClient } from "../client/createSupabaseClient";

export async function getPortalWalkInPaymentPolicy(
  client: AppSupabaseClient,
  practiceId: string
) {
  const { data, error } = await client.rpc(
    "get_portal_walk_in_payment_policy",
    { p_practice_id: uuidSchema.parse(practiceId) }
  );
  if (error) throw error;
  return portalWalkInPaymentPolicySchema.parse(data);
}

export async function preparePortalWalkInAppointment(
  client: AppSupabaseClient,
  input: PortalPaidWalkInBookingInput
) {
  const request = portalPaidWalkInBookingSchema.parse(input);
  const { data, error } = await client.rpc("prepare_portal_walk_in_booking", {
    p_input: request,
  });
  if (error) throw error;
  return preparedAppointmentBookingSchema.parse(data);
}

export async function attachPortalAppointmentPayments(
  client: AppSupabaseClient,
  appointments: ClinicAppointment[]
) {
  const summaries = new Map<
    string,
    ReturnType<typeof portalAppointmentPaymentSummarySchema.parse>
  >();
  for (let offset = 0; offset < appointments.length; offset += 100) {
    const { data, error } = await client.rpc(
      "get_portal_appointment_payment_summaries",
      {
        p_appointment_ids: appointments
          .slice(offset, offset + 100)
          .map((item) => item.id),
      }
    );
    if (error) throw error;
    for (const summary of portalAppointmentPaymentSummarySchema
      .array()
      .parse(data))
      summaries.set(summary.appointment_id, summary);
  }
  return appointments.map((item) => ({
    ...item,
    payment_summary: summaries.get(item.id),
  }));
}

export async function listPortalAppointmentTransactions(
  client: AppSupabaseClient,
  cursor?: PortalTransactionCursor
) {
  const parsed = cursor ? portalTransactionCursorSchema.parse(cursor) : null;
  const { data, error } = await client.rpc(
    "list_portal_appointment_transactions",
    {
      p_before_created_at: parsed?.created_at ?? null,
      p_before_id: parsed?.id ?? null,
    }
  );
  if (error) throw error;
  return portalTransactionsSchema.parse(data);
}

export async function getAppointmentBilling(
  client: AppSupabaseClient,
  appointmentId: string
) {
  const { data, error } = await client.rpc("get_appointment_billing", {
    p_appointment_id: uuidSchema.parse(appointmentId),
  });
  if (error?.code === "PGRST202") return null;
  if (error) throw error;
  return appointmentBillingSchema.parse(data);
}

export async function processAppointmentPayment(
  client: AppSupabaseClient,
  input: unknown
) {
  const body = appointmentPaymentCommandSchema.parse(input);
  if (body.action === "reconcile" || body.action === "process_refunds") {
    const billing = await getAppointmentBilling(client, body.appointmentId);
    if (!billing)
      throw new Error("Payments are not available for this appointment yet.");
    if (!billing.attempts.some((attempt) => attempt.method === "gateway"))
      return billing;
  }
  const { data, error } = await client.functions.invoke("process-payment", {
    body,
  });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(
      typeof details?.error === "string"
        ? details.error
        : "Payment service is unavailable. Refresh the payment status before retrying."
    );
  }
  if (body.action === "checkout") return appointmentCheckoutSchema.parse(data);
  return appointmentBillingSchema.parse(data);
}

export async function requestAppointmentRefund(
  client: AppSupabaseClient,
  input: {
    appointmentId: string;
    kind: "cancel" | "surplus";
    reason: string;
    expectedAmount: number;
    expectedDeduction: number;
  }
) {
  const { data, error } = await client.rpc("request_appointment_refund", {
    p_appointment_id: uuidSchema.parse(input.appointmentId),
    p_kind: input.kind,
    p_reason: input.reason,
    p_expected_amount: input.expectedAmount,
    p_expected_deduction: input.expectedDeduction,
  });
  if (error) throw error;
  return uuidSchema.parse(data);
}

export async function decideAppointmentRefund(
  client: AppSupabaseClient,
  input: {
    refundId: string;
    expectedVersion: number;
    approve: boolean;
    note: string;
  }
) {
  const { error } = await client.rpc("decide_appointment_refund", {
    p_refund_id: uuidSchema.parse(input.refundId),
    p_expected_version: input.expectedVersion,
    p_approve: input.approve,
    p_note: input.note,
  });
  if (error) throw error;
}

export async function recordAppointmentCash(
  client: AppSupabaseClient,
  appointmentId: string,
  expectedDue: number,
  note: string
) {
  const { error } = await client.rpc("record_appointment_cash", {
    p_appointment_id: uuidSchema.parse(appointmentId),
    p_expected_due: expectedDue,
    p_note: note,
  });
  if (error) throw error;
}

export async function confirmAppointmentCashRefund(
  client: AppSupabaseClient,
  refundId: string,
  note: string
) {
  const { error } = await client.rpc("confirm_appointment_cash_refund", {
    p_refund_id: uuidSchema.parse(refundId),
    p_note: note,
  });
  if (error) throw error;
}
