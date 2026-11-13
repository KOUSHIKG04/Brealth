// Test tooling shared by app suites that load source files with hand-written
// module mocks. It supplies the real client-safe error helpers and a silent
// monitoring sink, merged under whatever a test mocks explicitly.
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
    { exports, Error, TypeError, Set, String, JSON, console, crypto }
  );
  return exports;
}

const errorContracts = compile(path.join(__dirname, "../../src/errors.ts"));

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
    return { ...errorContracts, ...(mocks[name] ?? {}) };
  if (name === "@startup/data-access")
    return { ...dataAccessDoubles, ...(mocks[name] ?? {}) };
  return undefined;
}

module.exports = { errorContracts, withErrorDoubles, loadEdgeLogger };
