import type * as React from "react";
import type {
  ColumnDef,
  SortingState,
  PaginationState,
  OnChangeFn,
  TableOptions,
} from "@tanstack/react-table";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  loadingRowCount?: number;
  emptyState?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
  tableClassName?: string;
  cellClassName?: string;
  bare?: boolean;
  enableColumnResizing?: boolean;
  getRowId?: TableOptions<TData>["getRowId"];
  // Controlled pagination
  pageCount?: number;
  rowCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  manualPagination?: boolean;
  // Controlled sorting
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
  // Row click
  onRowClick?: (row: TData) => void;
  /**
   * Optional grouping: a full-width header row is rendered before each row
   * whose group key differs from the previous row's. Data must already be
   * sorted by group.
   */
  groupBy?: (row: TData) => { key: string; label: React.ReactNode } | undefined;
  // Header / Footer slot
  hidePagination?: boolean;
}

export type DisplayTableRow = { id: string; cells: React.ReactNode[] };
