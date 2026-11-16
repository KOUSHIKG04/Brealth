const assert = require("node:assert/strict");

const { test } = require("node:test");

const fs = require("node:fs");

const ts = require("typescript");
// Compile only this app's TypeScript for Node's test runner, without adding a test runtime.

require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(result.outputText, filename);
};

const { initialSchedule } = require("../src/data/demo.ts");

const {
  endMinutes,
  minutes,
  scheduleError,
  previewSlots,
  slotStartTimes,
} = require("../src/features/schedule/utils/schedule.ts");

const {
  lookupPatient,
} = require("../src/features/patients/utils/patientLookup.ts");

const { useDoctorStore } = require("../src/stores/useDoctorStore.ts");

test("slots fit fully inside working hours and change with duration", () => {
  assert.equal(previewSlots(initialSchedule).length, 16);
  assert.equal(previewSlots(initialSchedule).at(-1), "04:30 PM");
  assert.deepEqual(
    previewSlots({
      ...initialSchedule,
      start: "12:00",
      end: "13:10",
      duration: 30,
    }),
    ["12:00 PM", "12:30 PM"]
  );
  assert.equal(previewSlots({ ...initialSchedule, duration: 60 }).length, 8);
});

test("invalid times, fees and no working days are rejected", () => {
  assert.ok(scheduleError({ ...initialSchedule, end: "08:00" }));
  assert.ok(scheduleError({ ...initialSchedule, start: "25:00" }));
  assert.ok(scheduleError({ ...initialSchedule, clinicFee: "-1" }));
  assert.ok(scheduleError({ ...initialSchedule, days: [] }));
  assert.equal(scheduleError(initialSchedule), undefined);
});

test("24:00 is an end-of-day boundary, never a start time", () => {
  assert.equal(endMinutes("24:00"), 1440);
  assert.ok(Number.isNaN(minutes("24:00")));
  assert.equal(
    scheduleError({
      ...initialSchedule,
      start: "23:00",
      end: "24:00",
      duration: 30,
    }),
    undefined
  );
  assert.deepEqual(slotStartTimes("23:00", "24:00", 30), ["23:00", "23:30"]);
  assert.deepEqual(slotStartTimes("24:00", "24:00", 30), []);
  assert.ok(scheduleError({ ...initialSchedule, end: "24:01" }));
});

test("QR lookup accepts supported IDs and refuses arbitrary payloads", () => {
  assert.equal(lookupPatient(" clz-0001 ").name, "Meera Sharma");
  assert.equal(lookupPatient('{"patientId":"CLZ-0002"}').name, "Akashadeepa");
  for (const invalid of [
    "{broken",
    '{"patientId":7}',
    '{"patientId":"unknown"}',
    "https://example.com",
    "unknown",
  ])
    assert.equal(lookupPatient(invalid), undefined);
});

test("notes and prescriptions remain isolated by visit, including the same patient", () => {
  useDoctorStore.getState().reset();
  useDoctorStore.getState().updateConsultation("clinic-meera", "CLZ-0001", {
    notes: "Clinic draft",
    signed: true,
  });
  const state = useDoctorStore.getState();
  assert.equal(state.consultations["clinic-meera"].notes, "Clinic draft");
  assert.equal(state.consultations["clinic-meera"].signed, true);
  assert.notEqual(state.consultations["home-meera"].notes, "Clinic draft");
  assert.equal(state.consultations["home-meera"].signed, false);
  assert.equal(state.consultations["online-akasha"].notes, "");
});

test("completion is idempotent and new lookup visits are initialized", () => {
  useDoctorStore.getState().reset();
  const state = useDoctorStore.getState();
  state.complete("lookup-CLZ-0002-clinic", "CLZ-0002");
  state.complete("lookup-CLZ-0002-clinic", "CLZ-0002");
  assert.equal(
    useDoctorStore
      .getState()
      .completedIds.filter((id) => id === "lookup-CLZ-0002-clinic").length,
    1
  );
  assert.equal(
    useDoctorStore.getState().consultations["lookup-CLZ-0002-clinic"].completed,
    true
  );
});

