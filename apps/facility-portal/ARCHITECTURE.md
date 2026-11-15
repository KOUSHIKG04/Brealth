# Facility portal architecture

## Team, roles and invitations

`features/team` owns the Team page (`/team`) and the invitation landing page
(`/invite/[token]`, in the auth group). Owners and administrators invite by
link (shown once, bound to the invited email, 7 days), switch members between
facility admin and receptionist, set a receptionist's doctors and deactivate
members. `server/auth/facilityAccess.ts` adds `getFacilityRoles` and
`requirePortalArea`; the admin layout passes the role's areas
(`portalAreaMinimumRank` in contracts) to the sidebar, and admin-only pages
redirect receptionists to Appointments. Login and sign-up keep a validated
`?next=/invite/...` return path. The database enforces every permission.
Local change; browser verification pending.

## Doctor schedule requests

`features/doctors/components/ScheduleChangeRequests` lists doctors' pending
schedule, time-off and policy requests on Doctor Schedules (compact count on
the dashboard), with current versus requested values. Approving a schedule
request previews it first; conflicts or affected bookings reuse
`ScheduleConflictDialog`. Declining requires a reason. Server Actions in
`server/scheduleActions.ts` return `{ ok, code, error }`; the database checks
the owner/administrator role. Local change; browser verification pending.

## Appointment dates and queue numbers

