import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

test("schedule drawer stays on the directory, navigates services locally and blocks dismissal while saving", () => {
  const state = [];
  let cursor = 0;
  let saving = false;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { FacilityDoctorScheduleDrawer } = load(
    "../../src/features/doctors/components/FacilityDoctorScheduleDrawer.tsx",
    {
      react: {
        useTransition: () => [saving, () => {}],
        useState: (initial) => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [
            state[index],
            (value) => {
              state[index] = value;
            },
          ];
        },
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "lucide-react": {
        ArrowLeft: "ArrowLeft",
        CalendarDays: "CalendarDays",
        X: "X",
      },
      "@startup/web-ui/components/ui/button": { Button: "Button" },
      "@startup/web-ui/components/ui/drawer": Object.fromEntries(
        [
          "Drawer",
          "DrawerTrigger",
          "DrawerContent",
          "DrawerHeader",
          "DrawerTitle",
          "DrawerDescription",
          "DrawerClose",
        ].map((name) => [name, name])
      ),
      "../screens/FacilityDoctorScheduleScreen": {
        FacilityDoctorScheduleScreen: "ScheduleScreen",
      },
    }
  );
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const render = () => {
    cursor = 0;
    return flatten(
      FacilityDoctorScheduleDrawer({
        practiceId: "practice",
        doctorName: "Doctor",
      })
    );
  };
  let nodes = render();
  assert.equal(nodes[0].props.swipeDirection, "right");
  assert.equal(
    nodes.find((node) => node.type === "DrawerTrigger").props.render.props.href,
    undefined
  );
  nodes[0].props.onOpenChange(true, { cancel() {} });
  nodes = render();
  let editor = nodes.find((node) => node.type === "ScheduleScreen");
  assert.equal(editor.props.practiceId, "practice");
  editor.props.onSelectMode("online");
  nodes = render();
  editor = nodes.find((node) => node.type === "ScheduleScreen");
  assert.equal(editor.props.mode, "online");
  saving = true;
  let cancelled = false;
  render()[0].props.onOpenChange(false, {
    cancel() {
      cancelled = true;
    },
  });
  assert.equal(cancelled, true);
  assert.equal(state[0], true);
  assert.equal(
    render().find((node) => node.type === "DrawerClose").props.disabled,
    true
  );
  saving = false;
  nodes = render();
  nodes
    .find(
      (node) =>
        node.type === "Button" && node.props.children?.includes("All services")
    )
    .props.onClick();
  assert.equal(
    render().find((node) => node.type === "ScheduleScreen").props.mode,
    undefined
  );
  render()[0].props.onOpenChange(false, { cancel() {} });
  assert.equal(
    render().some((node) => node.type === "ScheduleScreen"),
    false
  );
});

test("embedded schedule service selection uses buttons and forwards the drawer callbacks", () => {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { FacilityDoctorScheduleScreen } = load(
    "../../src/features/doctors/screens/FacilityDoctorScheduleScreen.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/link": { default: "Link" },
      "lucide-react": { ChevronRight: "ChevronRight" },
      "../utils/facilityDoctorScheduleConstants": {
        scheduleServices: [
          ["clinic", "Clinic", "Hours", "Icon"],
          ["online", "Online", "Hours", "Icon"],
        ],
      },
      "../components/FacilityDoctorScheduleEditor": {
        FacilityDoctorScheduleEditor: "Editor",
      },
      "../components/FacilityUnavailableTime": {
        FacilityUnavailableTime: "Leave",
      },
      "../components/ScheduleAdjustmentNotices": {
        ScheduleAdjustmentNotices: "Notices",
      },
    }
  );
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  let selected;
  const onSelectMode = (mode) => {
    selected = mode;
  };
  const transition = [false, () => {}];
  const nodes = flatten(
    FacilityDoctorScheduleScreen({
      practiceId: "practice",
      onSelectMode,
      transition,
    })
  );
  assert.equal(nodes.filter((node) => node.type === "Link").length, 0);
  nodes.filter((node) => node.type === "button")[1].props.onClick();
  assert.equal(selected, "online");
  assert.equal(
    nodes.find((node) => node.type === "Leave").props.transition,
    transition
  );
  const editor = FacilityDoctorScheduleScreen({
    practiceId: "practice",
    mode: "clinic",
    onSelectMode,
    transition,
  });
  assert.equal(editor.type, "Editor");
  assert.equal(editor.props.onSelectMode, onSelectMode);
});

