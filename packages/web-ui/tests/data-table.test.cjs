const { test } = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const path = require("node:path");

const vm = require("node:vm");

const ts = require("typescript");

function fixture() {
  const values = [];
  let cursor = 0;
  let options;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [
        values[index],
        (next) => {
          values[index] =
            typeof next === "function" ? next(values[index]) : next;
        },
      ];
    },
  };
  const table = {
    getCoreRowModel: () => "core",
    getPaginationRowModel: () => "pagination",
    getSortedRowModel: () => "sorting",
    useReactTable: (value) => {
      options = value;
      return value;
    },
  };
  const module = { exports: {} };
  const file = path.join(__dirname, "../src/hooks/use-data-table.ts");
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require: (name) => {
      if (name === "react") return react;
      if (name === "@tanstack/react-table") return table;
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    render(props = {}) {
      cursor = 0;
      module.exports.useDataTable({ columns: [], data: [], ...props });
      return options;
    },
  };
}

test("uncontrolled table retains sorting and pagination across renders", () => {
  const f = fixture();
  let table = f.render();
  assert.equal(table.state.pagination.pageSize, 10);
  table.onPaginationChange((previous) => ({ ...previous, pageIndex: 2 }));
  table.onSortingChange([{ id: "name", desc: true }]);
  table = f.render();
  assert.equal(table.state.pagination.pageIndex, 2);
  assert.equal(table.state.sorting[0].id, "name");
  assert.equal(table.state.sorting[0].desc, true);
});

test("controlled pagination and sorting preserve caller values and callbacks", () => {
  const pagination = { pageIndex: 3, pageSize: 20 };
  const sorting = [{ id: "fee", desc: false }];
  const changes = [];
  const onPaginationChange = (value) => changes.push(value);
  const onSortingChange = (value) => changes.push(value);
  const table = fixture().render({
    pagination,
    sorting,
    onPaginationChange,
    onSortingChange,
  });
  assert.equal(table.state.pagination, pagination);
  assert.equal(table.state.sorting, sorting);
  assert.equal(table.onPaginationChange, onPaginationChange);
  assert.equal(table.onSortingChange, onSortingChange);
});

test("a value without its change handler retains the existing uncontrolled fallback", () => {
  const table = fixture().render({
    pagination: { pageIndex: 9, pageSize: 2 },
    sorting: [{ id: "name" }],
  });
  assert.equal(table.state.pagination.pageIndex, 0);
  assert.equal(table.state.pagination.pageSize, 10);
  assert.equal(table.state.sorting.length, 0);
});

test("manual modes retain server data and skip client pagination and sorting models", () => {
  const data = [{ id: "one" }];
  const columns = [{ id: "id" }];
  const table = fixture().render({
    data,
    columns,
    pageCount: 7,
    rowCount: 140,
    manualPagination: true,
    manualSorting: true,
  });
  assert.equal(table.data, data);
  assert.equal(table.columns, columns);
  assert.equal(table.pageCount, 7);
  assert.equal(table.rowCount, 140);
  assert.equal(table.getCoreRowModel, "core");
  assert.equal(table.getPaginationRowModel, undefined);
  assert.equal(table.getSortedRowModel, undefined);
  const automatic = fixture().render();
  assert.equal(automatic.getPaginationRowModel, "pagination");
  assert.equal(automatic.getSortedRowModel, "sorting");
});

test("column sizing retains page, sorting and stable row IDs", () => {
  const f = fixture();
  const getRowId = (row) => row.id;
  let table = f.render({ getRowId, enableColumnResizing: true });
  table.onPaginationChange({ pageIndex: 2, pageSize: 10 });
  table.onSortingChange([{ id: "name", desc: false }]);
  table.onColumnSizingChange({ name: 240, status: 120 });
  table = f.render({ getRowId, enableColumnResizing: true });
  assert.equal(table.state.columnSizing.name, 240);
  assert.equal(table.state.pagination.pageIndex, 2);
  assert.equal(table.state.sorting[0].id, "name");
  assert.equal(table.getRowId, getRowId);
  assert.equal(table.columnResizeMode, "onChange");
  assert.equal(table.enableColumnResizing, true);
});

test("native mouse and touch resizing update widths without moving columns", () => {
  const { createTable, getCoreRowModel } = require("@tanstack/react-table");
  const table = createTable({
    columns: [
      { accessorKey: "name", size: 180, minSize: 100, maxSize: 400 },
      { accessorKey: "status", size: 160 },
    ],
    data: [{ name: "Doctor", status: "Active" }],
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    state: {
      columnSizing: {},
      columnSizingInfo: {
        startOffset: null,
        startSize: null,
        deltaOffset: null,
        deltaPercentage: null,
        isResizingColumn: false,
        columnSizingStart: [],
      },
      columnPinning: { left: [], right: [] },
    },
    onColumnSizingChange: (next) =>
      table.setOptions((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          columnSizing:
            typeof next === "function"
              ? next(previous.state.columnSizing)
              : next,
        },
      })),
    onColumnSizingInfoChange: (next) =>
      table.setOptions((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          columnSizingInfo:
            typeof next === "function"
              ? next(previous.state.columnSizingInfo)
              : next,
        },
      })),
  });
  const handlers = new Map();
  const doc = {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
  };
  let header = table.getHeaderGroups()[0].headers[0];
  header.getResizeHandler(doc)({ type: "mousedown", clientX: 100 });
  handlers.get("mousemove")({ clientX: 160 });
  assert.equal(table.getColumn("name").getSize(), 240);
  handlers.get("mouseup")({ clientX: 160 });
  assert.equal(handlers.size, 0);
  assert.deepEqual(
    table.getVisibleLeafColumns().map((column) => column.id),
    ["name", "status"]
  );
  assert.deepEqual(
    table
      .getRowModel()
      .rows[0].getVisibleCells()
      .map((cell) => cell.getValue()),
    ["Doctor", "Active"]
  );
  header = table.getHeaderGroups()[0].headers[0];
  header.getResizeHandler(doc)({
    type: "touchstart",
    touches: [{ clientX: 200 }],
  });
  handlers.get("touchmove")({
    touches: [{ clientX: 150 }],
    cancelable: true,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(table.getColumn("name").getSize(), 190);
  handlers.get("touchend")({
    touches: [],
    cancelable: true,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(handlers.size, 0);
  table.setColumnSizing({ name: 1000 });
  assert.equal(table.getColumn("name").getSize(), 400);
  table.setColumnSizing({ name: 1 });
  assert.equal(table.getColumn("name").getSize(), 100);
  table.getColumn("name").resetSize();
  assert.equal(table.getColumn("name").getSize(), 180);
});
