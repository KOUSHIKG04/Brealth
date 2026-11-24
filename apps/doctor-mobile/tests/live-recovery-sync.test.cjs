const { test } = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const vm = require("node:vm");

const ts = require("typescript");

function mount() {
  const invalidated = [],
    reports = [];
  let listener;
  let cleanup;
  let disconnects = 0;
  const exports = {};
  const mocks = {
    react: {
      useEffect: (fn) => {
        cleanup = fn();
      },
      useState: (initial) => [initial, () => {}],
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "react-native": {
      AppState: {
        currentState: "active",
        addEventListener: () => ({ remove() {} }),
      },
    },
    "@tanstack/react-query": {
      onlineManager: { isOnline: () => true },
      useQueryClient: () => ({
        invalidateQueries: ({ queryKey }) => {
          invalidated.push(queryKey[0]);
          return Promise.resolve();
        },
      }),
    },
    "@startup/data-access": {
      reportError: (error, context) => reports.push(context),
      subscribeAppChanges: (_client, _scope, handlers) => {
        listener = handlers;
        return () => disconnects++;
      },
    },
    "@startup/mobile-ui": { OfflineBanner: "OfflineBanner" },
    "./supabase": { supabase: {}, mobileSession: { refresh: async () => {} } },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        require.resolve("../src/services/LiveUpdatesBridge.tsx"),
        "utf8"
      ),
      {
        fileName: "LiveUpdatesBridge.tsx",
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }
    ).outputText,
    { exports, require: (name) => mocks[name], queueMicrotask }
  );
  const rendered = exports.LiveUpdatesBridge({ identityId: "doctor" });
  return {
    invalidated,
    reports,
    rendered,
    listener,
    cleanup: () => cleanup(),
    get disconnects() {
      return disconnects;
    },
  };
}

test("Facility policy changes refresh Doctor attendance deadlines and reschedule availability", async () => {
  const app = mount();
  app.listener.onChange({ kind: "schedule" });
  await new Promise(queueMicrotask);
  for (const key of [
    "my-doctor-schedule",
    "doctor-clinic-appointments",
    "doctor-reschedule-options",
  ])
    assert.ok(app.invalidated.includes(key), `${key} must refresh`);
  app.cleanup();
  assert.equal(app.disconnects, 1);
});

test("appointment changes refresh the Doctor replacement slots without resetting schedule data", async () => {
  const app = mount();
  app.listener.onChange({ kind: "appointments" });
  await new Promise(queueMicrotask);
  assert.ok(app.invalidated.includes("doctor-reschedule-options"));
  assert.ok(app.invalidated.includes("doctor-clinic-appointments"));
  assert.equal(app.invalidated.includes("my-doctor-schedule"), false);
  app.cleanup();
});

test("brief realtime drops are silent; a sustained outage reports once without a toast", () => {
  const app = mount();
  assert.equal(app.rendered.type, "OfflineBanner");
  assert.equal(app.rendered.props.visible, false);
  app.listener.onStatus("reconnecting", "identity-events:doctor");
  app.listener.onStatus("live", "identity-events:doctor");
  assert.equal(app.reports.length, 0);
  app.listener.onStatus("down", "identity-events:doctor");
  app.listener.onError();
  assert.equal(app.reports.length, 1);
  assert.equal(app.reports[0].source, "realtime");
  app.cleanup();
});