const source = fs.readFileSync(
  new URL(
    "../../src/features/doctors/utils/scheduleEditor.ts",
    import.meta.url
  ),
  "utf8"
);

const moduleHost = { exports: {} };

vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: moduleHost.exports, module: moduleHost, Intl, Date, Error, Number }
);

const { practiceSlotIso, previewClocks, suggestConsultationDuration } =
  moduleHost.exports;

test("practice timezone is independent of browser timezone", () => {
  assert.equal(
    practiceSlotIso("2026-10-20", "09:00", "Asia/Kolkata"),
    "2026-10-20T03:30:00.000Z"
  );
  assert.equal(
    practiceSlotIso("2026-10-20", "09:00", "America/New_York"),
    "2026-10-20T13:00:00.000Z"
  );
});

test("nonexistent DST times are rejected", () =>
  assert.throws(
    () => practiceSlotIso("2026-03-08", "02:30", "America/New_York"),
    /does not exist/
  ));

test("24:00 closes the day; incomplete slots and invalid windows are excluded", () => {
  assert.equal(
    JSON.stringify(previewClocks("23:00", "24:00", 30)),
    JSON.stringify(["23:00", "23:30"])
  );

  assert.equal(
    JSON.stringify(previewClocks("09:00", "09:40", 30)),
    JSON.stringify(["09:00"])
  );
  assert.equal(previewClocks("24:00", "24:00", 15).length, 0);
});

test("split-block setup suggestions exclude the online/home gaps", () => {
  assert.equal(
    suggestConsultationDuration("09:00", "17:00", 12, [
      { start: "09:00", end: "10:00" },
      { start: "14:00", end: "17:00" },
    ]),
    20
  );
});

test("duration suggestion follows working hours and daily cap without exceeding duration bounds", () => {
  assert.equal(suggestConsultationDuration("09:00", "17:00", 12), 40);
  assert.equal(suggestConsultationDuration("09:00", "17:00", 8), 60);
  assert.equal(suggestConsultationDuration("22:00", "24:00", 7), 15);
  assert.equal(suggestConsultationDuration("09:00", "17:00", 0), null);
  assert.equal(suggestConsultationDuration("17:00", "09:00", 12), null);
});

// The real shared schedule helpers (settings mapping and merge) run in tests.
const scheduleContracts = load(
  "../../../../packages/contracts/src/doctor-schedule.ts",
  { zod: createRequire(import.meta.url)("zod") }
);

function load(file, mocks = {}) {
  const absolute = new URL(file, import.meta.url),
    exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      crypto,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (!name.startsWith(".")) throw Error("Unmocked import: " + name);
        const target = new URL(name, absolute),
          resolved = [target.href, target.href + ".ts", target.href + ".tsx"]
            .map((value) => new URL(value))
            .find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
        if (!resolved) throw Error("Unresolved import: " + name);
        return load(resolved, mocks);
      },
    }
  );
  return exports;
}

