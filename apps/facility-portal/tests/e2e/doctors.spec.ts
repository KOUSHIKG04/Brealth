import { expect } from "@playwright/test";
import { appointment, clinicDay } from "./support/appointments";
import { doctor, facility, test } from "./support/portal";

const requestId = "70000000-0000-4000-8000-000000000001";

const previewToken = "0123456789abcdef0123456789abcdef";

test("filters the doctor directory and accepts an association from Notifications", async ({
  page,
  portal,
}) => {
  const association = {
    ...facility,
    id: requestId,
    doctor_id: doctor.id,
    doctor_name: "Dr. Saira Das",
    doctor_code: "CLINZO-DOC-1049",
    credential_status: "verified",
    status: "pending",
    initiated_by: "doctor",
    created_at: "2026-01-01T00:00:00Z",
    rejection_reason: null,
  };
  await portal.signIn({
    responses: {
      list_my_facility_doctor_requests: { body: [association] },
      decide_my_facility_doctor_request: {
        body: null,
        after: { list_my_facility_doctor_requests: { body: [] } },
      },
    },
  });
  await page.goto("/doctor-management");
  const directory = page.getByRole("row").filter({ hasText: doctor.name });
  await expect(directory).toContainText(doctor.specialization);
  const search = page.getByLabel("Search by doctor or ID...");
  await search.fill("no matching doctor");
  await expect(directory).toHaveCount(0);
  await search.fill("9042");
  await expect(directory).toBeVisible();
  await page.getByRole("tab", { name: "Notifications" }).click();
  await expect(page).toHaveURL("/doctor-management?tab=notifications");
  await expect(
    page.getByRole("heading", { name: "Doctor association requests" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Decline" })).toBeDisabled();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByText("No pending requests.")).toBeVisible();
  expect(
    (await portal.calls("decide_my_facility_doctor_request")).map(
      ({ args }) => args
    )
  ).toEqual([{ p_request_id: requestId, p_approve: true, p_reason: null }]);
});

test("shows published shifts only on the selected schedule date", async ({
  page,
  portal,
}) => {
  const shift = {
    id: requestId,
    service_mode: "clinic",
    starts_at: `${clinicDay(1)}T09:00:00+05:30`,
    ends_at: `${clinicDay(1)}T11:00:00+05:30`,
    timezone: "Asia/Kolkata",
    hard_capacity: 10,
    auto_confirm_limit: null,
    state: "published",
    row_version: "1",
  };
  await portal.signIn({
    responses: { list_my_clinic_sessions: { body: [shift] } },
  });
  await page.goto("/doctor-schedules");
  await expect(page.getByText("0 published shifts")).toBeVisible();
  await page.getByRole("button", { name: "Next schedule day" }).click();
  await expect(page.getByLabel("Schedule date")).toHaveValue(clinicDay(1));
  await expect(
    page.getByText("1 published shift", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous schedule day" }).click();
  await expect(page.getByText("0 published shifts")).toBeVisible();
});

test("previews schedule conflicts and requires a patient message before publishing", async ({
  page,
  portal,
}) => {
  const request = {
    ...facility,
    id: requestId,
    practice_id: doctor.practice_id,
    doctor_name: doctor.name,
    kind: "schedule",
    service_mode: "clinic",
    payload: {},
    effective_from: clinicDay(1),
    base_version: "7",
    current_version: "7",
    note: "Extending clinic hours",
    status: "pending",
    decision_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    decided_at: null,
  };
  const conflict = {
    rule_id: requestId,
    practice_id: doctor.practice_id,
    facility_name: facility.facility_name,
    mode: "online",
    days: [1],
    start: "10:00",
    end: "12:00",
    travel_buffer_minutes: 0,
    effective_from: clinicDay(1),
    effective_until: null,
    remaining: [{ days: [1], start: "11:00", end: "12:00" }],
    booked_count: 1,
    replaceable: false,
    reason: null,
    bookings: [
      {
        id: appointment.id,
        booking_code: appointment.public_code,
        patient_name: appointment.patient_name,
        starts_at: appointment.starts_at,
        ends_at: appointment.ends_at,
        timezone: appointment.timezone,
        status: "confirmed",
        payment_hold: false,
        row_version: "7",
      },
    ],
  };
  const approve = "approve_schedule_change_request";
  await portal.signIn({
    responses: {
      list_facility_schedule_change_requests: { body: [request] },
      preview_schedule_change_request: {
        body: {
          status: "pending",
          preview: {
            token: previewToken,
            effective_from: clinicDay(1),
            can_replace: false,
            can_request: true,
            conflicts: [conflict],
          },
        },
      },
      [approve]: {
        body: { status: "approved" },
        after: { list_facility_schedule_change_requests: { body: [] } },
      },
    },
  });
  await page.goto("/doctor-schedules");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "This time is already scheduled",
  });
  await expect(dialog.getByText("Affected bookings (1)")).toBeVisible();
  await expect(dialog.getByText(/Asha Patel/)).toBeVisible();
  expect(await portal.calls(approve)).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "Replace overlapping availability" })
    .click();
  const publish = dialog.getByRole("button", {
    name: "Publish and send rescheduling requests",
  });
  await expect(publish).toBeDisabled();
  await dialog
    .getByLabel("Reason shown to patients")
    .fill("The clinic extended its in-person hours.");
  await publish.click();
  await expect(
    page.getByText("Request approved", { exact: true })
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  expect((await portal.calls(approve)).map(({ args }) => args)).toEqual([
    {
      p_request_id: requestId,
      p_preview_token: previewToken,
      p_strategy: "trim",
      p_patient_reason: "The clinic extended its in-person hours.",
    },
  ]);
});

test("caps app slots and walk-ins by the shared time slots and publishes a versioned schedule with its preview", async ({
  page,
  portal,
}) => {
  const settings = {
    practice_id: doctor.practice_id,
    row_version: "7",
    working_days: [1, 2, 3, 4, 5, 6, 7],
    clinic_start: "09:00",
    clinic_end: "17:00",
    slot_minutes: 30,
    online_slot_minutes: 30,
    home_slot_minutes: 60,
    online_daily_limit: 8,
    walkin_daily_limit: 10,
    clinic_app_daily_limit: 5,
    clinic_walkin_daily_limit: 5,
    auto_accept: false,
    auto_accept_limit: 0,
    home_visits: false,
    home_radius_km: null,
    clinic_fee_minor: 50_000,
    online_fee_minor: null,
    home_fee_minor: null,
    published_modes: ["clinic"],
  };
  const preview = "preview_doctor_schedule_change";
  const publish = "publish_previewed_doctor_schedule";
  const saved = { ...settings, clinic_fee_minor: 55_000, row_version: "8" };
  await portal.signIn({
    responses: {
      get_my_schedule_preferences: { body: settings },
      list_my_schedule_adjustments: { body: [] },
      list_my_schedule_busy_blocks: { body: [] },
      list_clinic_unavailability: { body: [] },
      [preview]: {
        body: {
          token: previewToken,
          effective_from: clinicDay(),
          conflicts: [],
          can_replace: true,
        },
      },
      [publish]: {
        body: { settings: saved, slot_count: 16, horizon_days: 30 },
        after: { get_my_schedule_preferences: { body: saved } },
      },
    },
  });
  await page.goto(`/doctor-schedules/${doctor.practice_id}/clinic`);
  await page.getByRole("button", { name: "Got it" }).click();
  // 09:00–17:00 in 30-minute slots: app bookings can use at most 16 times.
  await expect(page.getByText("Time slots a day: 16")).toBeVisible();
  const appSlots = page.getByLabel("App booking slots in slots");
  await appSlots.fill("40");
  await appSlots.blur();
  await expect(appSlots).toHaveValue("16");
  await expect(
    page.getByRole("button", { name: "Increase App booking slots" })
  ).toBeDisabled();
  await appSlots.fill("6");
  await appSlots.blur();
  // Walk-ins share the time slots: at most 16 - 6 = 10.
  const walkIns = page.getByLabel("Walk-in limit in walk-ins");
  await walkIns.fill("40");
  await walkIns.blur();
  await expect(walkIns).toHaveValue("10");
  await expect(
    page.getByRole("button", { name: "Increase Walk-in limit" })
  ).toBeDisabled();
  const publishButton = page.getByRole("button", { name: "Publish Schedule" });
  const fee = page.getByLabel("Clinic Visit charge in rupees");
  await fee.fill("550");
  await publishButton.click();
  await expect(
    page.getByText("Schedule published", { exact: true })
  ).toBeVisible();
  const previewCalls = await portal.calls(preview);
  expect(previewCalls.map(({ args }) => args)).toEqual([
    expect.objectContaining({
      p_practice_id: doctor.practice_id,
      p_mode: "clinic",
      p_expected_version: 7,
      p_effective_from: clinicDay(),
      p_settings: expect.objectContaining({
        clinic_fee_minor: 55_000,
        clinic_app_daily_limit: 6,
        clinic_walkin_daily_limit: 10,
        walkin_daily_limit: 16,
      }),
    }),
  ]);
  expect((await portal.calls(publish)).map(({ args }) => args)).toEqual([
    { ...previewCalls[0].args, p_preview_token: previewToken },
  ]);
  await page.reload();
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(fee).toHaveValue("550");
});