test("messages stay in their own conversation and reset clears session changes", () => {
  useDoctorStore.getState().reset();
  useDoctorStore.getState().sendMessage("home-meera", "On my way");
  assert.equal(
    useDoctorStore.getState().messages["home-meera"][0].text,
    "On my way"
  );
  assert.equal(useDoctorStore.getState().messages["online-akasha"], undefined);
  useDoctorStore
    .getState()
    .saveSchedule({ ...initialSchedule, homeVisits: true });
  useDoctorStore.getState().reset();
  assert.deepEqual(useDoctorStore.getState().messages, {});
  assert.equal(useDoctorStore.getState().schedule.homeVisits, false);
});

test("schedule overview summarises each service's status and hours", () => {
  const {
    serviceStatus,
    serviceSummary,
    workingDaysSummary,
  } = require("../src/features/schedule/utils/scheduleOverview.ts");
  assert.equal(workingDaysSummary([1, 2, 3, 4, 5, 6]), "Mon–Sat");
  assert.equal(workingDaysSummary([5, 1, 3]), "Mon, Wed, Fri");
  assert.equal(workingDaysSummary([1, 2, 3, 4, 5, 6, 7]), "Every day");
  const saved = {
    practice_id: "00000000-0000-4000-8000-000000000001",
    working_days: [1, 2, 3, 4, 5, 6],
    clinic_start: "09:00:00",
    clinic_end: "13:00:00",
    clinic_time_blocks: [
      { start: "09:00", end: "13:00" },
      { start: "17:00", end: "20:00" },
    ],
    published_modes: ["clinic", "home"],
    published_from: { clinic: "2026-11-01", home: "2026-12-01" },
    slot_minutes: 15,
    online_slot_minutes: 20,
    home_slot_minutes: 30,
    online_daily_limit: 10,
    walkin_daily_limit: 20,
    auto_accept: false,
    auto_accept_limit: 0,
    home_visits: true,
    home_radius_km: 5,
    online_fee_minor: null,
    clinic_fee_minor: 50000,
    home_fee_minor: null,
    row_version: "3",
  };
  assert.equal(
    serviceSummary(saved, "clinic"),
    "Mon–Sat · 9:00 AM–1:00 PM, 5:00 PM–8:00 PM · 15 min"
  );
  const options = { verified: true, today: "2026-11-16" };
  assert.deepEqual(serviceStatus(saved, "clinic", options), {
    tone: "live",
    label: "Published",
  });
  assert.equal(
    serviceStatus(saved, "home", options).label,
    "Starts 01-12-2026"
  );
  assert.equal(serviceStatus(saved, "online", options).label, "Not published");
  assert.equal(
    serviceStatus(saved, "online", { ...options, verified: false }).label,
    "Awaiting verification"
  );
  assert.equal(
    serviceStatus(saved, "clinic", {
      ...options,
      pendingRequest: { status: "pending" },
    }).label,
    "Awaiting approval"
  );
  assert.equal(
    serviceStatus({ ...saved, home_visits: false }, "home", options).label,
    "Not accepting visits"
  );
});

test("schedule review lists only what the doctor changed", () => {
  const {
    draftChanges,
  } = require("../src/features/schedule/utils/scheduleOverview.ts");
  const base = {
    ...initialSchedule,
    days: [0, 1, 2],
    timeBlocks: [{ start: "09:00", end: "13:00" }],
    autoAccept: false,
    autoLimit: 5,
  };
  assert.deepEqual(draftChanges(base, { ...base, days: [2, 1, 0] }), []);
  assert.deepEqual(draftChanges(base, { ...base, autoLimit: 0 }), []);
  assert.deepEqual(
    draftChanges(base, {
      ...base,
      timeBlocks: [
        { start: "09:00", end: "13:00" },
        { start: "17:00", end: "20:00" },
      ],
      duration: base.duration + 5,
    }),
    ["hours", "appointment length"]
  );
});