function editor({
  mode = "clinic",
  published = false,
  conflictPreview = null,
} = {}) {
  const state = [],
    publications = [],
    tasks = [],
    toasts = [];
  let cursor = 0;
  const jsx = (type, props) =>
    [
      "ScheduleTimeBlocks",
      "AppointmentSlotSettings",
      "ScheduleAutoAcceptance",
      "HomeVisitSettings",
    ].includes(type?.name)
      ? type(props)
      : { type, props: props ?? {} };
  const settings = {
    practice_id: "practice-a",
    row_version: "8",
    working_days: [1],
    online_working_days: [2],
    home_working_days: [3],
    clinic_start: "09:00",
    clinic_end: "17:00",
    online_start: "16:00",
    online_end: "18:00",
    home_start: "18:00",
    home_end: "19:00",
    slot_minutes: 60,
    online_slot_minutes: 30,
    home_slot_minutes: 60,
    walkin_daily_limit: 12,
    online_daily_limit: 8,
    auto_accept: false,
    auto_accept_limit: 0,
    home_visits: false,
    home_radius_km: null,
    clinic_fee_minor: 10000,
    online_fee_minor: 20000,
    home_fee_minor: 30000,
    published_modes: published ? [mode] : [],
  };
  const { FacilityDoctorScheduleScreen } = load(
    "../../src/features/doctors/screens/FacilityDoctorScheduleScreen.tsx",
    {
      react: {
        useEffect: () => {},
        useState: (initial) => {
          const i = cursor++;
          if (!(i in state))
            state[i] = typeof initial === "function" ? initial() : initial;
          return [
            state[i],
            (next) => {
              state[i] = typeof next === "function" ? next(state[i]) : next;
            },
          ];
        },
        useTransition: () => [false, (fn) => tasks.push(fn())],
      },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/link": { default: "Link" },
      "next/navigation": { useRouter: () => ({ refresh: () => {} }) },
      "@tanstack/react-query": {
        useQueryClient: () => ({
          setQueryData: () => {},
          invalidateQueries: async () => {},
        }),
        useQuery: ({ queryKey }) => ({
          data:
            queryKey[0] === "facility-schedule-busy-blocks"
              ? []
              : {
                  ok: true,
                  doctor: { name: "Doctor", booking_timezone: "Asia/Kolkata" },
                  settings,
                },
        }),
      },
      "lucide-react": {},
      "@startup/web-ui/components/ui/button": { Button: "Button" },
      "@startup/web-ui/components/ui/input": { Input: "Input" },
      "@startup/web-ui/components/ui/skeleton": {},
      "@startup/web-ui/components/ui/spinner": {},
      "@startup/web-ui/components/ui/dialog": {
        Dialog: "Dialog",
        DialogContent: "DialogContent",
        DialogTitle: "DialogTitle",
        DialogDescription: "DialogDescription",
      },
      "@startup/web-ui/components/ui/toast": {
        toast: { add: (value) => toasts.push(value) },
      },
      "@startup/contracts": {
        ...scheduleContracts,
        doctorScheduleSettingsSchema: { safeParse: () => ({ success: true }) },
        formatDisplayDate: (value) => value,
      },
      "../components/ClockTimePicker": { ClockTimePicker: "Time" },
      "./ClockTimePicker": { ClockTimePicker: "Time" },
      "../components/ClockDurationPicker": { ClockDurationPicker: "Duration" },
      "./ClockDurationPicker": { ClockDurationPicker: "Duration" },
      "./UnavailableDatePicker": { UnavailableDatePicker: "DatePicker" },
      "../components/UnavailableDatePicker": {
        UnavailableDatePicker: "DatePicker",
      },
      "../components/FacilityUnavailableTime": {},
      "../server/scheduleActions": {
        previewFacilityDoctorSchedule: async () => ({
          ok: true,
          preview: conflictPreview ?? {
            conflicts: [],
            can_replace: true,
            token: "preview",
          },
        }),
        listFacilityDoctorBusyBlocks: async () => [],
        publishFacilityDoctorSchedule: async (...args) => {
          publications.push(args);
          return {
            ok: true,
            settings: { ...settings, published_modes: [mode] },
          };
        },
        publishPreviewedFacilityDoctorSchedule: async (...args) => {
          publications.push(args);
          return {
            ok: true,
            settings: { ...settings, published_modes: [mode] },
          };
        },
      },
      "../utils/facilityScheduleEditorConstants": load(
        "../../src/features/doctors/utils/facilityScheduleEditorConstants.ts"
      ),
      "../utils/scheduleEditor": moduleHost.exports,
    }
  );
  function render() {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      nodes.push(node);
      walk(node.props?.children);
    }
    const entry = FacilityDoctorScheduleScreen({
      practiceId: "practice-a",
      mode,
    });
    walk(entry.type(entry.props));
    return nodes;
  }
  return { render, publications, toasts, finish: () => Promise.all(tasks) };
}

