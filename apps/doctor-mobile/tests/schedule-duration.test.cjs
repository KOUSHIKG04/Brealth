function load(file, mocks) {
  const exports = {};
  const absolute = path.resolve(__dirname, file);
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (!name.startsWith(".")) return undefined;
        const target = path.resolve(path.dirname(absolute), name);
        const resolved = [target, target + ".ts", target + ".tsx"].find(
          (file) => fs.existsSync(file) && fs.statSync(file).isFile()
        );
        if (!resolved) throw new Error("Unmocked import: " + name);
        return load(path.relative(__dirname, resolved), mocks);
      },
    }
  );
  return exports;
}

const { test } = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");

const exportsForSchedule = {};

test("reschedule cutoff selections preserve exact saved minutes and the seven-day limit", () => {
  const jsx = (type, props) => ({ type, props });
  const { RescheduleCutoffPicker } = load(
    "../src/features/schedule/components/RescheduleCutoffPicker.tsx",
    {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "react-native": { View: "View" },
      "@startup/mobile-ui": { Dropdown: "Dropdown" },
      "../../../components/DoctorScreen": { Label: "Label" },
    }
  );
  let next;
  const render = (value, disabled = false) =>
    RescheduleCutoffPicker({
      value,
      disabled,
      onChange: (value) => {
        next = value;
      },
    }).props.children[1].props.children;
  const controls = render(2 * 1440 + 3 * 60 + 17);
  assert.deepEqual(
    Array.from(controls, (control) => control.props.value),
    ["2", "3", "17"]
  );
  controls[2].props.onValueChange("42");
  assert.equal(next, 2 * 1440 + 3 * 60 + 42);
  const maximum = render(10080);
  assert.ok(
    maximum[1].props.options
      .filter((option) => option.value !== "0")
      .every((option) => option.disabled)
  );
  assert.ok(
    maximum[2].props.options
      .filter((option) => option.value !== "0")
      .every((option) => option.disabled)
  );
  assert.ok(render(0, true).every((control) => control.props.disabled));
});

const scheduleContracts = load(
  "../../../packages/contracts/src/doctor-schedule.ts",
  { zod: { z: require("zod") } }
);

vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, "../src/features/schedule/utils/schedule.ts"),
      "utf8"
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }
  ).outputText,
  {
    exports: exportsForSchedule,
    require: (name) => {
      if (name === "@startup/contracts") return scheduleContracts;
      throw Error(name);
    },
  }
);

const { suggestConsultationDuration, slotStartTimes, scheduleError } =
  exportsForSchedule;

test("setup suggestion divides working hours by the booking limit and uses five-minute increments", () => {
  assert.equal(suggestConsultationDuration("09:00", "17:00", 12), 40);
  assert.equal(suggestConsultationDuration("09:00", "17:00", 8), 60);
  assert.equal(suggestConsultationDuration("22:00", "24:00", 7), 15);
  assert.equal(suggestConsultationDuration("09:00", "17:00", 0), null);
  assert.equal(suggestConsultationDuration("17:00", "09:00", 12), null);
  assert.equal(suggestConsultationDuration("bad", "17:00", 12), null);
  assert.equal(suggestConsultationDuration("09:00", "17:00", 100), 5);
});

test("split-block duration suggestions exclude gaps and shared validation rejects overlapping blocks", () => {
  assert.equal(
    suggestConsultationDuration("09:00", "17:00", 12, [
      { start: "09:00", end: "10:00" },
      { start: "14:00", end: "17:00" },
    ]),
    20
  );
  assert.equal(
    scheduleContracts.scheduleBlocksError(
      [
        { start: "09:00", end: "10:00" },
        { start: "09:30", end: "11:00" },
      ],
      30
    ),
    "Time blocks and travel buffers cannot overlap."
  );
  assert.equal(
    scheduleContracts.scheduleBlocksError(
      [
        { start: "12:30", end: "13:30" },
        { start: "13:45", end: "14:45" },
      ],
      60,
      15
    ),
    "Time blocks and travel buffers cannot overlap."
  );
});

