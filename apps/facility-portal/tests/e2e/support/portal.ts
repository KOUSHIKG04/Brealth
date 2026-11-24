import { randomUUID } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";
import { fixtureBackendURL } from "./config";

export const facility = {
  facility_id: "10000000-0000-4000-8000-000000000001",
  facility_name: "Cedar Hospital",
  facility_kind: "hospital",
} as const;

export const doctor = {
  id: "20000000-0000-4000-8000-000000000001",
  practice_id: "20000000-0000-4000-8000-000000000002",
  booking_timezone: "Asia/Kolkata",
  name: "Dr. Mira Rao",
  clinzo_id: "CLINZO-DOC-9042",
  specialization: "Cardiology",
  phone: "",
  verified: true,
  present: true,
  on_leave: false,
};

export const bed = {
  inventory_id: "30000000-0000-4000-8000-000000000001",
  bed_type_id: "30000000-0000-4000-8000-000000000002",
  facility_id: facility.facility_id,
  bed_type_code: "general",
  bed_type_name: "General Ward",
  total: 10,
  occupied: 3,
  maintenance: 1,
  available: 6,
  observed_at: null,
  row_version: "7",
  configured: true,
};

export const verification = {
  id: "40000000-0000-4000-8000-000000000001",
  status: "verified",
  submitted_at: "2026-01-01T00:00:00Z",
  subject_type: "facility",
  subject_name: facility.facility_name,
  doctor: null,
  facility: null,
  driver: null,
  documents: [],
  history: [],
};

type Stub = { body: unknown; status?: number; after?: Record<string, Stub> };

type Scenario = {
  role?: "owner" | "facility_admin" | "receptionist";
  responses?: Record<string, Stub>;
};

type RpcCall = { name: string; args: Record<string, unknown> };

function responsesFor({ role = "owner", responses }: Scenario) {
  return {
    list_my_inventory_facilities: { body: [facility] },
    get_my_verification_case: { body: verification },
    list_my_facility_roles: {
      body: [{ ...facility, role, doctor_practice_ids: [doctor.practice_id] }],
    },
    list_facility_bed_inventory: { body: [bed] },
    list_my_facility_doctors: { body: [doctor] },
    list_my_facility_doctor_requests: { body: [] },
    list_facility_schedule_change_requests: { body: [] },
    list_my_clinic_sessions: { body: [] },
    list_my_practices: {
      body: [
        {
          practice_id: doctor.practice_id,
          doctor_name: doctor.name,
          facility_name: facility.facility_name,
          facility_kind: facility.facility_kind,
          verified: true,
          is_clinician: false,
        },
      ],
    },
    list_care_appointments: { body: [] },
    get_portal_appointment_payment_summaries: { body: [] },
    list_facility_team: { body: { my_rank: 4, members: [], invitations: [] } },
    list_portal_appointment_transactions: {
      body: { items: [], next_cursor: null },
    },
    ...responses,
  } satisfies Record<string, Stub>;
}

type Portal = {
  configure: (scenario?: Scenario) => Promise<void>;
  submitSignIn: (password?: string) => Promise<void>;
  signIn: (scenario?: Scenario) => Promise<void>;
  calls: (name: string) => Promise<RpcCall[]>;
};

async function submitSignIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export const test = base.extend<{ portal: Portal }>({
  portal: async ({ page, request }, provide) => {
    const id = randomUUID();
    const email = `staff-${id}@example.com`;
    const url = `${fixtureBackendURL}/fixtures/${id}`;
    const configure = async (scenario: Scenario = {}) => {
      await expect(
        await request.post(url, {
          data: { email, responses: responsesFor(scenario) },
        })
      ).toBeOK();
    };

    try {
      await provide({
        configure,
        submitSignIn: (password = "fixture-password") =>
          submitSignIn(page, email, password),
        signIn: async (scenario) => {
          await configure(scenario);
          await page.goto("/login");
          await submitSignIn(page, email, "fixture-password");
          await expect(page).toHaveURL("/dashboard", { timeout: 20_000 });
        },
        calls: async (name) => {
          const response = await request.get(url);
          await expect(response).toBeOK();
          const calls: RpcCall[] = await response.json();
          return calls.filter((call) => call.name === name);
        },
      });
    } finally {
      await request.delete(url);
    }
  },
});
