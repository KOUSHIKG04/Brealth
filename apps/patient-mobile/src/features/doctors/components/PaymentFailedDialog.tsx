import { AppDialog, Button } from "@startup/mobile-ui";

/**
 * Shown when checkout fails or is closed and no money was taken. The time
 * stays reserved until it expires, so the patient can pay again or cancel.
 */
export function PaymentFailedDialog({
  failure,
  recovering,
  timeZone,
  onRetry,
  onCancel,
  onClose,
}: {
  failure: { holdUntil: string | null } | null;
  recovering: "retry" | "cancel" | null;
  timeZone?: string;
  onRetry: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const holdUntil = failure?.holdUntil
    ? new Date(failure.holdUntil).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      })
    : null;
  return (
    <AppDialog
      theme="patient"
      visible={Boolean(failure)}
      title="Payment failed"
      description={`Your payment didn't go through and no money was taken. ${
        holdUntil
          ? `We're holding this time for you until ${holdUntil}.`
          : "We're holding this time for a few minutes."
      } Retry the payment or cancel the booking.`}
      busy={recovering !== null}
      onClose={onClose}
      actions={
        <>
          <Button
            theme="patient"
            label="Retry payment"
            loading={recovering === "retry"}
            disabled={recovering !== null}
            onPress={onRetry}
          />
          <Button
            theme="patient"
            variant="outline"
            label="Cancel booking"
            loading={recovering === "cancel"}
            disabled={recovering !== null}
            onPress={onCancel}
          />
        </>
      }
    />
  );
}