test("saved sixty-minute consultations remain valid when increasing the booking limit", () => {
  const draft = {
    days: [0],
    start: "09:00",
    end: "17:00",
    duration: 60,
    onlineDuration: 15,
    homeDuration: 60,
    online: 8,
    walkIn: 12,
    autoLimit: 1,
    homeVisits: false,
    clinicFee: "100",
    onlineFee: "100",
    homeFee: "100",
  };
  const before = slotStartTimes(draft.start, draft.end, draft.duration);
  const changed = { ...draft, walkIn: 20 };
  assert.equal(scheduleError(changed, "clinic"), undefined);
  assert.equal(changed.duration, 60);
  assert.deepEqual(
    slotStartTimes(changed.start, changed.end, changed.duration),
    before
  );
});

function scheduleView({
  published = false,
  conflictPreview = null,
  publishFailures = [],
  latestPrefs = null,
} = {}) {
  const state = [],
    memo = [],
    effects = [];
  let cursor = 0;
  const publications = [],
    previews = [];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const prefs = {
    practice_id: "practice",
    row_version: "1",
    working_days: [1],
    online_working_days: [2],
    home_working_days: [3],
    clinic_start: "09:00",
    clinic_end: "17:00",
    slot_minutes: 60,
    online_slot_minutes: 30,
    home_slot_minutes: 60,
    walkin_daily_limit: 12,
    online_daily_limit: 8,
    auto_accept: false,
    auto_accept_limit: 1,
    home_visits: false,
    home_radius_km: null,
    clinic_fee_minor: 10000,
    online_fee_minor: 20000,
    home_fee_minor: 30000,
    published_modes: published ? ["clinic"] : [],
    published_from: {},
  };
  function changed(index, deps) {
    return (
      !memo[index] || deps.some((value, i) => value !== memo[index].deps[i])
    );
  }
  const mocks = {
    react: {
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
      useRef: (initial) => {
        const i = cursor++;
        return state[i] ?? (state[i] = { current: initial });
      },
      useCallback: (fn, deps) => {
        const i = cursor++;
        if (changed(i, deps)) memo[i] = { deps, value: fn };
        return memo[i].value;
      },
      useEffect: (fn, deps) => {
        const i = cursor++;
        if (changed(i, deps)) {
          memo[i] = { deps };
          effects.push(fn);
        }
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      View: "View",
      Switch: "Switch",
      Pressable: "Pressable",
      StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
    },
    "expo-router": {
      useFocusEffect: () => {},
      useNavigation: () => ({ addListener: () => () => {}, dispatch() {} }),
    },
    "lucide-react-native": {},
    "@startup/mobile-ui": {
      Button: "Button",
      Chip: "Chip",
      ClockDurationPicker: "Duration",
      ModalSurface: "Modal",
      Accordion: "Accordion",
      useToast: () => ({ showToast: () => {} }),
      useToastFeedback: () => {},
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({
        setQueryData: () => {},
        invalidateQueries: async () => {},
      }),
      useQuery: ({ queryKey }) => ({
        data:
          queryKey[0] === "my-practices"
            ? [
                {
                  practice_id: "practice",
                  facility_kind: "clinic",
                  verified: true,
                },
              ]
            : queryKey[0] === "my-doctor-schedule"
              ? prefs
              : queryKey[0] === "my-doctor-profile"
                ? { booking_timezone: "Asia/Kolkata" }
                : undefined,
        refetch: async () => ({ data: latestPrefs ?? prefs }),
      }),
    },
    "@startup/data-access": {
      previewMyDoctorSchedule: async (...args) => {
        previews.push(args);
        return (
          conflictPreview ?? {
            conflicts: [],
            can_replace: true,
            token: "preview",
          }
        );
      },
      listMyScheduleBusyBlocks: async () => [],
      publishMyDoctorSchedule: async (...args) => {
        publications.push(args);
        return { settings: prefs };
      },
      publishPreviewedDoctorSchedule: async (...args) => {
        const failure = publishFailures.shift();
        if (failure) throw Object.assign(new Error(failure), { code: failure });
        publications.push(args);
        return { settings: prefs };
      },
    },
    "@startup/contracts": {
      ...scheduleContracts,
      formatDisplayDate: (value) => value,
    },
    "../../../services/supabase": {
      supabase: {},
      useMobileSession: () => ({ profile: { doctor: { id: "doctor" } } }),
    },
    "../../practices/services/selectedPractice": {
      selectedPracticeQueryKey: () => ["selected-practice"],
    },
    "../../../components/DoctorScreen": {
      DoctorScreen: "Screen",
      Label: "Label",
      Heading: "Heading",
      Panel: "Panel",
    },
    "../services/scheduleHelp": {
      isScheduleHelpDismissed: async () => true,
      dismissScheduleHelp: async () => {},
    },
    "../../../components/theme": { palette: {}, ui: {} },
    "../../../components/DatePicker": { DatePicker: "DatePicker" },
    "../utils/schedule": exportsForSchedule,
    "../components/ScheduleOperationsPanels": {
      ScheduleSection: "Section",
      WorkingDaysPanel: "Days",
      ClinicHoursPanel: "Hours",
      ConsultationChargesPanel: "Charges",
    },
  };
  const exports = load(
    "../src/features/schedule/screens/ScheduleScreen.tsx",
    mocks
  );
  function render() {
    cursor = 0;
    effects.length = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      nodes.push(node);
      walk(node.props?.children);
      walk(node.props?.footer);
    }
    walk(exports.ScheduleScreen({ mode: "clinic" }));
    effects.forEach((fn) => fn());
    return nodes;
  }
  render();
  return { render, publications, previews, prefs };
}