Queue numbers restart per doctor session and clinic day. "Tomorrow", "Next 7
days" and "All dates" group rows under clinic-date headers (the shared
`DataTable` `groupBy` option) and show the date in the Time column; "Today" is
unchanged. The token column shows `#n` from `appointmentQueueNumber` (issued
ticket, else the hybrid queue's reserved number). Date filters, sorting and
groups all use the appointment's clinic timezone (`localDateKey`). Local change;
browser verification pending.

## Reception payments and transactions

`/transactions` composes `features/transactions` with the public appointment payment
panel. The feature owns paginated transaction history, loaded-record search,
method/status filters and retry states. Server Actions require an approved facility;
the shared RPC restricts each transaction to an authorized financial manager. The
sidebar uses the rupee icon. Receipts retain full selectable provider references;
appointment references display their final eight characters.

Reception registration offers Razorpay or cash already received. Paid visits first
reserve capacity for up to ten minutes without confirmation or a queue entry.
Razorpay opens after the registration dialog finishes closing; server-verified
capture confirms the appointment, then reception can check the patient in. Cash
receipt and booking confirmation commit atomically through the shared RPC. Closing
checkout keeps only a resumable payment reservation. Free visits confirm directly.
The existing cash collection remains available. Razorpay checkout loads on demand,
uses server-created amounts/orders, requires patient terms consent and reports
received money only after server verification/capture. Checkout runs outside the
appointment dialog to avoid modal focus/pointer locks. Closing checkout
reconciles status and preserves the reservation. No provider secret is sent to
the browser. Existing refunds/payouts retain their owners.

Payment/refund terms use an info dialog; cash and refund notes appear only in the
selected action's confirmation dialog. Accepted percentages are formatted by the
backend. Facility verification remains available after approval, showing the
facility selector and document review instead of redirecting to Dashboard.

The default appointment table excludes unfinished/ended payment holds; the
separate Payment reservations view preserves their audit visibility. Summary totals
exclude these holds. Payment labels come from authorized batched billing summaries,
so a confirmed staff booking can clearly show Payment due. Rows sort by clinic date
and numeric queue token before pagination; absent tokens sort last within the date.
This presentation order does not replace backend call eligibility. Registration,
verification, cash updates and live signals refresh transaction history.

`20261031105135_facility_reception_checkout_and_transactions.sql` was applied to the
linked test backend on 31 October 2026 after rollback verification of staff checkout,
policy versions, order-attempt reuse, capture, cross-user access and stable pagination.
Web changes are local source changes; hosted web deployment and visible provider
checkout acceptance remain separate. Windows browser inspection stopped because
the tool could not reliably identify the active URL.

`20261031131143_reception_pay_before_confirmation.sql` was applied to the linked
test backend on 31 October 2026. Hosted rollback checks cover unpaid/authorized
holds, capture confirmation, cash acknowledgement/consent and receipt idempotency.
Real provider checkout and hosted frontend deployment remain separate checks.
The payment panel and terms/cash dialogs passed an isolated headless Edge check at
1280px and 390px with the actual components/styles and synthetic cached billing.
There was no horizontal overflow or browser runtime error; cash confirmation
required both acknowledgement and a note. The authenticated dev-server page timed
out, so these captures do not establish the full live Razorpay booking flow.

## Smooth schedule updates

`useFacilityDoctorSchedule` stores the merge base with its edits and uses the same
contracts merge, checked publication, busy-block hint and suggested start date
as Doctor mobile. Schedule Server Actions return `{ ok, code, error }` results
instead of throwing, because production Server Action errors lose their SQLSTATE.
`listFacilityDoctorBusyBlocks` and `publishPreviewedFacilityDoctorSchedule` keep
the `authorizedPractice` boundary. The portal's former `utils/scheduleDraft.ts`
was replaced by the shared `preferencesToScheduleSettings`. Local source changes
only; the migration and browser behavior are unverified.

## Schedule conflict review

Doctor schedule editors use authorized preview and publication Server Actions.
The shared backend returns conflicts and remaining hours; the dialog requires an
explicit replacement confirmation. Replacement is transactional, permission-scoped
and protected against stale previews and bookings arriving after review. Active
reservations require explicit rescheduling requests; payment holds block replacement.
Persistent notices in Manage Schedule/editor link to services needing new hours
or review. Existing schedule live signals refresh these notices; publishing the
affected service clears them. The migration was applied to the test project on 30 October 2026; hosted rollback
checks passed. Browser acceptance remains separate.

## Hybrid clinic queue

Appointments consume the shared `clinic_queue` projection: reserved tokens, ready
counts, current service, estimates and late-arrival review all use backend rules.
Call controls respect server eligibility, and Resume explicitly admits reviewed
late arrivals to an available opening. Clinic grace is editable beside existing
recovery settings through the same authorized Server Action. Reception can use a
currently open window after migration, while expired windows remain unavailable.
Existing live invalidation and visible-page refresh update time-sensitive queue
metadata. The test migration and hosted rollback checks passed on 30 October
2026; browser/device workflow verification remains pending.

Manage appointment displays a home visit's booked address, instructions and optional
receiver contact from the shared authorized appointment projection. Home payment
reservations use the existing awaiting-payment and approval controls. Hosted web
deployment and native checkout verification remain separate from source changes.

The admin uses Next.js App Router with feature-based modules. Routes compose
features; features own business UI and admin-specific server operations. The
dashboard is available at `/` and `/dashboard`. Appointments and login have their
own feature screens, as do bed management, doctor management and doctor schedules.
Each implemented feature exposes its supported entry points through `index.ts`.

## Folder ownership

| Folder                       | Responsibility                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `src/app`                    | Next.js routes, layouts, metadata, loading and error boundaries                 |
| `src/app/(admin)`            | Thin route adapters and one shared admin layout                                 |
| `src/app/(auth)`             | Login, signup and facility-verification route adapters, outside the admin shell |
| `src/features/dashboard`     | Dashboard composition, appointment acceptance and live update coordination      |
| `src/features/auth`          | Login/signup UI, action state, logout and server auth actions                   |
| `src/features/doctors`       | Doctor directory, schedules, add-doctor UI, feature hooks, types and constants  |
| `src/features/appointments`  | Appointment screen, record types, demo rows and filter/summary constants        |
| `src/features/facilities`    | Bed management screen, allocation hook, types and constants                     |
| `src/components/admin`       | Shared admin layout, sidebar and reusable navigation components                 |
| `src/components/admin/utils` | Shell-owned navigation, brand and demo-user constants                           |
| `src/server/auth`            | Approved-facility access checks                                                 |
| `src/lib/supabase`           | Request-scoped server client, cookie proxy and public config                    |
| `src/lib`                    | Small cross-feature helpers and browser/server client configuration             |
| `src/providers`              | Existing query provider                                                         |

Dispatch, staff administration and additional observability remain future work.
Their obsolete empty scaffolds have been removed; add folders with implementation.

Route groups do not add URL segments. The admin routes require an authenticated
account with a company-verified facility. Accounts without approval go to
`/facility-verification` to register, submit their registration certificate and
operating licence, or wait for review. Facility RPCs still authorize each
operation by membership; bed inventory also requires a verified facility at the
database boundary. The portal uses email/password Auth with cookie refresh in
`src/proxy.ts`.

| URL                  | Feature screen                                |
| -------------------- | --------------------------------------------- |
| `/`, `/dashboard`    | `dashboard/screens/DashboardScreen.tsx`       |
| `/appointments`      | `appointments/screens/AppointmentsScreen.tsx` |
| `/bed-management`    | `facilities/screens/BedManagementScreen.tsx`  |
| `/doctor-management` | `doctors/screens/DoctorManagementScreen.tsx`  |
| `/doctor-schedules`  | `doctors/screens/DoctorSchedulesScreen.tsx`   |
| `/login`             | `auth/screens/LoginScreen.tsx`                |

The admin shell is mounted once in `(admin)/layout.tsx`, so its sidebar state is
preserved during navigation between admin pages. Do not wrap individual screens
or route pages in a second admin layout. Login has no admin sidebar.

## Adding a feature

Use this shape as needed; do not create unused abstraction layers:

```text
features/appointments/
  index.ts
  screens/AppointmentsScreen.tsx
  components/AppointmentTable.tsx
  server/queries.ts
  server/actions.ts
  hooks/
  types/appointments.ts
  utils/appointmentsConstants.ts
```

Regression tests live under `tests/unit`; the architecture checker and shared test
tools live under `scripts`. Do not add test files to runtime feature folders.

Keep `page.tsx` thin: parse route/search parameters, invoke an authorized query
when needed, and compose the feature screen. Server Components are the default;
use `"use client"` only for interactive components. Add route loading/error states
when asynchronous operations exist and their screen requirements are known.

Keep server queries and mutations in the feature's `server` directory. Server-only
query entry points use `server-only` guards; action files retain `"use server"`.
Actions must
validate inputs and check authorization themselves. Do not export server modules
through a barrel also consumed by Client Components. Use Server Actions for web
mutations and Route Handlers only when an HTTP interface is needed.

## Dependency boundaries

- Routes import features and shared code; features never import routes.
- Routes import the feature's public `index.ts`, not its internal screen path.
- Features own their components, hooks, local validation and display types.
- Features do not import other features. Compose workflows at the route boundary:
  the dashboard routes pass the doctors feature's `AddDoctorAction` as a ReactNode
  slot into `DashboardScreen`. The action owns its dialog and client state, while
  dashboard stays a Server Component. Keep feature public exports deliberate.
- `src/components` contains presentation shared across admin features; generic
  reusable primitives belong in `@startup/web-ui`.
- `@startup/design-tokens` owns visual tokens for web and mobile.
- `@startup/contracts` owns portable shared domain contracts and input validation.
- `@startup/data-access` owns generated database types and genuinely reusable
  operations that receive an app-configured client. It must not own Next.js cookie
  handling, React hooks, providers, or server credentials.
- Shared packages never import applications. Keep platform-specific session/client
  setup in the app. Contracts and data-access already provide the shared facility,
  appointment, doctor, schedule, verification and notification operations.

Routes can import an explicit feature `server.ts` entry for server operations.
The facilities entry exposes `saveBedInventory` to its HTTP adapter without adding
server code to the client-consumed feature index. The admin route passes the auth
logout component through a slot into the shell; shared sidebar/layout components
do not import an app feature.

The architecture check runs before ESLint and checks both relative and `@/` imports.
It rejects duplicate route URLs, feature-to-feature dependencies, shared-to-feature
dependencies, route imports into lower layers, route imports of feature internals,
module-level screen data, and hook calls without a client directive. These are
static checks for the current conventions, not a complete runtime dependency audit.

Keep static screen data, filter options, demo dates, summaries and pagination in
the owning feature's `utils/<screen>Constants.ts`. Keep record types in `types/`.
Do not move component state or values computed from props into constants. Shared
navigation belongs to the admin shell, not dashboard or authentication. Generic
component behavior, styling and SVG geometry stay with the component or design
system. Dashboard-only doctor/ward summaries remain in dashboard until another
feature actually needs a shared domain operation.

The shadcn CLI can generate blocks into `src/components` and pages into `src/app`.
After adding a block, move screen-specific forms/UI into the owning feature and
leave a thin route adapter. Keep generic primitives in `@startup/web-ui`.

## Backend integration contract

The shared backend lives at the repository root in `supabase/`. Existing auth,
verification, bed inventory, appointment, directory and scheduling integrations
use the contracts and data-access packages. New integrations follow these rules;
the presence of source code does not establish deployment or browser verification.

1. Model organizations, facilities and staff memberships before connecting admin
   data. A future route such as `/facilities/[facilityId]/appointments` selects a
   facility but does not grant access to it.
2. Validate identity and facility membership server-side for every protected
   operation. Enforce database row-level policies as well. Layout redirects are
   for navigation and cannot replace authorization.
3. Configure cookie-based web authentication with distinct browser and
   request-scoped server clients. Never put privileged credentials in browser
   modules or public environment variables.
4. Shared booking/dispatch state transitions belong in authorized, atomic backend
   operations used by all apps. Include idempotency where requests may be retried.
5. Record actor, facility, operation and timestamp for administrative mutations.
   Avoid sensitive medical data in application logs.
6. Paginate queries, select only required fields, and scope subscriptions to
   authorized data. Cache keys must include relevant identity/facility scope;
   never share user-specific responses through a public cache.

## State ownership

Use URL search parameters for shareable filters, sorting and pagination. Keep
ephemeral UI state in local React state. Add a query cache only for client-side
server-data needs such as live dispatch; do not copy fetched entities into another
global store. Add providers and dependencies when required by a real feature.

## Verification

Run from the monorepo root using its pnpm toolchain:

```sh
pnpm --filter facility-portal lint
pnpm --filter facility-portal check:architecture
pnpm --filter facility-portal test:architecture
pnpm --filter facility-portal test
pnpm --filter facility-portal typecheck
pnpm --filter facility-portal build
```

Typechecking first generates current Next.js route types. A production build can
require network access for the existing Google fonts. Architecture regression tests
use Node's built-in test runner. Add backend workflow tests when integrating data, including
unauthenticated access, denied facility access and failed mutations. Database
policies and transaction constraints require backend integration verification.
Existing rollback checks live in `supabase/tests/smoke`; actual pgTAP tests belong
in `supabase/tests/database` when implemented.

## Feature ownership review

See [FEATURE_STRUCTURE.md](FEATURE_STRUCTURE.md) for the complete source review.
Workflow hooks own existing form state, queries, actions and effects. Schedule
controls have individual component owners; `FacilityDoctorScheduleEditor` retains
its practice/type key. The facility verification hook mounts once and passes the
address section its existing draft and callbacks. Map library loading stays a
singleton browser service; map listeners and cleanup stay in the map hook.
`doctorApi` is a feature client service, while query/cache behavior stays in hooks.
Pure schedule-draft conversion and bed-row color helpers are separate from static
configuration. Named contracts live in feature types; public exports stay deliberate.

## Reception registration and clinic capacity

`features/doctors` owns editable total clinic capacity, app quota and reception
walk-in quota in its existing schedule editor. Shared contracts reject allocations
whose sum exceeds the total. Existing settings retain their app allocation;
reception starts at zero until explicitly configured.

`features/appointments` loads `get_portal_clinic_day` through its existing Server
Actions and `@startup/data-access`. The staff-only response includes the selected
clinic date, working hours, full physical timetable and separate used/remaining
counts, including booked, blocked and past times. The patient availability APIs
return only app-bookable choices.

Reception registration retains name/contact/reason and adds optional age/gender
and same-day check-in. Patient creation, reservation, queue ticket and optional
check-in share one transaction with idempotency protection. Registration requires
managed-practice access; it does not create an Auth account or establish patient
app access. Managers receive demographics through the existing authorized
appointment list. The table exposes booking source, arrival/queue state and
check-in, call-next, hold, resume and no-show actions; backend transitions remain
the authority for state, order and permissions. Queue boundaries remain per session.

The backend is defined by `20261015062322_portal_walk_in_appointments.sql` and
`20261021174352_clinic_channel_capacity_and_reception.sql`, both deployed to the
linked backend on 2026-10-21 with existing limits preserved. The rollback-only
`supabase/tests/smoke/clinic-channel-capacity.cli-smoke.sql` covers editable saves,
channel and total exhaustion, demographics, retries, queue creation and access
denial. Browser component previews use synthetic data; authenticated reception
and native mobile device verification remain separate.

## Payment reservation display

Appointment rows distinguish unpaid auto-accept reservations using the shared
`confirmation_payment_pending` projection. They display **Awaiting patient payment**
and do not expose Accept/Reject request actions or count as approval requests.
Backend capture/expiry owns confirmation and capacity; reception payment remains
an explicit clinic booking choice. This source change does not establish a hosted
web deployment or native checkout verification.

## Mixed visit time blocks

The existing Doctor Schedule editor supports multiple time blocks for each visit
type, using that type's selected working days, duration, fee and daily quota.
`settingsDraft` restores the saved arrays and retains legacy single-hour fields.
Home blocks have an editable buffer before and after them. Shared contracts reject
invalid, undersized or overlapping blocks; the backend additionally checks the
doctor's other published modes and practices. To insert an online or home visit
inside previously continuous clinic hours, first publish the split clinic blocks.

The staff-only `get_portal_clinic_day` response includes `clinic_time_blocks` and
`doctor_timeline`. Reception's registration dialog shows the selected day's clinic,
online and home sessions, including other-practice time and travel reservations,
while its registration choices remain clinic-only. It exposes no other-practice
patient details. Queue boundaries and queue transition authority are unchanged.

`20261022071502_multi_block_service_schedules.sql` was deployed to the linked
backend on 2026-10-22. All four prior schedules retained their hours, prices and
quotas; the migration does not configure an illustrative mixed day. New publication
replaces only unbooked future availability from the selected date, preserving
existing reservations and rejecting conflicting edits with a useful error.
The rollback-only `supabase/tests/smoke/multi-block-schedule.cli-smoke.sql` tests
interleaving, patient choices, buffers, protected bookings, stale versions and
authorization. Web component screenshots use synthetic data and mocked actions;
authenticated live UI verification remains separate.

## Appointment attendance and recovery

Schedule publication shares the deployed
`20261027143412_schedule_publication_performance.sql` optimization with Doctor
mobile. Repeated/quota-only saves preserve the grid and changed grids reuse already
validated timezone metadata. Version checks, authorization, existing appointments
and the eight-second API timeout are unchanged; no web action arguments changed.

`features/appointments` owns the Manage appointment dialog,
`hooks/useAppointmentRecovery.ts`, recovery display types and its Server Actions.
Actions require approved-facility access, validate shared input contracts, and call
the clinic operations in `@startup/data-access`; database practice permissions remain
authoritative. Loading replacement times and arranging a move additionally check
the authorized appointment's `can_manage` projection. Request decisions and
attendance actions require backend `can_manage_practice` permission.

The table and its filters use `appointmentRecoveryView` for expired requests,
needs-review, waiting-for-doctor, no-show, doctor-unavailable and rescheduled labels.
Its 30-second display clock cannot complete visits or decide attendance. Clinic
review follows the session end; other modes use the booked end plus configured
grace. Staff confirm patient no-show after the deadline or record doctor
unavailability separately with a reason. Resolving an attendance review does not
itself decide attendance. Approving a requested move revalidates its target; review
requests do not hold capacity.

Server Actions revalidate appointments and dashboard routes after mutations; the
dialog refreshes on success and on returned stale/mutation errors. Request creation
and decisions update the appointment version and explicitly call the existing
`emit_appointment_change` private emitter so the facility-scoped live-update bridge
refreshes pages. There is no direct browser access or
subscription to the private recovery request table. Replacement transactions retain
booking-source quotas and chain history; clinic arrivals get a new awaiting-arrival
ticket rather than inheriting check-in or QR state.

`features/doctors/components/AppointmentRecoveryPolicy.tsx` belongs to the existing
Doctor Schedule editor, with a separate versioned Server Action/RPC save. It requires
an approved doctor association and backend schedule-edit permission. Defaults are
15 minutes of attendance grace, zero minutes of patient notice and one patient move;
the respective ranges are 0–180, 0–10080 and 0–10. The policy applies to the practice
across visit types and does not publish slots. Reloading stale settings starts from
the latest saved version.

The existing facility live-update bridge invalidates both the schedule and recovery
policy caches on schedule/appointment changes and reconnects. It also reloads open
reschedule options. Doctor saves therefore refresh the Portal policy without a page
reload; unsaved local edits remain intact and retain their original version for
conflict detection. Publishing a schedule also invalidates the policy's shared row
version before its next save.

Recovery migration
`20261023075921_appointment_recovery_and_rescheduling.sql` was deployed to the
linked backend on 2026-10-24 with explicit approval. Post-deployment rollback-only
workflow checks passed, and the security advisor reported no error-level findings.
Desktop and narrow-width synthetic component
previews are captured in `.impeccable/review/recovery-desktop.png` and
`recovery-mobile.png` at the repository root. They do not establish authenticated
live workflow or native Patient/Doctor verification. Consultation billing has a
separate local implementation and deployment boundary below.

## Consultation payment management

Payment presentation composes the shared web `PaymentSummary` and status label;
feature-owned controls, queries and Server Actions retain the financial workflow.
`useAppointments` owns the Hold/Reject reason draft, pending state and error
feedback. `AppointmentsScreen` composes the existing web `Dialog` primitives for
this flow in place of the browser-native prompt. Cancellation performs no write;
confirmation submits the same appointment ID, row version, action and note.

The appointment review dialog composes its feature-owned `AppointmentPaymentPanel`.
Billing reads and mutations use `features/appointments/server/paymentActions.ts`,
which validates authenticated inputs and delegates to shared operations. Client
state and the `appointment-billing` query stay in the feature. The existing private
facility live-update bridge invalidates that cache alongside appointment queries.

The panel uses existing web controls and dialog layout to show fee, captured and
refunded amounts, balance, policy, provider references and request status. Staff
with both practice-management and schedule-edit permission can confirm clinic cash
received, approve/decline refunds, process/reconcile gateway work and confirm cash
returned. Notes, accepted terms, versions and current amounts are checked. Queue
access alone is insufficient. An unresolved online order blocks duplicate cash
collection; refund approval differs from actual provider/cash return.

Clinic patients retain online or reception payment. Native Checkout belongs to
Patient; the Portal stores no provider keys in browser configuration and adds no
checkout route. Billing uses separate appointment-specific tables rather than
ambulance payment foreign keys. Payment migrations/functions are deployed and
consultation billing is enabled in test mode with zero deduction. Read-only provider
and endpoint probes passed; actual captures/refunds remain unverified.
Authenticated browser, native and cross-device financial flows remain unverified.
See [payment setup and activation](../../APPOINTMENT_RECOVERY_PAYMENTS.md).

Portal tests passed 43/43 plus architecture validation; final typecheck and scoped
changed-file ESLint passed. Full Portal lint retains 43 unrelated errors and one
warning. Billing SQL workflow passed within a
rolled-back transaction, without deploying billing or retaining fixture charges.

## Consultation commission and payouts

The existing appointment payment panel and `server/paymentActions.ts` also read
authorized `list_payout_entries` through shared clinic data access. They show the
captured receipt, company commission, provider share, legal recipient and payout
status inside the incumbent dialog. Practice-management plus schedule-edit
permission remains required. Portal does not collect provider keys or bank/KYC
information and does not own company fee configuration.

Company Admin finance selects the doctor or facility payee according to the
business agreement and records the already onboarded Route identifiers. Terms are
frozen per captured receipt. Transfers require completed care, the company release
delay and verified Route eligibility/configuration; transfer state is distinct
from provider settlement. Gateway/Route fees and taxes are currently absorbed by
the company. Clinic cash makes company commission receivable; finance records its
separate receipt, without an automatic cash split or debit. Appointment refunds
reverse transferred provider liability before patient return; request decisions,
provider returns and physical cash returns keep separate states.

Both payment migrations, the ambulance worker alias follow-up and three payment
Edge Functions were deployed on 2026-10-24 with user approval. Marketplace/Route
remain disabled/test and rates unconfigured.
The SQL/mocked-provider checks do not establish authenticated browser behavior,
native checkout or actual transfers. See the [payment guide](../../APPOINTMENT_RECOVERY_PAYMENTS.md).

## Schedule changes with patient rescheduling

The schedule dialog offers trimming or pausing affected other-service blocks.
Affected bookings and the patient-facing reason are reviewed before a separate
confirmation. Authorized Server Actions use the shared API; existing reservations
remain unchanged and conflicting new slots stay unavailable until explicit
resolution. Waiting notices open Appointments, while paused-service notices open
the schedule. The test migrations are deployed and hosted rollback checks pass;
browser acceptance remains unverified. No server was started for this change.

## Schedule navigation

The admin shell follows shadcn sidebar-07: an icon-collapsible sidebar with a rail,
a persistent header toggle and route breadcrumbs, and an account dropdown. The
existing logout action stays mounted in the footer. Mobile navigation uses the shared sidebar
sheet and closes after selecting a link. No demo teams or billing actions are wired.

The persistent admin sidebar groups Doctor Schedule and Doctor Management under
Schedule, expanded by default. Doctor Schedule remains the calendar overview.
Doctor Management shows a dedicated Manage schedule column for each verified
doctor, using the
practice ID returned by the roster API. It opens a Base UI shadcn drawer from the
right. Service selection, schedule edits and leave controls remain inside the
drawer; direct editor routes remain available for existing links.
The extra `/doctor-schedules/manage` selection page has been removed.

Facility access reads retry one transient connection failure while preserving
authorization checks. The root error boundary offers a recoverable Try again
action when a service remains unavailable; raw backend objects are not shown.

Doctor Management has Doctors and Notifications tabs. The sidebar Notifications
entry opens `/doctor-management?tab=notifications`; tab selection stays in the URL
and the sidebar highlights the selected destination. Association requests and
sent invitations appear only in Notifications; its panel remains mounted while
hidden to preserve the existing request listener and rejection drafts. The doctor
directory uses the full page width. Add new Doctor sits immediately left of search
and reuses the shadcn AddDoctorDialog. Successful invitations close the dialog,
refresh the directory and invalidate the existing association-request query.

Doctor Directory displays only the last hyphen-separated segment of the Clinzo ID;
the full identifier remains in the data model for searching and backend operations.

`FacilityDoctorScheduleDrawer` owns open state, local service selection and save
dismissal protection. It composes the existing schedule screen/editors rather than
duplicating RPCs or query state. Service adjustment links select another editor
inside the drawer; booking-review notices still open Appointments. The phone and
specialization glyphs have been removed from the doctor directory. Browser/native
interaction with the drawer and nested dialogs remains a separate acceptance check.

The facility sidebar rail resizes the desktop panel between 208 and 352 pixels
with pointer capture or arrow keys. Width stays in the mounted admin shell.
Appointments delegate patient details to a right-side drawer; rows display the
last patient ID segment while preserving the full ID in the appointment data.
Browser verification of resizing and drawer interaction remains separate.

All four portal data tables use the shared TanStack DataTable with column-edge
resizing. Columns keep their original order. Mouse, touch and keyboard controls
change widths without changing sorting, pagination, row IDs or mutations.
Bed setup stays in the Department cell until inventory is configured.
Dashboard header actions are composed by the route from the Doctor and Appointment
features. Its bed section is omitted without configured positive capacity. Weekly
clinic coverage uses a compact searchable roster with five doctors per page.
Each visible doctor retains all seven days; search covers the full roster by name
or speciality. Pagination keeps large rosters from stretching the dashboard.
The published-week projection and schedule-management route remain unchanged. Browser acceptance remains separate.

Doctor Schedule overview uses a date/week selector, compact operational summary,
and one exact-time timeline lane per published shift. On narrow screens each lane
becomes an agenda entry with its service and time range. The existing projection,
selected-day state, next-scheduled-day action and resizable assignments table are
preserved. Surgery and emergency placeholders are replaced by selected-date shift
and department counts. Management and notification links use existing routes.

Appointment search, status and date filters live with the booking list. Summary
labels describe all-date totals; the rolling-week filter is labelled Next 7 days.
Patient names retain their details drawer and existing booking/review workflows
keep their mutation contracts. Column reordering and its grip handles are removed.
