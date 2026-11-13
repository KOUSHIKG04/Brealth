"use client";

import { useState } from "react";
import type { ClinicAppointment } from "@startup/contracts";
import { AppointmentRecoveryDialog } from "../components/AppointmentRecoveryDialog";
import { appointmentStatuses } from "../utils/appointmentsConstants";

import { useAppointments } from "../hooks/useAppointments";

import type { AppointmentsScreenProps } from "../types/appointmentsScreen";

import { Search, Calendar, ChevronDown, ScanLine } from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@startup/web-ui/components/ui/dialog";

import { AppointmentsSummaryCards } from "../components/AppointmentsSummaryCards";
import { AppointmentsTable } from "../components/AppointmentsTable";
import { NewAppointmentDialog } from "../components/NewAppointmentDialog";

export default function AppointmentsScreen({
  appointments,
  loadError,
}: AppointmentsScreenProps) {
  const [managedId, setManagedId] = useState<string | null>(null);
  const managed = appointments.find(
    (item: ClinicAppointment) => item.id === managedId
  );
  const {
    pending,
    reasonRequest,
    actionReason,
    setActionReason,
    actionError,
    submitReason,
    closeReason,
    search,
    setSearch,
    statusFilter,
    showPaymentHolds,
    setShowPaymentHolds,
    paymentHoldCount,
    setStatusFilter,
    now,
    showScanner,
    setShowScanner,
    checkinToken,
    setCheckinToken,
    videoRef,
    setCurrentPage,
    filterPeriod,
    setFilterPeriod,
    displayedAppointments,
    appointmentsSummary,
    appointmentsDateLabel,
    bookingDateLabel,
    pageRows,
    appointmentsPagination,
    act,
    stopCamera,
    submitCheckin,
    startCamera,
  } = useAppointments({ appointments, loadError });
  const hasFilters =
    search.trim() !== "" || statusFilter !== "All" || filterPeriod !== "All";
  const clearFilters = () => {
    setFilterPeriod("All");
    setStatusFilter("All");
    setSearch("");
    setCurrentPage(1);
  };
  return (
    <div className="flex min-w-0 flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-foreground shrink-0 text-2xl font-semibold tracking-tight">
              Appointments
            </h1>
            <p className="text-muted-foreground min-w-0 grow basis-80 text-sm leading-6">
              Bookings, patient check-ins and consultation status.
            </p>
          </div>
          <p
            suppressHydrationWarning
            className="text-muted-foreground flex items-center gap-1.5 text-xs"
          >
            <Calendar className="size-3.5" />
            Today, {appointmentsDateLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 [&>button]:min-h-10 [&>button]:text-sm">
          <Button
            type="button"
            variant="outline"
            aria-expanded={showScanner}
            onClick={() => {
              stopCamera();
              setShowScanner((current) => !current);
            }}
          >
            <ScanLine className="size-4" />
            {showScanner ? "Close scanner" : "Scan patient QR"}
          </Button>
          <NewAppointmentDialog
            triggerLabel="Add appointment"
            onCreated={clearFilters}
          />
        </div>
      </header>

      {showScanner ? (
        <section
          aria-label="Patient check-in"
          className="border-border bg-card rounded-lg border p-4"
        >
          <h2 className="text-foreground text-base font-semibold">
            Patient check-in
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Scan the QR shown in the Patient App for an app-booked clinic visit.
          </p>
          <video
            ref={videoRef}
            muted
            playsInline
            className="bg-foreground mt-3 max-h-64 w-full max-w-sm rounded-lg"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void startCamera()}
              disabled={pending}
            >
              Start camera
            </Button>
            <input
              aria-label="Check-in QR value"
              value={checkinToken}
              onChange={(event) => setCheckinToken(event.target.value)}
              placeholder="Paste QR value if camera is unavailable"
              className="border-input min-w-0 flex-1 basis-64 rounded-lg border px-3 py-2 text-sm"
            />
            <Button
              type="button"
              onClick={() => submitCheckin(checkinToken)}
              disabled={pending || !checkinToken.trim()}
            >
              Check in
            </Button>
          </div>
        </section>
      ) : null}

      {/* Summary Stat Cards Row */}
      <AppointmentsSummaryCards summary={appointmentsSummary} />
      <div
        className="flex flex-wrap items-center gap-3"
        aria-label="Booking views"
      >
        <Button
          variant={showPaymentHolds ? "outline" : "default"}
          aria-pressed={!showPaymentHolds}
          onClick={() => {
            setShowPaymentHolds(false);
            setCurrentPage(1);
          }}
        >
          Appointments
        </Button>
        <Button
          variant={showPaymentHolds ? "default" : "outline"}
          aria-pressed={showPaymentHolds}
          onClick={() => {
            setShowPaymentHolds(true);
            setCurrentPage(1);
          }}
        >
          Payment reservations ({paymentHoldCount})
        </Button>
        {showPaymentHolds ? (
          <p className="text-muted-foreground text-sm">
            Checkout holds are not confirmed appointments. Only verified payment
            confirms them.
          </p>
        ) : null}
      </div>

      {/* Recent Bookings Card & Table */}
      <AppointmentsTable
        onManage={(item) => setManagedId(item.id)}
        now={now}
        pageRows={pageRows}
        pending={pending}
        onAct={act}
        pagination={appointmentsPagination}
        onPageChange={setCurrentPage}
        displayedCount={displayedAppointments.length}
        filterPeriod={filterPeriod}
        onFilterPeriodChange={setFilterPeriod}
        bookingDateLabel={bookingDateLabel}
        filters={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="border-input bg-background focus-within:ring-ring/50 flex h-10 min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg border px-3 focus-within:ring-2">
              <Search className="text-muted-foreground size-4 shrink-0" />
              <input
                type="search"
                aria-label="Search patient, doctor..."
                placeholder="Search patient, doctor or ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="text-foreground placeholder:text-muted-foreground w-full min-w-0 bg-transparent text-sm outline-none"
              />
            </div>
            <div className="border-input bg-background focus-within:ring-ring/50 relative flex h-10 min-w-0 items-center gap-2 rounded-lg border px-3 focus-within:ring-2">
              <label
                htmlFor="appointment-status"
                className="text-muted-foreground text-sm"
              >
                Status
              </label>
              <select
                id="appointment-status"
                aria-label="Filter appointment status"
                className="text-foreground h-full w-40 min-w-0 appearance-none bg-transparent pr-5 text-sm outline-none"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {appointmentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute right-3 size-4"
              />
            </div>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-sm"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        }
      />
      <Dialog
        open={Boolean(reasonRequest)}
        onOpenChange={(open) => {
          if (!open) closeReason();
        }}
      >
        <DialogContent
          showCloseButton={!pending}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
        >
          <DialogTitle>
            {reasonRequest?.action === "hold"
              ? "Reason for holding this patient"
              : "Reason for rejecting this appointment"}
          </DialogTitle>
          <DialogDescription>
            {reasonRequest?.item.patient_name} · Appointment{" "}
            {reasonRequest?.item.public_code.slice(-8)}
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitReason();
            }}
          >
            <label className="block space-y-2 text-sm">
              <span>Reason</span>
              <textarea
                autoFocus
                required
                disabled={pending}
                maxLength={1000}
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                className="border-border bg-background focus-visible:outline-ring min-h-28 w-full rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </label>
            {actionError ? (
              <p role="alert" className="text-destructive text-sm">
                {actionError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={closeReason}
                className="min-h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || !actionReason.trim()}
                className="min-h-11"
              >
                {pending
                  ? "Updating…"
                  : reasonRequest?.action === "hold"
                    ? "Hold patient"
                    : "Reject appointment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {managed ? (
        <AppointmentRecoveryDialog
          key={managed.id}
          item={managed}
          onClose={() => setManagedId(null)}
        />
      ) : null}
    </div>
  );
}