const suggestionButton = (nodes) =>
  nodes.find(
    (node) =>
      node.type === "Button" && /^Use \d+ min$/.test(node.props.label ?? "")
  );

test("initial setup offers an inline suggestion, applies it only when chosen, and sends the chosen date", async () => {
  const view = scheduleView();
  let nodes = view.render();
  assert.equal(nodes.find((node) => node.type === "Duration").props.value, 60);
  // No pop-ups: the suggestion is an inline button that changes nothing until pressed.
  assert.equal(nodes.filter((node) => node.type === "Modal").length, 0);
  assert.equal(suggestionButton(nodes).props.label, "Use 40 min");
  assert.equal(nodes.find((node) => node.type === "Duration").props.value, 60);
  suggestionButton(nodes).props.onPress();
  nodes = view.render();
  assert.equal(nodes.find((node) => node.type === "Duration").props.value, 40);
  nodes
    .find((node) => node.props.title === "Total clinic capacity")
    .props.onChange(20);
  nodes = view.render();
  nodes
    .find((node) => node.props.title === "App booking quota")
    .props.onChange(12);
  nodes = view.render();
  nodes
    .find((node) => node.props.title === "Reception walk-in quota")
    .props.onChange(8);
  nodes = view.render();
  assert.equal(nodes.find((node) => node.type === "Duration").props.value, 40);
  const initialDate = nodes.find((node) => node.type === "DatePicker").props
    .value;
  const chosenDate = new Date(
    new Date(`${initialDate}T12:00:00Z`).getTime() + 7 * 86400000
  )
    .toISOString()
    .slice(0, 10);
  nodes.find((node) => node.type === "DatePicker").props.onChange(chosenDate);
  nodes = view.render();
  await nodes
    .find((node) => node.props.publishLabel === "Publish Schedule")
    .props.onPublish();
  assert.equal(view.publications.length, 1);
  assert.equal(view.publications[0][1], "practice");
  assert.equal(view.publications[0][2], "clinic");
  assert.equal(view.publications[0][3].slotMinutes, 40);
  assert.equal(view.publications[0][3].walkinDailyLimit, 20);
  assert.equal(view.publications[0][3].clinicAppDailyLimit, 12);
  assert.equal(view.publications[0][3].clinicWalkinDailyLimit, 8);
  assert.equal(view.publications[0][3].onlineSlotMinutes, 30);
  assert.equal(view.publications[0][5], chosenDate);
});

test("published schedule keeps its saved duration and does not offer setup recalculation", () => {
  const view = scheduleView({ published: true });
  let nodes = view.render();
  assert.equal(suggestionButton(nodes), undefined);
  nodes
    .find((node) => node.props.title === "Total clinic capacity")
    .props.onChange(30);
  nodes = view.render();
  assert.equal(nodes.find((node) => node.type === "Duration").props.value, 60);
});

