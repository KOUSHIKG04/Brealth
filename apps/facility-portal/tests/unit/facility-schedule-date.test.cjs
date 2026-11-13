const { test } = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const path = require("node:path");

const vm = require("node:vm");

const ts = require("typescript");

const file = path.join(
  __dirname,
  "../../src/features/doctors/utils/facilitySchedule.ts"
);

const compiled = {};

vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: compiled,
    require: () => ({}),
    Date,
    Intl,
    Map,
    Set,
    Number,
    Array,
  }
);

const { facilitySchedule } = compiled;

test("a newly published future session is shown on its date, not today", () => {
  const now = new Date("2026-10-15T08:00:00Z");
  const doctor = {
    id: "doctor-1",
    practice_id: "practice-1",
    name: "Test Doctor",
    specialization: "General Medicine",
    phone: "123",
    present: true,
    on_leave: false,
  };
  const session = {
    id: "session-1",
    starts_at: "2026-10-16T03:30:00Z",
    ends_at: "2026-10-16T07:30:00Z",
    timezone: "Asia/Kolkata",
    service_mode: "clinic",
    state: "published",
  };
  const sessions = [{ practiceId: "practice-1", session }];

  const today = facilitySchedule([doctor], sessions, now, "2026-10-15");
  assert.equal(today.assignments.length, 0);
  assert.equal(today.departments.length, 0);
  assert.equal(today.nextScheduledDay, "2026-10-16");

  const tomorrow = facilitySchedule([doctor], sessions, now, "2026-10-16");
  assert.equal(tomorrow.assignments[0].name, "Test Doctor");
  assert.equal(tomorrow.departments[0].shifts[0].doctor, "Test Doctor");
});

test("home visit sessions also appear in the published schedule view", () => {
  const now = new Date("2026-10-15T08:00:00Z");
  const doctor = {
    id: "doctor-1",
    practice_id: "practice-1",
    name: "Test Doctor",
    specialization: "General Medicine",
    phone: "123",
    present: true,
    on_leave: false,
  };
  const session = {
    id: "home-1",
    starts_at: "2026-10-16T10:30:00Z",
    ends_at: "2026-10-16T11:30:00Z",
    timezone: "Asia/Kolkata",
    service_mode: "home",
    state: "published",
  };
  const view = facilitySchedule(
    [doctor],
    [{ practiceId: "practice-1", session }],
    now,
    "2026-10-16"
  );
  assert.equal(view.assignments.length, 1);
  assert.equal(view.departments[0].shifts.length, 1);
});

function loadScheduleView(name, mocks) {
  const exports = {};
  const file = path.join(
    __dirname,
    "../../src/features/doctors/components",
    name + ".tsx"
  );
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Date,
      Intl,
      require(name) {
        if (name in mocks) return mocks[name];
        throw Error("Unmocked import: " + name);
      },
    }
  );
  return exports;
}

function scheduleViewFixture(
  departments,
  selectedDay = "2026-11-02",
  nextScheduledDay = null
) {
  const changes = [];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { DoctorShiftGantt } = loadScheduleView("DoctorShiftGantt", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": "Link",
    "lucide-react": {},
    "@startup/web-ui/components/ui/button": { Button: "Button" },
    "@startup/web-ui/components/ui/input": { Input: "Input" },
    "../utils/facilitySchedule": { facilityDayKey: () => "2026-10-30" },
    "../utils/doctorSchedulesConstants": {
      scheduleTimeLabels: [
        "00:00",
        "04:00",
        "08:00",
        "12:00",
        "16:00",
        "20:00",
      ],
      shiftStyles: {
        "on-duty": { label: "Clinic", bar: "bg-primary", badge: "bg-muted" },
      },
    },
  });
  const flatten = (node) =>
    Array.isArray(node)
      ? node.flatMap(flatten)
      : node && typeof node === "object"
        ? [node, ...flatten(node.props?.children)]
        : [];
  const nodes = flatten(
    DoctorShiftGantt({
      departments,
      selectedDay,
      nextScheduledDay,
      onDayChange: (day) => changes.push(day),
    })
  );
  return { nodes, changes };
}

test("schedule timeline uses exact minutes and separate lanes for overlapping shifts", () => {
  const { nodes } = scheduleViewFixture([
    {
      department: "General",
      shifts: [
        {
          doctor: "A",
          time: "09:15-10:45",
          type: "on-duty",
          startCol: 3,
          spanCols: 1,
        },
        {
          doctor: "B",
          time: "09:30-11:00",
          type: "on-duty",
          startCol: 3,
          spanCols: 1,
        },
      ],
    },
  ]);
  assert.equal(nodes.filter((node) => node.type === "li").length, 2);
  const bars = nodes.filter((node) => node.props.style?.left !== undefined);
  const first = bars.find(
    (node) =>
      Math.abs(parseFloat(node.props.style.left) - (555 / 1440) * 100) < 0.00001
  );
  assert.ok(first);
  assert.equal(parseFloat(first.props.style.width), 6.25);
});

test("schedule date controls retain today, tomorrow, custom date and next scheduled day actions", () => {
  const { nodes, changes } = scheduleViewFixture(
    [],
    "2026-10-30",
    "2026-11-03"
  );
  assert.equal(
    nodes.find((node) => node.props["aria-label"] === "Previous schedule day")
      .props.disabled,
    true
  );
  nodes
    .find((node) => node.props["aria-label"] === "Next schedule day")
    .props.onClick();
  assert.equal(changes.at(-1), "2026-10-31");
  nodes.find((node) => node.props.children === "Tomorrow").props.onClick();
  assert.equal(changes.at(-1), "2026-10-31");
  nodes.find((node) => node.props.children === "Today").props.onClick();
  assert.equal(changes.at(-1), "2026-10-30");
  const input = nodes.find((node) => node.type === "Input");
  input.props.onChange({ target: { value: "2026-11-05" } });
  assert.equal(changes.at(-1), "2026-11-05");
  input.props.onChange({ target: { value: "2026-10-29" } });
  assert.equal(changes.at(-1), "2026-11-05");
  nodes
    .find(
      (node) =>
        Array.isArray(node.props.children) &&
        node.props.children[0] === "View next scheduled day: "
    )
    .props.onClick();
  assert.equal(changes.at(-1), "2026-11-03");
});
