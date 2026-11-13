"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { appointmentMoney } from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import { Input } from "@startup/web-ui/components/ui/input";
import { DataTable } from "@startup/web-ui/components/data-table";
import type { TransactionsScreenProps } from "../types/transactions";
import { useTransactions } from "../hooks/useTransactions";
import {
  transactionColumns,
  transactionStatusLabels,
} from "../utils/transactionsConstants";

export default function TransactionsScreen({
  initialPage,
  paymentPanel,
}: TransactionsScreenProps) {
  const {
    query,
    rows,
    search,
    setSearch,
    status,
    setStatus,
    method,
    setMethod,
    loadedCount,
  } = useTransactions(initialPage);
  const field =
    "border-input bg-background min-h-10 rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
  const data = rows.map((item) => ({
    id: item.id,
    cells: [
      <div key="date" className="space-y-1 px-3 py-4 text-sm">
        <p>
          {new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(item.created_at))}
        </p>
        <p className="text-muted-foreground text-xs">
          {item.mode === "test" ? "Test payment" : "Live payment"}
        </p>
        <details className="text-xs">
          <summary className="cursor-pointer">References</summary>
          <p className="break-all select-text">
            {item.payment_id ?? item.order_id ?? item.id}
          </p>
        </details>
      </div>,
      <div key="patient" className="space-y-1 px-3 py-4 text-sm">
        <p className="font-medium">{item.patient_name}</p>
        <p className="text-muted-foreground text-xs">
          {item.appointment_reference.slice(-8)}
        </p>
      </div>,
      <div key="doctor" className="space-y-1 px-3 py-4 text-sm">
        <p>{item.doctor_name}</p>
        <p className="text-muted-foreground text-xs">{item.facility_name}</p>
      </div>,
      <span key="method" className="px-3 text-sm">
        {item.method === "cash" ? "Cash" : "Razorpay"}
      </span>,
      <span key="status" className="px-3 text-sm">
        {item.status === "captured" && item.refunded_minor === item.amount_minor
          ? "Refunded"
          : item.status === "captured" && item.refunded_minor > 0
            ? "Partially refunded"
            : transactionStatusLabels[item.status]}
      </span>,
      <div
        key="amount"
        className="space-y-1 px-3 py-4 text-right text-sm tabular-nums"
      >
        <p className="font-medium">{appointmentMoney(item.amount_minor)}</p>
        {item.refunded_minor > 0 ? (
          <p className="text-muted-foreground text-xs">
            Returned {appointmentMoney(item.refunded_minor)}
          </p>
        ) : null}
      </div>,
      <Button key="manage" asChild variant="outline" size="sm">
        <Link href={`/transactions?appointment=${item.appointment_id}`}>
          View payment
        </Link>
      </Button>,
    ],
  }));
  return (
    <div className="flex min-w-0 flex-col gap-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-muted-foreground text-sm">
            Consultation collections, payment attempts and returned amounts.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </header>
      {paymentPanel ? (
        <section
          aria-label="Selected appointment payment"
          className="max-w-2xl space-y-3"
        >
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold">Appointment payment</h2>
            <Link
              href="/transactions"
              className="text-primary text-sm underline underline-offset-4"
            >
              Close payment
            </Link>
          </div>
          {paymentPanel}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          To collect payment for a new walk-in, add an appointment or open an
          existing booking’s payment.
        </p>
      )}
      <section
        className="border-border bg-card space-y-4 rounded-xl border p-4 sm:p-5"
        aria-label="Transaction history"
      >
        <div className="flex flex-wrap gap-3">
          <Input
            aria-label="Search loaded transactions"
            placeholder="Search loaded transactions…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-48 flex-1"
          />
          <select
            aria-label="Payment status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={field}
          >
            <option value="all">All statuses</option>
            {Object.entries(transactionStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Payment method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className={field}
          >
            <option value="all">All methods</option>
            <option value="gateway">Razorpay</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <p className="text-muted-foreground text-xs">
          Showing {rows.length} of {loadedCount} loaded transactions. Pending
          and failed attempts are not received money.
        </p>
        {query.isError ? (
          <p role="alert" className="text-destructive text-sm">
            Could not load transactions. Use Refresh to retry.
          </p>
        ) : null}
        <DataTable
          columns={transactionColumns}
          data={data}
          isLoading={query.isPending}
          hidePagination
          enableColumnResizing
          getRowId={(row) => row.id}
          emptyMessage="No transactions match this view. Payments appear here once checkout is started or cash is recorded."
        />
        {query.hasNextPage ? (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load older transactions"}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
