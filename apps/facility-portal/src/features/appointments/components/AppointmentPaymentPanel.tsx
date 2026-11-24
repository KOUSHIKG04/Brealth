"use client";

import { userErrorMessage } from "@startup/contracts";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PortalCheckoutButton } from "./PortalCheckoutButton";
import { PaymentTermsDialog } from "./PaymentTermsDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@startup/web-ui/components/ui/dialog";
import {
  appointmentMoney,
  appointmentPaymentLabel,
  payoutStatusLabel,
  type ClinicAppointment,
} from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  PaymentSummary,
  PaymentStatusLabel,
} from "@startup/web-ui/components/payment-summary";
import {
  changePortalAppointmentBilling,
  loadPortalAppointmentBilling,
  loadPortalAppointmentPayouts,
} from "../server/paymentActions";

export function AppointmentPaymentPanel({
  item,
  checkoutAvailable = false,
}: {
  item: ClinicAppointment;
  checkoutAvailable?: boolean;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [financialAction, setFinancialAction] =
    useState<FinancialAction | null>(null);
  const [cashAccepted, setCashAccepted] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const payouts = useQuery({
    queryKey: ["appointment-billing", "payouts", item.id],
    queryFn: () => loadPortalAppointmentPayouts(item.id),
    refetchInterval: 30000,
  });
  const saved = useQuery({
    queryKey: ["appointment-billing", item.id],
    queryFn: () => loadPortalAppointmentBilling(item.id),
  });
  const mutation = useMutation({
    mutationFn: async (input: unknown) => {
      const result = await changePortalAppointmentBilling(input);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setNote("");
      setCashAccepted(false);
      setFinancialAction(null);
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["appointment-billing"] });
      await client.invalidateQueries({ queryKey: ["portal-transactions"] });
      router.refresh();
    },
  });
  const billing = saved.data;
  if (!billing)
    return saved.isLoading ? (
      <p role="status" className="text-muted-foreground text-sm">
        Loading payment details…
      </p>
    ) : saved.isError ? (
      <Button variant="outline" onClick={() => void saved.refetch()}>
        Retry payment status
      </Button>
    ) : null;
  if (!billing.enabled && !billing.charge_id) return null;
  const busy = mutation.isPending || checkoutBusy;
  const requestAction = (action: FinancialAction) => {
    setNote("");
    setCashAccepted(false);
    mutation.reset();
    setFinancialAction(action);
  };
  return (
    <PaymentSummary
      title="Payment"
      amount={appointmentMoney(billing.amount_minor)}
      amountLabel="Consultation fee"
      testMode={billing.mode === "test"}
    >
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt>Paid</dt>
        <dd className="text-right tabular-nums">
          {appointmentMoney(billing.captured_minor)}
        </dd>
        <dt>Refunded</dt>
        <dd className="text-right tabular-nums">
          {appointmentMoney(billing.refunded_minor)}
        </dd>
        <dt className="border-t pt-3 font-medium">Balance due</dt>
        <dd className="border-t pt-3 text-right font-semibold tabular-nums">
          {appointmentMoney(billing.due_minor)}
        </dd>
      </dl>
      <ClinicGatewayPayment
        billing={billing}
        item={item}
        checkoutAvailable={checkoutAvailable}
        setCheckoutBusy={setCheckoutBusy}
      />
      <CashPaymentConfirmation
        billing={billing}
        item={item}
        disabled={busy}
        mutate={requestAction}
      />
      <ProviderPayouts payouts={payouts} />
      <PaymentReceipts billing={billing} />
      <PaymentRefunds
        billing={billing}
        item={item}
        disabled={busy}
        mutate={requestAction}
      />
      <Dialog
        open={financialAction !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setFinancialAction(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogTitle>
            {financialAction?.action === "cash"
              ? "Record cash received"
              : "Confirm refund action"}
          </DialogTitle>
          <DialogDescription>
            {financialAction?.action === "cash"
              ? "Confirm receipt before this payment is recorded."
              : "The patient will see your decision note."}
          </DialogDescription>
          {financialAction?.action === "cash" ? (
            <>
              <p className="text-xl font-semibold tabular-nums">
                {appointmentMoney(billing.due_minor)}
              </p>
              <PaymentTermsDialog text={billing.policy_text} />
              <label className="flex items-start gap-2 text-sm leading-6">
                <input
                  type="checkbox"
                  className="accent-primary mt-1 size-4"
                  checked={cashAccepted}
                  disabled={busy}
                  onChange={(event) => setCashAccepted(event.target.checked)}
                />
                Cash has been received and the patient agrees to the payment and
                refund terms.
              </label>
            </>
          ) : null}
          <label className="block space-y-2 text-sm font-medium">
            {financialAction?.action === "cash"
              ? "Collection note"
              : "Decision note"}
            <textarea
              className="border-input bg-background min-h-24 w-full rounded-lg border px-3 py-2 font-normal"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              disabled={busy}
            />
          </label>
          {mutation.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {userErrorMessage(
                mutation.error,
                "Could not complete this payment action. Refresh and try again."
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setFinancialAction(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                note.trim().length < 2 ||
                (financialAction?.action === "cash" && !cashAccepted)
              }
              onClick={() => {
                if (financialAction)
                  mutation.mutate({ ...financialAction, note });
              }}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {mutation.isError && !financialAction ? (
        <p role="alert" className="text-destructive text-sm">
          {userErrorMessage(
            mutation.error,
            "Could not complete this payment action. Refresh and try again."
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            mutation.mutate({ action: "reconcile", appointmentId: item.id })
          }
        >
          Refresh payment status
        </Button>
        {billing.can_manage &&
        billing.refunds.some((refund) =>
          ["approved", "processing"].includes(refund.status)
        ) ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              mutation.mutate({
                action: "process_refunds",
                appointmentId: item.id,
              })
            }
          >
            Process or reconcile refunds
          </Button>
        ) : null}
      </div>
    </PaymentSummary>
  );
}

type Billing = NonNullable<
  Awaited<ReturnType<typeof loadPortalAppointmentBilling>>
>;

type FinancialAction = { appointmentId: string } & (
  | { action: "cash"; expectedDue: number }
  | {
      action: "decision";
      refundId: string;
      expectedVersion: number;
      approve: boolean;
    }
  | { action: "cash_refund"; refundId: string }
);

type BillingActionProps = {
  billing: Billing;
  item: ClinicAppointment;
  disabled: boolean;
  mutate: (input: FinancialAction) => void;
};

function ProviderPayouts({
  payouts,
}: {
  payouts: {
    isError: boolean;
    refetch: () => unknown;
    data?: Awaited<ReturnType<typeof loadPortalAppointmentPayouts>>;
  };
}) {
  return (
    <>
      {payouts.isError ? (
        <Button variant="outline" onClick={() => void payouts.refetch()}>
          Retry provider payment status
        </Button>
      ) : null}
      {payouts.data?.map((entry) => (
        <div key={entry.id} className="space-y-1 border-t pt-3 text-sm">
          <PaymentStatusLabel>{payoutStatusLabel(entry)}</PaymentStatusLabel>
          <h4 className="pt-2 font-medium">
            {entry.recipient_name ?? "Recipient not configured"}
          </h4>
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 py-2">
            <dt>Company fee</dt>
            <dd className="text-right tabular-nums">
              {entry.company_minor === null
                ? "Not configured"
                : appointmentMoney(entry.company_minor)}
            </dd>
            <dt>Provider share</dt>
            <dd className="text-right font-semibold tabular-nums">
              {entry.provider_minor === null
                ? "Not configured"
                : appointmentMoney(entry.provider_minor)}
            </dd>
          </dl>
          {entry.method !== "gateway" ? (
            <p>
              Collected directly · Company fee due{" "}
              {entry.cash_due_minor === null
                ? "Not configured"
                : appointmentMoney(entry.cash_due_minor)}
            </p>
          ) : null}
          {entry.transfer_id ? (
            <p className="break-all">Transfer {entry.transfer_id}</p>
          ) : null}
        </div>
      ))}
    </>
  );
}

function PaymentReceipts({ billing }: { billing: Billing }) {
  return (
    <>
      {billing.attempts.length ? (
        <details className="border-t pt-2">
          <summary className="focus-visible:outline-ring cursor-pointer py-2 text-sm font-medium focus-visible:outline-2">
            Receipts and payment attempts
          </summary>
          <div className="space-y-3 py-2">
            {billing.attempts.map((attempt) => (
              <div key={attempt.id} className="space-y-1 text-sm">
                <p>{appointmentPaymentLabel(attempt)}</p>
                {attempt.payment_id ? (
                  <p className="text-muted-foreground [overflow-wrap:anywhere] select-text">
                    {attempt.payment_id}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function PaymentRefunds({
  billing,
  item,
  disabled,
  mutate,
}: BillingActionProps) {
  return (
    <>
      {billing.refunds.map((refund) => (
        <div
          className="border-border space-y-3 border-t pt-4 text-sm"
          key={refund.id}
        >
          <PaymentStatusLabel>Refund {refund.status}</PaymentStatusLabel>
          <div className="flex flex-wrap justify-between gap-2 font-medium">
            <p>Refund amount</p>
            <p className="tabular-nums">
              {appointmentMoney(refund.amount_minor)}
            </p>
          </div>
          <p>
            Deduction {appointmentMoney(refund.deduction_minor)} ·{" "}
            {refund.reason}
          </p>
          {refund.decision_note ? <p>{refund.decision_note}</p> : null}
          {refund.references.map((reference) => (
            <p className="break-words" key={reference}>
              {reference}
            </p>
          ))}
          {billing.can_manage && refund.status === "requested" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={disabled}
                onClick={() =>
                  mutate({
                    action: "decision",
                    appointmentId: item.id,
                    refundId: refund.id,
                    expectedVersion: refund.row_version,
                    approve: true,
                  })
                }
              >
                Approve refund
              </Button>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  mutate({
                    action: "decision",
                    appointmentId: item.id,
                    refundId: refund.id,
                    expectedVersion: refund.row_version,
                    approve: false,
                  })
                }
              >
                Decline refund
              </Button>
            </div>
          ) : null}
          {billing.can_manage && refund.cash_pending ? (
            <Button
              disabled={disabled}
              onClick={() =>
                mutate({
                  action: "cash_refund",
                  appointmentId: item.id,
                  refundId: refund.id,
                })
              }
            >
              Confirm refund cash returned
            </Button>
          ) : null}
        </div>
      ))}
    </>
  );
}

function CashPaymentConfirmation({
  billing,
  item,
  disabled,
  mutate,
}: BillingActionProps) {
  return (
    <>
      {billing.can_manage &&
      billing.enabled &&
      item.visit_mode === "clinic" &&
      (item.status === "confirmed" ||
        (item.status === "pending" && item.confirmation_payment_pending)) &&
      billing.appointment_id === item.id &&
      billing.due_minor > 0 ? (
        <>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() =>
              mutate({
                action: "cash",
                appointmentId: item.id,
                expectedDue: billing.due_minor,
              })
            }
          >
            Record cash received
          </Button>
        </>
      ) : null}
    </>
  );
}

function ClinicGatewayPayment({
  billing,
  item,
  checkoutAvailable,
  setCheckoutBusy,
}: {
  billing: Billing;
  item: ClinicAppointment;
  checkoutAvailable: boolean;
  setCheckoutBusy: (busy: boolean) => void;
}) {
  return (
    <>
      {billing.can_manage && billing.can_pay && item.visit_mode === "clinic" ? (
        checkoutAvailable ? (
          <PortalCheckoutButton
            key={`${item.id}:${billing.policy_version}`}
            billing={billing}
            patientName={item.patient_name}
            onBusyChange={setCheckoutBusy}
          />
        ) : (
          <Button asChild>
            <Link href={`/transactions?appointment=${item.id}`}>
              Collect via Razorpay · {appointmentMoney(billing.due_minor)}
            </Link>
          </Button>
        )
      ) : null}
    </>
  );
}
