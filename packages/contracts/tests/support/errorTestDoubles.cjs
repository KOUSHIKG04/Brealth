// Test tooling shared by app suites that load source files with hand-written
// module mocks. It supplies real client-safe contracts helpers (errors, dates,
// queue numbers) and a silent monitoring sink, merged under whatever a test
// mocks explicitly.
const fs = require("node:fs");

const path = require("node:path");

const vm = require("node:vm");

// Resolve TypeScript from the app running the tests (contracts has no copy).
const ts = require(require.resolve("typescript", { paths: [process.cwd()] }));

function compile(file) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Error,
      TypeError,
      Set,
      String,
      Number,
      Math,
      JSON,
      Date,
      Intl,
      console,
      crypto,
    }
  );
  return exports;
}

const errorContracts = compile(path.join(__dirname, "../../src/errors.ts"));

// Import-free date helpers, compiled from source.
const dateContracts = compile(path.join(__dirname, "../../src/utils/dates.ts"));

// clinic.ts imports zod, so its one-line queue-number rule is mirrored here.
const queueContracts = {
  appointmentQueueNumber: (item) =>
    item.ticket_number ?? item.clinic_queue?.planned_number ?? null,
};

const sharedContracts = {
  ...errorContracts,
  ...dateContracts,
  ...queueContracts,
};

const dataAccessDoubles = {
  reportError() {},
  setErrorReporter() {},
  scrubSensitiveText: (text) => text,
  scrubEventData: (value) => value,
};

/** Real Edge Function logger with console output captured by the caller. */
function loadEdgeLogger(consoleDouble) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, "../../../../supabase/functions/_shared/log.ts"),
        "utf8"
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    { exports, console: consoleDouble, crypto, Date, JSON, Error, String }
  );
  return exports;
}

/**
 * Returns the merged module for shared error dependencies, or undefined for
 * any other import so the test's own resolution continues unchanged.
 */
function withErrorDoubles(name, mocks = {}) {
  if (name === "@startup/contracts")
    return { ...sharedContracts, ...(mocks[name] ?? {}) };
  if (name === "@startup/data-access")
    return { ...dataAccessDoubles, ...(mocks[name] ?? {}) };
  return undefined;
}

module.exports = { errorContracts, withErrorDoubles, loadEdgeLogger };