test("doctor publishes split clinic blocks with the same saved appointment duration", async () => {
  const view = scheduleView({ published: true });
  let nodes = view.render();
  nodes
    .find((node) => node.props.title === "Clinic hours")
    .props.onUpdate({
      start: "09:00",
      end: "17:00",
      timeBlocks: [
        { start: "09:00", end: "10:00" },
        { start: "11:00", end: "17:00" },
      ],
    });
  nodes = view.render();
  await nodes
    .find((node) => node.props.publishLabel === "Publish Schedule")
    .props.onPublish();
  assert.equal(view.publications[0][3].clinicTimeBlocks.length, 2);
  assert.equal(view.publications[0][3].clinicTimeBlocks[1].start, "11:00");
  assert.equal(view.publications[0][3].slotMinutes, 60);
});

test("a schedule saved elsewhere is merged and published once without losing edits", async () => {
  const latest = {
    ...scheduleViewPrefs(),
    row_version: "2",
    online_fee_minor: 45000,
  };
  const view = scheduleView({
    published: true,
    publishFailures: ["PT409"],
    latestPrefs: latest,
  });
  let nodes = view.render();
  nodes
    .find((node) => node.props.title === "Total clinic capacity")
    .props.onChange(30);
  nodes = view.render();
  await nodes
    .find((node) => node.props.publishLabel === "Publish Schedule")
    .props.onPublish();
  assert.equal(view.publications.length, 1);
  const [, , , settings, version] = view.publications[0];
  assert.equal(settings.walkinDailyLimit, 30, "doctor edit kept");
  assert.equal(settings.onlineFeeMinor, 45000, "other app edit adopted");
  assert.equal(version, 2, "retried against the latest version");
  assert.equal(view.previews.length, 2, "re-previewed after the merge");
});

test("the same setting changed in both apps keeps the doctor's value and does not publish", async () => {
  const latest = {
    ...scheduleViewPrefs(),
    row_version: "2",
    walkin_daily_limit: 40,
  };
  const view = scheduleView({
    published: true,
    publishFailures: ["PT409"],
    latestPrefs: latest,
  });
  let nodes = view.render();
  nodes
    .find((node) => node.props.title === "Total clinic capacity")
    .props.onChange(30);
  nodes = view.render();
  await nodes
    .find((node) => node.props.publishLabel === "Publish Schedule")
    .props.onPublish();
  assert.equal(view.publications.length, 0);
  nodes = view.render();
  assert.equal(
    nodes.find((node) => node.props.title === "Total clinic capacity").props
      .value,
    30
  );
});

test("an overlap that appears after the preview re-previews instead of failing", async () => {
  const view = scheduleView({ published: true, publishFailures: ["PT410"] });
  await view
    .render()
    .find((node) => node.props.publishLabel === "Publish Schedule")
    .props.onPublish();
  assert.equal(view.previews.length, 2);
  assert.equal(view.publications.length, 1);
});

function scheduleViewPrefs() {
  return scheduleView().prefs;
}

const jsx = (type, props) => ({ type, props });

function nodes(tree) {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];
}

const components = Object.fromEntries(
  [
    "Button",
    "Chip",
    "FadedScrollView",
    "Input",
    "Loader",
    "Skeleton",
    "ClockDurationPicker",
    "ModalSurface",
    "Accordion",
  ].map((name) => [name, name])
);

const base = {
  "../components/ScheduleAdjustmentNotices": {
    ScheduleAdjustmentNotices: "ScheduleAdjustmentNotices",
  },
  "../components/ScheduleConflictDialog": {
    ScheduleConflictDialog: "ScheduleConflictDialog",
  },
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "react-native": {
    View: "View",
    Switch: "Switch",
    Pressable: "Pressable",
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  },
  "@startup/mobile-ui": components,
  "../../../components/DoctorScreen": {
    Heading: "Heading",
    Label: "Label",
    Panel: "Panel",
    DoctorScreen: "DoctorScreen",
    Choice: "Choice",
  },
  "../../../components/theme": { palette: {}, ui: {} },
};

