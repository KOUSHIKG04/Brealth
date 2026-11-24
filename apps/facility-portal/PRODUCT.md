# Facility portal

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Facility owners and administrators**: run a clinic or hospital, manage doctors, schedules, beds, team members, payouts and refunds.
- **Receptionists**: work the front desk for the doctors assigned to them: appointments, walk-ins, the clinic queue and cash collection.

## Product Purpose

The web workspace for a facility on the shared care network: it keeps the clinic day running (appointments, queue numbers, walk-ins and payments) and keeps doctor schedules, approvals and team access accurate.

## Operating Context

Used on desktop at a reception desk or office, often during a live clinic session with patients waiting. Reception staff switch between the appointment list, the queue and payment collection many times an hour, so status and next actions must be scannable at a glance.

## Capabilities and Constraints

- Next.js App Router application; shared UI from `@startup/web-ui`, domain rules from `@startup/contracts`, backend operations from `@startup/data-access`.
- Role-scoped areas: receptionists see only their permitted pages and doctors; the database enforces every permission.
- Implemented flows include the dashboard, appointments with dated groups and queue numbers, doctor management and schedules, schedule change approvals, bed management, transactions and reception payments, and team invitations.
- Browser verification of recent flows is pending; see `ARCHITECTURE.md`.

## Product Principles

1. **The desk comes first**: the next patient, their status and what to do next are always visible without hunting.
2. **Permissions are visible, not surprising**: what a role cannot do is absent or explained, never a failed click.
3. **Money is exact**: amounts, methods and refund states are unambiguous and never estimated.

## Accessibility & Inclusion

Keyboard-operable tables, dialogs and forms; readable contrast for long working sessions.