for (const mode of ["clinic", "online"])
  test(`${mode} setup previews before applying, keeps duration on cap edits, and publishes the chosen date`, async () => {
    const view = editor({ mode });
    let nodes = view.render();
    const initialDuration = nodes.find((node) => node.type === "Duration").props
      .value;
    nodes
      .find((node) => node.props.children === "Suggest duration")
      .props.onClick();
    nodes = view.render();
    assert.equal(
      nodes.find((node) => node.type === "Duration").props.value,
      initialDuration
    );
    assert.equal(
      nodes.filter((node) => node.type === "Dialog").at(-1).props.open,
      true
    );
    nodes
      .find((node) => node.props.children === "Use this duration")
      .props.onClick();
    nodes = view.render();
    const duration = mode === "clinic" ? 40 : 15;
    assert.equal(
      nodes.find((node) => node.type === "Duration").props.value,
      duration
    );
    nodes
      .find(
        (node) =>
          node.props.title ===
          (mode === "clinic" ? "Total clinic capacity" : "Daily booking limit")
      )
      .props.onChange(20);
    if (mode === "clinic") {
      nodes = view.render();
      nodes
        .find((node) => node.props.title === "App booking quota")
        .props.onChange(12);
      nodes = view.render();
      nodes
        .find((node) => node.props.title === "Reception walk-in quota")
        .props.onChange(8);
    }
    nodes = view.render();
    assert.equal(
      nodes.find((node) => node.type === "Duration").props.value,
      duration
    );
    const picker = nodes.find((node) => node.type === "DatePicker");
    const chosen = new Date(
      Date.parse(`${picker.props.value}T12:00:00Z`) + 7 * 86400000
    )
      .toISOString()
      .slice(0, 10);
    picker.props.onChange(chosen);
    nodes = view.render();
    nodes
      .find((node) => node.type === "form")
      .props.onSubmit({ preventDefault() {} });
    await view.finish();
    const [practice, selectedMode, settings, version, date] =
      view.publications[0];
    assert.equal(practice, "practice-a");
    assert.equal(selectedMode, mode);
    if (mode === "clinic") {
      assert.equal(settings.clinicAppDailyLimit, 12);
      assert.equal(settings.clinicWalkinDailyLimit, 8);
    }
    assert.equal(version, 8);
    assert.equal(date, chosen);
    assert.equal(
      settings[mode === "clinic" ? "slotMinutes" : "onlineSlotMinutes"],
      duration
    );
    assert.equal(
      settings[mode === "clinic" ? "onlineSlotMinutes" : "slotMinutes"],
      mode === "clinic" ? 30 : 60
    );
    assert.equal(view.toasts.at(-1).type, "success");
  });

test("published schedule keeps a sixty-minute duration and hides setup recalculation", async () => {
  const view = editor({ published: true });
  let nodes = view.render();
  assert.equal(
    nodes.find((node) => node.props.children === "Suggest duration"),
    undefined
  );
  nodes
    .find((node) => node.props.title === "Total clinic capacity")
    .props.onChange(30);
  nodes = view.render();
  assert.equal(nodes.find((node) => node.type === "Duration").props.value, 60);
  nodes
    .find((node) => node.type === "form")
    .props.onSubmit({ preventDefault() {} });
  await view.finish();
  assert.equal(view.publications[0][2].slotMinutes, 60);
});

test("clinic editor adds a second block and publishes the gap without changing duration", async () => {
  const view = editor({ mode: "clinic", published: true });
  let nodes = view.render();
  nodes
    .find((node) => node.type === "Time" && node.props.label === "End Time")
    .props.onChange("10:00");
  nodes = view.render();
  nodes
    .find((node) => node.props.children === "Add time block")
    .props.onClick();
  nodes = view.render();
  nodes
    .filter(
      (node) => node.type === "Time" && node.props.label === "Start Time"
    )[1]
    .props.onChange("11:00");
  nodes = view.render();
  nodes
    .filter(
      (node) => node.type === "Time" && node.props.label === "End Time"
    )[1]
    .props.onChange("17:00");
  nodes = view.render();
  assert.equal(
    nodes.filter(
      (node) => node.type === "Time" && node.props.label === "Start Time"
    ).length,
    2
  );
  nodes
    .find((node) => node.type === "form")
    .props.onSubmit({ preventDefault() {} });
  await view.finish();
  assert.equal(
    JSON.stringify(view.publications[0][2].clinicTimeBlocks),
    JSON.stringify([
      { start: "09:00", end: "10:00" },
      { start: "11:00", end: "17:00" },
    ])
  );
  assert.equal(view.publications[0][2].slotMinutes, 60);
});

