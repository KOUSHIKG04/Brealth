import { expect } from "@playwright/test";
import { appointment, clinicDay, clinicSlot } from "./support/appointments";
import { test } from "./support/portal";

const transition = "transition_clinic_appointment";

test("accepts an upcoming appointment request directly from the dashboard", async ({
  page,
  portal,
}) => {
  const pending = {
    ...appointment,
    status: "pending",
    queue_state: null,
    starts_at: `${clinicDay(1)}T10:00:00+05:30`,
    ends_at: `${clinicDay(1)}T10:30:00+05:30`,
  };
  const confirmed = {
    ...pending,
    status: "confirmed",
    queue_state: "awaiting_arrival",
    row_version: "8",
  };
  await portal.signIn({
    responses: {
      list_care_appointments: { body: [pending] },
      [transition]: {
        body: appointment.id,
        after: { list_care_appointments: { body: [confirmed] } },
      },
    },
  });

  await expect(
    page.getByRole("heading", { name: appointment.patient_name })
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    page.getByText("No pending appointment requests.")
  ).toBeVisible();
  expect((await portal.calls(transition)).map(({ args }) => args)).toEqual([
    {
      p_appointment_id: appointment.id,
      p_expected_version: 7,
      p_action: "approve",
      p_note: null,
    },
  ]);
});

test("filters bookings by clinic day, status and patient and keeps payment holds separate", async ({
  page,
  portal,
}) => {
  const tomorrow = {
    ...appointment,
    id: "60000000-0000-4000-8000-000000000003",
    patient_name: "Nikhil Sharma",
    starts_at: `${clinicDay(1)}T10:00:00+05:30`,
    ends_at: `${clinicDay(1)}T10:30:00+05:30`,
    status: "pending",
    queue_state: null,
  };
  const hold = {
    ...appointment,
    id: "60000000-0000-4000-8000-000000000004",
    patient_name: "Leela Shah",
    confirmation_payment_pending: true,
    status: "pending",
    queue_state: null,
  };
  await portal.signIn({
    responses: {
      list_care_appointments: { body: [tomorrow, hold, appointment] },
    },
  });
  await page.goto("/appointments");

  const table = page.getByRole("region", { name: "Appointments table" });
  await expect(
    table.getByRole("button", { name: "Patient details for Asha Patel" })
  ).toBeVisible();
  await expect(table.getByText("Nikhil Sharma")).toHaveCount(0);
  await expect(table.getByText("Leela Shah")).toHaveCount(0);
  await table
    .getByRole("button", { name: "Patient details for Asha Patel" })
    .click();
  const details = page.getByRole("dialog", { name: "Patient details" });
  await expect(details.getByText("Routine follow-up")).toBeVisible();
  await details.getByRole("button", { name: "Close patient details" }).click();

  await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(table.getByText("Nikhil Sharma")).toBeVisible();
  await expect(table.getByText("Asha Patel")).toHaveCount(0);
  await page
    .getByLabel("Search patient, doctor...")
    .fill("no matching patient");
  await expect(table.getByText("No appointments to display")).toBeVisible();
  await page.getByLabel("Search patient, doctor...").clear();
  await page.getByLabel("Filter appointment status").selectOption("Confirmed");
  await expect(table.getByText("Nikhil Sharma")).toHaveCount(0);
  await page.getByLabel("Filter appointment status").selectOption("All");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: /Payment reservations/ }).click();
  await expect(table.getByText("Leela Shah")).toBeVisible();
  await expect(table.getByText("Asha Patel")).toHaveCount(0);
});