for (const mode of ["clinic", "online", "home"]) {
  test(`${mode} editor publishes through its own controller`, () => {
    let receivedMode,
      saves = 0;
    const { ScheduleScreen } = load(
      "../src/features/schedule/screens/ScheduleScreen.tsx",
      {
        ...base,
        react: { useState: (value) => [value, () => {}] },
        "lucide-react-native": { Calendar: "Calendar", Check: "Check" },
        "../../../components/DatePicker": { DatePicker: "DatePicker" },
        "../components/NumberSetting": { NumberSetting: "NumberSetting" },
        "../hooks/useDiscardChangesPrompt": {
          useDiscardChangesPrompt: () => ({ visible: false }),
        },
        "../hooks/useScheduleEditor": {
          useScheduleEditor({ mode }) {
            receivedMode = mode;
            return {
              practices: { data: [], isLoading: false, isFetching: false },
              doctorProfile: {},
              associationRequests: {},
              saved: {},
              selectedPracticeId: "practice",
              selectedPractice: { verified: true },
              draft: { days: [0], autoAccept: false, homeVisits: false },
              zone: "Asia/Kolkata",
              busy: false,
              suggestion: null,
              suggestedTimes: [],
              suggestedDuration: null,
              availabilityDuration: null,
              batchingHints: [],
              save() {
                saves++;
              },
            };
          },
        },
      }
    );
    const bars = nodes(ScheduleScreen({ mode })).filter(
      (node) => node.props?.publishLabel
    );
    assert.equal(receivedMode, mode);
    assert.equal(bars.length, 1);
    assert.equal(bars[0].props.publishLabel, "Publish Schedule");
    assert.equal(bars[0].props.disabled, false);
    bars[0].props.onPublish();
    assert.equal(saves, 1);
  });
  test(`${mode} charges editor hides other service fees`, () => {
    const { ConsultationChargesPanel } = load(
      "../src/features/schedule/components/ConsultationChargesPanel.tsx",
      base
    );
    const inputs = nodes(
      ConsultationChargesPanel({
        mode,
        draft: { clinicFee: "100", onlineFee: "200", homeFee: "300" },
      })
    ).filter((node) => node.type === "Input");
    assert.equal(inputs.length, 1);
    assert.equal(
      inputs[0].props.value,
      { clinic: "100", online: "200", home: "300" }[mode]
    );
  });
}

test("schedule overlap waits for confirmation and sends the reviewed token", async () => {
  const preview = { token: "reviewed", conflicts: [{}], can_replace: true };
  const view = scheduleView({ published: true, conflictPreview: preview });
  await view
    .render()
    .find((node) => node.props.publishLabel === "Publish Schedule")
    .props.onPublish();
  assert.equal(view.publications.length, 0);
  const dialog = view
    .render()
    .find((node) => node.props.preview?.token === "reviewed");
  await dialog.props.onConfirm();
  assert.equal(view.publications.length, 1);
  assert.equal(view.publications[0][6], "reviewed");
});

test("blocked overlap and cancel never publish or discard the draft", async () => {
  const view = scheduleView({
    published: true,
    conflictPreview: { token: "blocked", conflicts: [{}], can_replace: false },
  });
  await view
    .render()
    .find((node) => node.props.publishLabel === "Publish Schedule")
    .props.onPublish();
  let dialog = view
    .render()
    .find((node) => node.props.preview?.token === "blocked");
  await dialog.props.onConfirm();
  assert.equal(view.publications.length, 0);
  dialog.props.onClose();
  const tree = view.render();
  assert.equal(
    tree.find((node) => node.props.preview?.token === "blocked"),
    undefined
  );
  assert.equal(tree.find((node) => node.type === "Duration").props.value, 60);
});