test("web overlap is previewed before confirmed replacement", async () => {
  const view = editor({
    published: true,
    conflictPreview: { token: "reviewed", conflicts: [{}], can_replace: true },
  });
  view
    .render()
    .find((node) => node.type === "form")
    .props.onSubmit({ preventDefault() {} });
  await view.finish();
  assert.equal(view.publications.length, 0);
  view
    .render()
    .find((node) => node.props.preview?.token === "reviewed")
    .props.onConfirm();
  await view.finish();
  assert.equal(view.publications.length, 1);
  assert.equal(view.publications[0][5], "reviewed");
});

test("web blocked conflict cannot replace and dismiss keeps edited hours", async () => {
  const view = editor({
    published: true,
    conflictPreview: { token: "blocked", conflicts: [{}], can_replace: false },
  });
  view
    .render()
    .find((node) => node.type === "form")
    .props.onSubmit({ preventDefault() {} });
  await view.finish();
  const dialog = view
    .render()
    .find((node) => node.props.preview?.token === "blocked");
  dialog.props.onConfirm();
  await view.finish();
  assert.equal(view.publications.length, 0);
  dialog.props.onClose();
  assert.equal(
    view.render().find((node) => node.props.preview?.token === "blocked"),
    undefined
  );
});

test("conflict dialog renders service labels and remaining hours through real public contract exports", () => {
  const requireContract = createRequire(
    new URL("../../../../packages/contracts/package.json", import.meta.url)
  );
  const contracts = load("../../../../packages/contracts/src/index.ts", {
    zod: requireContract("zod"),
  });
  assert.equal(typeof contracts.scheduleServiceLabel, "function");
  assert.equal(typeof contracts.scheduleBlockSummary, "function");
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { ScheduleConflictDialog } = load(
    "../../src/features/doctors/components/ScheduleConflictDialog.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@startup/contracts": contracts,
      react: { useState: () => [null, () => {}] },
      "@startup/web-ui/components/ui/button": { Button: "Button" },
      "@startup/web-ui/components/ui/dialog": {
        Dialog: "Dialog",
        DialogContent: "DialogContent",
        DialogTitle: "DialogTitle",
        DialogDescription: "DialogDescription",
      },
    }
  );
  const preview = contracts.scheduleChangePreviewSchema.parse({
    token: "reviewed",
    effective_from: "2026-11-02",
    can_replace: true,
    conflicts: [
      {
        rule_id: "00000000-0000-4000-8000-000000000001",
        practice_id: "00000000-0000-4000-8000-000000000002",
        facility_name: "Fixture clinic",
        mode: "online",
        days: [1, 3],
        start: "13:00",
        end: "15:00",
        travel_buffer_minutes: 15,
        effective_from: "2026-11-02",
        effective_until: null,
        remaining: [{ days: [1, 3], start: "14:00", end: "15:00" }],
        booked_count: 0,
        replaceable: true,
        reason: null,
      },
    ],
  });
  const text = (node) =>
    Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object"
        ? text(node.props?.children)
        : (node ?? "");
  const rendered = text(
    ScheduleConflictDialog({
      preview,
      pending: false,
      onClose() {},
      onConfirm() {},
    })
  );
  assert.match(rendered, /Online · Fixture clinic/);
  assert.match(rendered, /Mon, Wed: 13:00–15:00/);
  assert.match(rendered, /Mon, Wed: 14:00–15:00/);
  preview.conflicts[0].remaining = [];
  assert.match(
    text(
      ScheduleConflictDialog({
        preview,
        pending: false,
        onClose() {},
        onConfirm() {},
      })
    ),
    /No hours remain/
  );
});