test("checks in an arrival and uses the latest row version to call the patient", async ({
  page,
  portal,
}) => {
  const waiting = {
    ...appointment,
    queue_state: "waiting",
    ticket_number: 2,
    row_version: "8",
  };
  const called = { ...waiting, queue_state: "called", row_version: "9" };
  await portal.signIn({
    responses: {
      list_care_appointments: { body: [appointment] },
      [transition]: {
        body: appointment.id,
        after: {
          list_care_appointments: { body: [waiting] },
          [transition]: {
            body: appointment.id,
            after: { list_care_appointments: { body: [called] } },
          },
        },
      },
    },
  });
  await page.goto("/appointments");

  const row = page
    .getByRole("row")
    .filter({ hasText: appointment.patient_name });
  await expect(row.getByRole("button", { name: "Call next" })).toHaveCount(0);
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("#2", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Call next" }).click();
  await expect(row.getByText("called", { exact: true })).toBeVisible();
  expect((await portal.calls(transition)).map(({ args }) => args)).toEqual([
    {
      p_appointment_id: appointment.id,
      p_expected_version: 7,
      p_action: "check_in",
      p_note: null,
    },
    {
      p_appointment_id: appointment.id,
      p_expected_version: 8,
      p_action: "call",
      p_note: null,
    },
  ]);
});

test("requires a hold reason and leaves the appointment waiting when staff cancel", async ({
  page,
  portal,
}) => {
  const waiting = { ...appointment, queue_state: "waiting", ticket_number: 4 };
  const held = { ...waiting, queue_state: "held", row_version: "8" };
  await portal.signIn({
    responses: {
      list_care_appointments: { body: [waiting] },
      [transition]: {
        body: appointment.id,
        after: { list_care_appointments: { body: [held] } },
      },
    },
  });
  await page.goto("/appointments");

  const row = page
    .getByRole("row")
    .filter({ hasText: appointment.patient_name });
  const dialog = page.getByRole("dialog");
  await row.getByRole("button", { name: "Hold", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Hold patient" })
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await portal.calls(transition)).toHaveLength(0);
  await row.getByRole("button", { name: "Hold", exact: true }).click();
  await dialog.getByLabel("Reason").fill("Patient stepped away");
  await dialog.getByRole("button", { name: "Hold patient" }).click();
  await expect(row.getByRole("button", { name: "Resume" })).toBeVisible();
  expect((await portal.calls(transition)).map(({ args }) => args)).toEqual([
    {
      p_appointment_id: appointment.id,
      p_expected_version: 7,
      p_action: "hold",
      p_note: "Patient stepped away",
    },
  ]);
});

test("requires a replacement date, time and reason before rescheduling", async ({
  page,
  portal,
}) => {
  const newDay = clinicDay(1);
  const replacement = {
    ...clinicSlot,
    starts_at: `${newDay}T14:00:00+05:30`,
    ends_at: `${newDay}T14:30:00+05:30`,
  };
  const manageable = {
    ...appointment,
    recovery: {
      outcome: null,
      rescheduled_from_id: null,
      rescheduled_to_id: null,
      reschedule_count: 0,
      online_grace_minutes: 15,
      reschedule_cutoff_minutes: 0,
      max_self_reschedules: 1,
      attendance_deadline: appointment.ends_at,
      can_manage: true,
      request: null,
    },
  };
  const reschedule = "reschedule_appointment";
  await portal.signIn({
    responses: {
      list_care_appointments: { body: [manageable] },
      list_appointment_reschedule_options: { body: [replacement] },
      get_appointment_billing: { body: null },
      list_payout_entries: { body: [] },
      [reschedule]: {
        body: { kind: "rescheduled", id: appointment.id },
        after: {
          list_care_appointments: {
            body: [
              {
                ...manageable,
                starts_at: replacement.starts_at,
                ends_at: replacement.ends_at,
                row_version: "8",
              },
            ],
          },
        },
      },
    },
  });
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Manage appointment" });
  await dialog.getByRole("button", { name: "Reschedule", exact: true }).click();
  const confirm = dialog.getByRole("button", { name: "Confirm decision" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("New date").selectOption(newDay);
  await dialog.getByLabel("New time").selectOption(replacement.window_id);
  await expect(confirm).toBeDisabled();
  await dialog
    .getByLabel("Reason / decision note")
    .fill("Patient requested the afternoon");
  await confirm.click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Appointments table" })
      .getByText(appointment.patient_name)
  ).toBeVisible();
  expect((await portal.calls(reschedule)).map(({ args }) => args)).toEqual([
    {
      p_appointment_id: appointment.id,
      p_expected_version: 7,
      p_target_window_id: replacement.window_id,
      p_reason: "Patient requested the afternoon",
      p_idempotency_key: expect.any(String),
    },
  ]);
});
