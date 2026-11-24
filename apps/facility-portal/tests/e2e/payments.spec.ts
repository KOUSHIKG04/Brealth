import { expect } from "@playwright/test";
import { appointment } from "./support/appointments";
import { test } from "./support/portal";

const receipt = {
  id: "80000000-0000-4000-8000-000000000001",
  appointment_id: appointment.id,
  appointment_reference: appointment.public_code,
  patient_name: appointment.patient_name,
  doctor_name: appointment.doctor_name,
  facility_name: appointment.facility_name,
  created_at: "2026-01-01T00:00:00Z",
  method: "gateway",
  status: "captured",
  amount_minor: 50_000,
  refunded_minor: 10_000,
  mode: "test",
  order_id: "order_E2E01",
  payment_id: "pay_E2E01",
};

test("filters transaction history and displays the full payment reference and refund", async ({
  page,
  portal,
}) => {
  const cash = {
    ...receipt,
    id: "80000000-0000-4000-8000-000000000002",
    method: "cash",
    patient_name: "Ravi Singh",
    refunded_minor: 0,
    order_id: null,
    payment_id: null,
  };
  await portal.signIn({
    responses: {
      list_portal_appointment_transactions: {
        body: { items: [receipt, cash], next_cursor: null },
      },
    },
  });
  await page.goto("/transactions");
  const table = page.getByRole("table");
  const onlineRow = table
    .getByRole("row")
    .filter({ hasText: appointment.patient_name });
  await expect(onlineRow.getByText("Partially refunded")).toBeVisible();
  await expect(onlineRow.getByText(/Returned.*100\.00/)).toBeVisible();
  await onlineRow.getByText("References", { exact: true }).click();
  await expect(onlineRow.getByText(receipt.payment_id)).toBeVisible();

  await page.getByLabel("Payment method").selectOption("cash");
  await expect(onlineRow).toHaveCount(0);
  await expect(table.getByText("Ravi Singh")).toBeVisible();
  await page
    .getByLabel("Search loaded transactions")
    .fill("no matching transaction");
  await expect(table.getByText(/No transactions match/)).toBeVisible();
});

const billing = {
  appointment_id: appointment.id,
  charge_id: null,
  enabled: true,
  mode: "test",
  currency: "INR",
  policy_version: "v1",
  policy_text: "The clinic records payment after collecting cash.",
  amount_minor: 50_000,
  captured_minor: 0,
  refunded_minor: 0,
  reserved_minor: 0,
  deduction_minor: 0,
  due_minor: 50_000,
  credit_minor: 0,
  refund_amount_minor: 0,
  refund_deduction_minor: 0,
  surplus_minor: 0,
  can_pay: true,
  can_refund: false,
  can_manage: true,
  attempts: [],
  refunds: [],
};

test("requires cash receipt and a collection note before recording payment", async ({
  page,
  portal,
}) => {
  const record = "record_appointment_cash";
  const updated = {
    ...billing,
    captured_minor: 50_000,
    due_minor: 0,
    attempts: [
      { ...receipt, method: "cash", order_id: null, payment_id: null },
    ],
  };
  await portal.signIn({
    responses: {
      list_care_appointments: { body: [appointment] },
      get_appointment_billing: { body: billing },
      [record]: {
        body: null,
        after: { get_appointment_billing: { body: updated } },
      },
      list_payout_entries: { body: [] },
    },
  });
  await page.goto(`/transactions?appointment=${appointment.id}`);
  const panel = page.getByRole("region", {
    name: "Selected appointment payment",
  });
  await panel.getByRole("button", { name: "Record cash received" }).click();
  const dialog = page.getByRole("dialog", { name: "Record cash received" });
  const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /Cash has been received/ })
    .check();
  await expect(confirm).toBeDisabled();
  expect(await portal.calls(record)).toHaveLength(0);
  await dialog.getByLabel("Collection note").fill("Received at the front desk");
  await confirm.click();
  await panel
    .getByText("Receipts and payment attempts", { exact: true })
    .click();
  await expect(panel.getByText("Cash received", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Record cash received" })
  ).toHaveCount(0);
  expect((await portal.calls(record)).map(({ args }) => args)).toEqual([
    {
      p_appointment_id: appointment.id,
      p_expected_due: 50_000,
      p_note: "Received at the front desk",
    },
  ]);
});

test("records cash returned separately from approving a refund", async ({
  page,
  portal,
}) => {
  const refund = {
    id: "80000000-0000-4000-8000-000000000003",
    kind: "cancel",
    status: "approved",
    amount_minor: 50_000,
    deduction_minor: 0,
    reason: "Appointment cancelled",
    decision_note: "Approved for return",
    cash_pending: true,
    row_version: 4,
    references: [],
  };
  const charged = {
    ...billing,
    captured_minor: 50_000,
    due_minor: 0,
    refunds: [refund],
  };
  const returned = {
    ...charged,
    refunded_minor: 50_000,
    refunds: [{ ...refund, status: "refunded", cash_pending: false }],
  };
  const record = "confirm_appointment_cash_refund";
  await portal.signIn({
    responses: {
      list_care_appointments: { body: [appointment] },
      get_appointment_billing: { body: charged },
      list_payout_entries: { body: [] },
      [record]: {
        body: null,
        after: { get_appointment_billing: { body: returned } },
      },
    },
  });
  await page.goto(`/transactions?appointment=${appointment.id}`);
  const panel = page.getByRole("region", {
    name: "Selected appointment payment",
  });
  await expect(panel.getByText("Refund approved")).toBeVisible();
  await panel
    .getByRole("button", { name: "Confirm refund cash returned" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Confirm refund action" });
  const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByLabel("Decision note")
    .fill("Returned to the patient at reception");
  await confirm.click();
  await expect(panel.getByText("Refund refunded")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Confirm refund cash returned" })
  ).toHaveCount(0);
  expect((await portal.calls(record)).map(({ args }) => args)).toEqual([
    {
      p_refund_id: refund.id,
      p_note: "Returned to the patient at reception",
    },
  ]);
});