test("Doctor pause uses the keyboard-safe dialog and requires a reason before sending requests", () => {
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

  const { ScheduleConflictDialog } = load(
    "../src/features/schedule/components/ScheduleConflictDialog.tsx",
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "react-native": { View: "View", TextInput: "TextInput" },
      "@startup/contracts": {
        ...scheduleContracts,
        formatDisplayDate: (value) => value,
      },
      "@startup/design-tokens": {
        colors: { doctor: { border: "gray", text: "black" } },
        spacing: { sm: 8, md: 16 },
      },
      "@startup/mobile-ui": { Button: "Button", AppDialog: "AppDialog" },
      "../../../components/DoctorScreen": {
        Heading: "Heading",
        Label: "Label",
      },
    }
  );
  const render = (busy = false) =>
    flatten(
      ScheduleConflictDialog({
        preview,
        busy,
        onClose() {},
        onConfirm: (value) => confirmations.push(value),
      })
    );
  assert.equal(render()[0].type, "AppDialog");
  render()
    .find(
      (n) =>
        n.type === "Button" &&
        n.props.label === "Publish new schedule and pause affected blocks"
    )
    .props.onPress();
  assert.equal(confirmations.length, 0);
  assert.equal(
    render().find(
      (n) =>
        n.type === "Button" &&
        n.props.label === "Publish and send rescheduling requests"
    ).props.disabled,
    true
  );
  render()
    .find((n) => n.type === "TextInput")
    .props.onChangeText("Clinic hours changed");
  const button = render().find(
    (n) =>
      n.type === "Button" &&
      n.props.label === "Publish and send rescheduling requests"
  );
  assert.equal(button.props.disabled, false);
  button.props.onPress();
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

function hookHarness() {
  const state = [];
  let cursor = 0;
  const effects = [];
  return {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [
          state[i],
          (value) => {
            state[i] = typeof value === "function" ? value(state[i]) : value;
          },
        ];
      },
      useRef(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = { current: initial };
        return state[i];
      },
      useEffect(fn) {
        cursor++;
        effects.push(fn);
      },
    },
    run(fn) {
      cursor = 0;
      effects.length = 0;
      const result = fn();
      effects.forEach((effect) => effect());
      return result;
    },
  };
}

test("publishing goes through an inline review that lists the changes", () => {
  const harness = hookHarness();
  const { SchedulePublishBar } = load(
    "../src/features/schedule/components/SchedulePublishBar.tsx",
    {
      ...base,
      react: harness.react,
      "lucide-react-native": { Calendar: "Calendar" },
    }
  );
  let valid = false,
    published = 0;
  const props = {
    publishLabel: "Publish Schedule",
    startsFromLabel: "today",
    hasChanges: true,
    changes: ["hours", "appointment length"],
    summary: "Mon–Sat · 9:00 AM–1:00 PM · 15 min",
    pausesService: false,
    disabled: false,
    loading: false,
    validate: () => valid,
    onPublish: () => {
      published++;
    },
  };
  const render = () => nodes(harness.run(() => SchedulePublishBar(props)));
  const button = (tree, label) =>
    tree.find((node) => node.type === "Button" && node.props.label === label);
  // An invalid draft stays in the editor; the problem is shown as a toast.
  button(render(), "Review & publish").props.onPress();
  assert.ok(button(render(), "Review & publish"));
  valid = true;
  button(render(), "Review & publish").props.onPress();
  const review = render();
  assert.ok(
    review.some(
      (node) => node.props?.children === "Changed: hours, appointment length."
    )
  );
  assert.equal(published, 0, "nothing is sent before confirming");
  button(review, "Keep editing").props.onPress();
  assert.ok(button(render(), "Review & publish"));
  button(render(), "Review & publish").props.onPress();
  button(render(), "Publish Schedule").props.onPress();
  assert.equal(published, 1);
});

test("leaving with unpublished edits asks before discarding them", () => {
  const harness = hookHarness();
  const listeners = [];
  const dispatched = [];
  const navigation = {
    addListener: (name, fn) => {
      listeners.push({ name, fn });
      return () => {};
    },
    dispatch: (action) => dispatched.push(action),
  };
  const { useDiscardChangesPrompt } = load(
    "../src/features/schedule/hooks/useDiscardChangesPrompt.ts",
    { react: harness.react, "expo-router": { useNavigation: () => navigation } }
  );
  assert.equal(
    harness.run(() => useDiscardChangesPrompt(false)).visible,
    false
  );
  assert.equal(listeners.length, 0, "no prompt without changes");
  harness.run(() => useDiscardChangesPrompt(true));
  let prevented = false;
  listeners[0].fn({
    preventDefault: () => (prevented = true),
    data: { action: { type: "GO_BACK" } },
  });
  assert.equal(prevented, true);
  const prompt = harness.run(() => useDiscardChangesPrompt(true));
  assert.equal(prompt.visible, true);
  prompt.keepEditing();
  assert.equal(harness.run(() => useDiscardChangesPrompt(true)).visible, false);
  assert.equal(dispatched.length, 0);
  listeners[0].fn({
    preventDefault() {},
    data: { action: { type: "GO_BACK" } },
  });
  harness.run(() => useDiscardChangesPrompt(true)).discard();
  assert.deepEqual(dispatched, [{ type: "GO_BACK" }]);
});
