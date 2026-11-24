"use client";

import { Fragment, useEffect, useRef } from "react";
import type { DisplayTableRow } from "../types/dataTable";
import type { ColumnDef } from "@tanstack/react-table";
import { useDataTable } from "../hooks/use-data-table";
import type { DataTableProps } from "../types/dataTable";
import { flexRender } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export type { DataTableProps } from "../types/dataTable";

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  loadingRowCount = 5,
  emptyState,
  emptyMessage = "No results found.",
  className,
  tableClassName,
  cellClassName,
  bare = false,
  enableColumnResizing = false,
  getRowId,
  pageCount,
  rowCount,
  pagination,
  onPaginationChange,
  manualPagination = false,
  sorting,
  onSortingChange,
  manualSorting = false,
  onRowClick,
  hidePagination = false,
  groupBy,
}: DataTableProps<TData, TValue>) {
  const table = useDataTable({
    columns,
    data,
    pageCount,
    rowCount,
    pagination,
    onPaginationChange,
    manualPagination,
    sorting,
    onSortingChange,
    manualSorting,
    getRowId,
    enableColumnResizing,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  useEffect(() => {
    if (!enableColumnResizing || !containerRef.current) return;
    const fit = (width: number) => {
      if (width <= 0 || fitted.current) return;
      fitted.current = true;
      const columns = table.getVisibleLeafColumns();
      const total = table.getTotalSize();
      if (width <= total) return;
      table.setColumnSizing((previous) =>
        Object.keys(previous).length
          ? previous
          : Object.fromEntries(
              columns.map((column) => [
                column.id,
                Math.min(
                  column.columnDef.maxSize ?? 640,
                  Math.round((column.getSize() * width) / total)
                ),
              ])
            )
      );
    };
    fit(containerRef.current.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      fit(entries[0].contentRect.width)
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [enableColumnResizing, table]);

  return (
    <div className={cn("w-full min-w-0 space-y-3", className)}>
      <div
        ref={containerRef}
        className={cn(
          "overflow-hidden",
          !bare && "border-border bg-card rounded-xl border shadow-2xs"
        )}
      >
        <Table
          className={cn(
            "w-full text-sm",
            tableClassName,
            enableColumnResizing && "min-w-0 table-fixed"
          )}
          style={
            enableColumnResizing ? { width: table.getTotalSize() } : undefined
          }
        >
          {enableColumnResizing ? (
            <colgroup>
              {table.getVisibleLeafColumns().map((column) => (
                <col key={column.id} style={{ width: column.getSize() }} />
              ))}
            </colgroup>
          ) : null}
          <TableHeader className="border-border bg-background border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-border hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "text-muted-foreground relative px-4 py-3 text-xs",
                        enableColumnResizing && "overflow-hidden",
                        enableColumnResizing
                          ? "font-medium whitespace-nowrap"
                          : "font-bold tracking-wider uppercase"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-1.5 pr-2">
                        {enableColumnResizing &&
                        !header.isPlaceholder &&
                        header.column.getCanResize() ? (
                          <button
                            type="button"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={
                              "Resize " +
                              (typeof header.column.columnDef.header ===
                              "string"
                                ? header.column.columnDef.header
                                : header.column.id) +
                              " column"
                            }
                            aria-valuenow={header.column.getSize()}
                            aria-valuemin={
                              header.column.columnDef.minSize ?? 80
                            }
                            aria-valuemax={
                              header.column.columnDef.maxSize ?? 640
                            }
                            title="Slide to resize; double-click to reset"
                            className={cn(
                              "hover:after:bg-primary focus-visible:ring-ring after:bg-border absolute inset-y-0 right-0 z-10 w-3 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:right-0 after:w-px focus-visible:ring-2",
                              header.column.getIsResizing() &&
                                "after:bg-primary"
                            )}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              header.getResizeHandler()(event);
                            }}
                            onTouchStart={(event) => {
                              event.stopPropagation();
                              header.getResizeHandler()(event);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={() => header.column.resetSize()}
                            onKeyDown={(event) => {
                              const size = header.column.getSize(),
                                min = header.column.columnDef.minSize ?? 80,
                                max = header.column.columnDef.maxSize ?? 640;
                              const next =
                                event.key === "ArrowLeft"
                                  ? size - 16
                                  : event.key === "ArrowRight"
                                    ? size + 16
                                    : event.key === "Home"
                                      ? min
                                      : event.key === "End"
                                        ? max
                                        : null;
                              if (next === null) return;
                              event.preventDefault();
                              event.stopPropagation();
                              table.setColumnSizing((previous) => ({
                                ...previous,
                                [header.column.id]: Math.max(
                                  min,
                                  Math.min(max, next)
                                ),
                              }));
                            }}
                          />
                        ) : null}
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="hover:text-foreground -ml-1 flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 transition-colors select-none"
                          >
                            <span
                              className="truncate"
                              title={
                                typeof header.column.columnDef.header ===
                                "string"
                                  ? header.column.columnDef.header
                                  : undefined
                              }
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </span>
                            {isSorted === "asc" ? (
                              <ArrowUp className="text-primary size-3" />
                            ) : isSorted === "desc" ? (
                              <ArrowDown className="text-primary size-3" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-40 hover:opacity-100" />
                            )}
                          </button>
                        ) : (
                          <span
                            className="min-w-0 truncate"
                            title={
                              typeof header.column.columnDef.header === "string"
                                ? header.column.columnDef.header
                                : undefined
                            }
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </span>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody className="divide-border divide-y">
            {isLoading ? (
              Array.from({ length: loadingRowCount }).map((_, rIdx) => (
                <TableRow
                  key={`skeleton-row-${rIdx}`}
                  className="hover:bg-transparent"
                >
                  {columns.map((_, cIdx) => (
                    <TableCell
                      key={`skeleton-cell-${cIdx}`}
                      className="px-4 py-3.5"
                    >
                      <Skeleton className="bg-muted h-4 w-[75%] rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index, rows) => {
                const group = groupBy?.(row.original);
                const previous =
                  index > 0 ? groupBy?.(rows[index - 1].original) : undefined;
                const startsGroup = group && group.key !== previous?.key;
                return (
                  <Fragment key={row.id}>
                    {startsGroup ? (
                      <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableCell
                          colSpan={columns.length}
                          className="text-foreground px-4 py-2 text-xs font-semibold"
                        >
                          {group.label}
                        </TableCell>
                      </TableRow>
                    ) : null}
                    <TableRow
                      data-state={row.getIsSelected() && "selected"}
                      tabIndex={onRowClick ? 0 : undefined}
                      role={onRowClick ? "button" : undefined}
                      onClick={() => onRowClick?.(row.original)}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onRowClick(row.original);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        "border-border hover:bg-muted/70 transition-colors",
                        onRowClick &&
                          "focus-visible:ring-primary focus-visible:ring-primary focus-visible:ring-offset-background cursor-pointer focus-visible:ring-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "text-foreground px-4 py-3 align-middle",
                            enableColumnResizing && "overflow-hidden",
                            cellClassName
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-36 py-8 text-center"
                >
                  {emptyState ? (
                    emptyState
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <p className="text-muted-foreground text-sm font-medium">
                        {emptyMessage}
                      </p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {!hidePagination && (
        <div className="text-muted-foreground flex flex-col items-center justify-between gap-3 px-1 py-1 text-xs sm:flex-row">
          <div className="flex items-center gap-2">
            {(() => {
              const totalEntries = manualPagination
                ? rowCount !== undefined
                  ? rowCount
                  : (pageCount || 1) * table.getState().pagination.pageSize
                : data.length;
              const startEntry =
                table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                (table.getRowModel().rows.length > 0 ? 1 : 0);
              const endEntry = Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                totalEntries
              );

              return (
                <span>
                  Showing{" "}
                  <span className="text-foreground font-semibold">
                    {startEntry}
                  </span>{" "}
                  to{" "}
                  <span className="text-foreground font-semibold">
                    {endEntry}
                  </span>{" "}
                  of{" "}
                  <span className="text-foreground font-semibold">
                    {totalEntries}
                  </span>{" "}
                  entries
                </span>
              );
            })()}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="border-border text-muted-foreground hover:bg-muted h-8 w-8 p-0 disabled:opacity-40"
              title="First page"
            >
              <ChevronsLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="border-border text-muted-foreground hover:bg-muted h-8 px-2.5 text-xs disabled:opacity-40"
            >
              <ChevronLeft className="mr-1 size-3.5" />
              Previous
            </Button>

            <span className="text-foreground px-2 font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount() || 1}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="border-border text-muted-foreground hover:bg-muted h-8 px-2.5 text-xs disabled:opacity-40"
            >
              Next
              <ChevronRight className="ml-1 size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="border-border text-muted-foreground hover:bg-muted h-8 w-8 p-0 disabled:opacity-40"
              title="Last page"
            >
              <ChevronsRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function createDisplayColumns(
  headers: readonly (readonly [string, string, number?, number?])[]
): ColumnDef<DisplayTableRow>[] {
  return headers.map(([id, header, size, minSize], index) => ({
    id,
    header,
    enableSorting: false,
    ...(size === undefined ? {} : { size }),
    ...(minSize === undefined ? {} : { minSize }),
    cell: ({ row }) => row.original.cells[index],
  }));
}
