import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, require = () => undefined, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require, Error, TypeError, Set, String, JSON, ...globals }
  );
  return exports;
}

const contracts = load("../../contracts/src/errors.ts");

const monitoring = load("../src/monitoring/errorReporting.ts", (name) =>
  name === "@startup/contracts" ? contracts : undefined
);

test("reports unexpected faults with context and skips expected outcomes", () => {
  const reports = [];
  monitoring.setErrorReporter((error, context) =>
    reports.push({ error, context })
  );
  const fault = Object.assign(new Error("relation missing"), {
    code: "42P01",
  });
  monitoring.reportError(fault, { source: "query" });
  monitoring.reportError(
    Object.assign(new Error("Pick a day"), { code: "22023" })
  );
  monitoring.reportError(new TypeError("Network request failed"));
  monitoring.reportError(Object.assign(new Error("late"), { code: "TIMEOUT" }));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].error, fault);
  assert.equal(reports[0].context.source, "query");
  monitoring.setErrorReporter(null);
});

test("a failing sink never breaks the caller, and no sink drops reports", () => {
  monitoring.setErrorReporter(() => {
    throw new Error("sink down");
  });
  assert.doesNotThrow(() => monitoring.reportError(new Error("boom")));
  monitoring.setErrorReporter(null);
  assert.doesNotThrow(() => monitoring.reportError(new Error("boom")));
});

test("scrubbing removes emails, phone numbers and credentials, deeply", () => {
  const text = monitoring.scrubSensitiveText(
    "asha@example.com +91 98765 43210 Bearer abc.def eyJhbGciOi.eyJzdWIiOi.c2ln"
  );
  assert.equal(text.includes("asha@example.com"), false);
  assert.equal(text.includes("98765"), false);
  assert.equal(text.includes("abc.def"), false);
  assert.equal(text.includes("eyJhbGciOi"), false);
  const event = monitoring.scrubEventData({
    event: "$exception",
    properties: { $exception_list: [{ value: "failed for asha@example.com" }] },
    count: 3,
  });
  assert.equal(event.properties.$exception_list[0].value, "failed for [email]");
  assert.equal(event.count, 3);
});

function loadTimeout() {
  return load("../src/client/timeoutFetch.ts", () => undefined, {
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
  });
}

test("requests past their deadline reject with a TIMEOUT error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { createTimeoutFetch } = loadTimeout();
  const hanging = (_input, init) =>
    new Promise((_, reject) =>
      init.signal.addEventListener("abort", () =>
        reject(new Error("The operation was aborted"))
      )
    );
  const pending = createTimeoutFetch(hanging)(
    "https://x.supabase.co/rest/v1/a"
  );
  t.mock.timers.tick(20_000);
  await assert.rejects(pending, (error) => {
    assert.equal(error.code, "TIMEOUT");
    assert.equal(contracts.isTimeoutError(error), true);
    return true;
  });
});

test("storage and functions get longer deadlines; a caller abort is honoured", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { createTimeoutFetch } = loadTimeout();
  let aborted = false;
  const slow = (_input, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
      setTimeout(() => resolve("ok"), 60_000);
    });
  const upload = createTimeoutFetch(slow)(
    "https://x.supabase.co/storage/v1/object/a"
  );
  t.mock.timers.tick(60_000);
  assert.equal(await upload, "ok");
  assert.equal(aborted, false);

  const controller = new AbortController();
  const read = createTimeoutFetch(slow)("https://x.supabase.co/rest/v1/a", {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(read, (error) => error.code !== "TIMEOUT");
  assert.equal(aborted, true);
});
