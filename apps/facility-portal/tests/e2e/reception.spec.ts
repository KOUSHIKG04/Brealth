import { expect } from "@playwright/test";
import { appointment, clinicDay, clinicSlot } from "./support/appointments";
import { doctor, test } from "./support/portal";

const day = {
  local_day: clinicDay(),
  timezone: appointment.timezone,
  clinic_start: "09:00",
  clinic_end: "17:00",
  total_limit: 10,
  app_limit: 5,
  walkin_limit: 5,
  total_used: 6,
  app_used: 3,
  walkin_used: 3,
  app_remaining: 2,
  walkin_remaining: 2,
  slots: [clinicSlot],
};

const paymentPolicy = {
  enabled: true,
  mode: "test",
  policy_version: "v1",
  policy_text: "Consent before payment.",
  can_collect: true,
};

const book = "prepare_portal_next_walk_in_booking";

test("blocks reception booking when the walk-in allocation is full", async ({
  page,
  portal,
}) => {
  await portal.signIn({
    responses: {
      get_portal_clinic_day: {
        body: { ...day, walkin_used: 5, walkin_remaining: 0 },
      },
      get_portal_walk_in_payment_policy: { body: paymentPolicy },
    },
  });
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Add appointment" }).click();
  const dialog = page.getByRole("dialog", {
    name: "New in-person appointment",
  });
  await dialog.getByLabel("Doctor").selectOption(doctor.practice_id);
  await dialog.getByLabel("Patient name").fill("Walk-in Patient");
  await expect(
    dialog.getByText("No walk-in capacity remains today.")
  ).toBeVisible();
  // The fee is known up front because the walk-in's time is assigned.
  await expect(
    dialog.getByRole("button", { name: "Pay & book appointment" })
  ).toBeDisabled();
  expect(await portal.calls(book)).toHaveLength(0);
});

test("confirms a paid walk-in only after consent and cash acknowledgement", async ({
  page,
  portal,
}) => {
  const patient = "Walk-in Patient";
  const booked = {
    ...appointment,
    patient_name: patient,
    source: "reception_walk_in",
    queue_state: "waiting",
    ticket_number: 3,
  };
  await portal.signIn({
    responses: {
      get_portal_clinic_day: { body: day },
      get_portal_walk_in_payment_policy: { body: paymentPolicy },
      [book]: {
        body: {
          appointment_id: appointment.id,
          status: "confirmed",
          requires_payment: false,
          reservation_expires_at: null,
          starts_at: clinicSlot.starts_at,
        },
        after: { list_care_appointments: { body: [booked] } },
      },
    },
  });
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Add appointment" }).click();
  const dialog = page.getByRole("dialog", {
    name: "New in-person appointment",
  });
  await dialog.getByLabel("Doctor").selectOption(doctor.practice_id);
  // Reception does not choose a time: the walk-in gets the next free one.
  await expect(dialog.getByText("Next walk-in time")).toBeVisible();
  await dialog.getByLabel("Patient name").fill(patient);
  await dialog.getByLabel("Age (optional)").fill("36");
  await dialog.getByRole("radio", { name: "Cash received" }).check();
  const confirm = dialog.getByRole("button", { name: "Confirm cash & book" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /patient agrees/ }).check();
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /I have received/ }).check();
  await expect(
    dialog.getByRole("checkbox", { name: /check in to the queue now/ })
  ).toBeChecked();
  await confirm.click();

  await expect(page.getByText("Appointment booked")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: patient });
  await expect(row.getByText("#3", { exact: true })).toBeVisible();
  const calls = (await portal.calls(book)).map(({ args }) => args);
  expect(calls[0].p_input).not.toHaveProperty("windowId");
  expect(calls).toEqual([
    {
      p_input: expect.objectContaining({
        practiceId: doctor.practice_id,
        practiceServiceId: clinicSlot.practice_service_id,
        patientName: patient,
        patientAge: 36,
        paymentMethod: "cash",
        termsAccepted: true,
        cashReceived: true,
        policyVersion: "v1",
        checkIn: true,
        idempotencyKey: expect.any(String),
      }),
    },
  ]);
});