test("web pause waits for explicit confirmation and a patient-facing reason", () => {
  let state = null;
  const confirmations = [];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const react = {
    useState: () => [
      state,
      (next) => {
        state = next;
      },
    ],
  };
  const preview = {
    token: "booked-plan",
    effective_from: "2026-11-02",
    can_replace: false,
    can_request: true,
    conflicts: [
      {
        rule_id: "rule",
        mode: "online",
        facility_name: "Fixture",
        days: [1],
        start: "13:00",
        end: "15:00",
        remaining: [{ days: [1], start: "14:00", end: "15:00" }],
        paused_remaining: [],
        effective_from: "2026-11-02",
        travel_buffer_minutes: 0,
        booked_count: 1,
        reason: "Review bookings",
        bookings: [
          {
            id: "appointment",
            patient_name: "Fixture patient",
            booking_code: "APT-1",
            starts_at: "2026-11-02T08:00:00Z",
            ends_at: "2026-11-02T08:30:00Z",
            timezone: "Asia/Kolkata",
            payment_hold: false,
          },
        ],
      },
    ],
  };
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [
            node,
            ...flatten(node.props?.children),
            ...flatten(node.props?.actions),
          ]
        : [];

  const req = createRequire(
    new URL("../../../../packages/contracts/package.json", import.meta.url)
  );
  const contracts = load(
    "../../../../packages/contracts/src/doctor-schedule.ts",
    { zod: req("zod") }
  );
  const { ScheduleConflictDialog } = load(
    "../../src/features/doctors/components/ScheduleConflictDialog.tsx",
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@startup/contracts": {
        ...contracts,
        formatDisplayDate: (value) => value,
      },
      "@startup/web-ui/components/ui/button": { Button: "Button" },
      "@startup/web-ui/components/ui/dialog": {
        Dialog: "Dialog",
        DialogContent: "DialogContent",
        DialogTitle: "DialogTitle",
        DialogDescription: "DialogDescription",
      },
    }
  );
  const render = (pending = false) =>
    flatten(
      ScheduleConflictDialog({
        preview,
        pending,
        onClose() {},
        onConfirm: (value) => confirmations.push(value),
      })
    );
  render()
    .find(
      (n) =>
        n.type === "Button" &&
        n.props.children === "Publish new schedule and pause affected blocks"
    )
    .props.onClick();
  assert.equal(confirmations.length, 0);
  let button = render().find(
    (n) =>
      n.type === "Button" &&
      n.props.children === "Publish and send rescheduling requests"
  );
  assert.equal(button.props.disabled, true);
  render()
    .find((n) => n.type === "textarea")
    .props.onChange({ target: { value: "Clinic hours changed" } });
  button = render().find(
    (n) =>
      n.type === "Button" &&
      n.props.children === "Publish and send rescheduling requests"
  );
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  assert.equal(
    JSON.stringify(confirmations),
    JSON.stringify([
      { strategy: "pause", patientReason: "Clinic hours changed" },
    ])
  );
  assert.ok(
    render(true)
      .filter((n) => n.type === "Button")
      .every((n) => n.props.disabled)
  );
});

test("schedule calendar preserves date-only selections and booking date bounds", () => {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { UnavailableDatePicker } = load(
    "../../src/features/doctors/components/UnavailableDatePicker.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@startup/web-ui/components/ui/calendar": { Calendar: "Calendar" },
    }
  );
  const changes = [];
  const props = {
    value: "2026-11-05",
    minDate: "2026-11-02",
    timeZone: "Asia/Kolkata",
    onChange: (value) => changes.push(value),
  };
  const calendar = UnavailableDatePicker(props).props.children[1];
  assert.equal(calendar.type, "Calendar");
  assert.equal(calendar.props.selected.getFullYear(), 2026);
  assert.equal(calendar.props.selected.getMonth(), 10);
  assert.equal(calendar.props.selected.getDate(), 5);
  assert.equal(calendar.props.disabled[0].before.getDate(), 2);
  assert.equal(calendar.props.startMonth.getMonth(), 10);
  assert.equal(
    calendar.props.endMonth.getFullYear(),
    new Date().getFullYear() + 1
  );
  calendar.props.onSelect(new Date(2026, 10, 8, 12));
  calendar.props.onSelect(undefined);
  assert.deepEqual(changes, ["2026-11-08"]);
  const blocked = UnavailableDatePicker({ ...props, disabled: true }).props
    .children[1];
  assert.equal(blocked.props.disabled, true);
  blocked.props.onSelect(new Date(2026, 10, 9, 12));
  assert.equal(changes.length, 1);
});
