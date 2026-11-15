# Repository structure and ownership

## Hybrid clinic queue

Clinic reservations and serving order are owned by the shared appointment RPCs.
The hybrid queue migration reserves a window-based token before confirmation or
payment completes, then uses one database ordering function for call validation,
people-ahead counts and waiting estimates. App and reception reservations have
equal standing. Existing issued session tokens remain unchanged; new sessions
use planned positions. Patient and Doctor mobile and Facility Portal consume the
same optional `clinic_queue` projection. See [the backend guide](supabase/README.md).
The queue and schedule-conflict migrations were applied to the test project on
30 October 2026 and passed hosted rollback workflow checks. Browser/native-device
acceptance and multi-connection contention checks remain separate.

This document describes ownership in the existing codebase. It does not prescribe
creating every possible subfolder. Each mobile app has an `ARCHITECTURE.md` with
its current integration boundaries; the web apps have their own local guidance.

## Error handling and monitoring

- **User copy:** `contracts/src/errors.ts` owns `userErrorMessage`. RPC validation
  copy and safe app/auth messages pass through; database internals, provider
  text and unknown codes use the caller's fallback. Apps never render raw
  `error.message`. `isExpectedError` and `shouldRetryRequest` classify the same codes.
- **Reporting:** `data-access/src/monitoring` owns `reportError`, a no-op until an
  app installs a sink. Each app's `services/monitoring.ts` (mobile) or
  `instrumentation-client.ts` (web) installs PostHog only when its public key is
  set: exceptions only, scrubbed by `scrubEventData`, with no identification,
  screens/page views, replay or geolocation. Expected outcomes are never reported.
- **Crash containment:** mobile root layouts export an Expo Router `ErrorBoundary`
  using `mobile-ui` `ErrorFallback`; web apps have `error.tsx` and
  `global-error.tsx` using `web-ui` `RouteErrorState` with the digest reference.
  Web `instrumentation.ts` writes one scrubbed JSON line per server error.
- **Network:** the shared Supabase client factory and web clients use
  `createTimeoutFetch` (20 s reads, 45 s functions, 120 s storage). Mobile query
  providers connect NetInfo to React Query's `onlineManager`, pausing queries
  and mutations offline, and show `OfflineBanner`.
- **Server:** Edge Functions log failures through `supabase/functions/_shared/log.ts`.
- **Realtime:** `subscribeAppChanges` reports `live`, `reconnecting` or `down` per
  topic. Drops that recover within 45 s (the last 10 s always measured after any
  app suspension) are silent and catch up on reconnect. Only a sustained outage
  while online is reported to monitoring and shows a quiet, self-clearing notice
  (mobile `OfflineBanner` message, portal status note); no toasts.

Local implementation only: no PostHog project or keys are configured, and
device, browser and hosted-log behavior is unverified.

## Design tooling

Claude Code design skills (Impeccable, Unslop, Hallmark, Stageshow) are
installed locally in the gitignored `.claude/skills`; its `README.md` records
sources, licenses and usage. Each app's
`PRODUCT.md` records its platform: the mobile apps are `adaptive` and
`facility-portal` and `company-admin` are `web`. Driver mobile inherits the root
record. No `DESIGN.md` exists yet; the code is the current visual source of truth.

## Shared ownership

The package-level [ownership and extension guide](packages/ARCHITECTURE.md) records
the current shared folders, compatibility boundaries, and future payment ownership.

| Location                                | Responsibility                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/patient-mobile`                   | Patient discovery, booking, appointments, visits, ambulance requests, and personal records UI |
| `apps/doctor-mobile`                    | Doctor onboarding, practices, schedules, appointment review, and consultation UI              |
| `apps/driver-mobile`                    | Driver onboarding, availability, offers, trips, saved locations, and tracking UI              |
| `apps/facility-portal`                  | Facility management and appointment/schedule web workflows                                    |
| `apps/company-admin`                    | Platform review and administration web workflows                                              |
| `packages/mobile-ui`, `packages/web-ui` | Reusable presentation components for their platforms                                          |
| `packages/design-tokens`                | Shared visual tokens and typography                                                           |
| `packages/contracts`                    | Client-safe domain types and runtime input/response schemas                                   |
| `packages/data-access`                  | Client factories, generated wire types, and reusable backend operations                       |
| `packages/database/src/schema`          | Database schema definitions                                                                   |
| `supabase/migrations`                   | Versioned database changes, including RPCs, triggers, and policies                            |
| `supabase/functions`                    | Implemented server integrations; future handlers are documented                               |

An adapter, source file, or migration in the repository does not prove that it is
deployed or that its device workflow has been verified.

## App ownership

Routes in `src/app` read parameters and compose feature screens. Feature code lives
under `src/features/<domain>`. Within an existing feature:

- `screens` compose a navigable screen.
- `components` contain feature UI units with meaningful boundaries.
- `hooks` contain React state, query, mutation, and lifecycle coordination.
- `types` contain feature UI contracts; shared domain contracts stay in the package.
- `utils` contain pure helpers and feature-owned `*Constants.ts` configuration.

These are available responsibilities, not a folder checklist. A feature can start
with one screen and grow only when real code needs a distinct owner.

App-wide providers, clients, stores, and shared UI stay at app level. Server data
uses the existing query cache; UI drafts may use local state or existing stores.
Do not introduce a second cache or session source during structural cleanup.

## Current shared domain modules

Clinic booking and appointment transitions use the `clinic` contracts/operations.
Clinical intake, prescriptions, follow-up, and records use the `clinical` modules.
Ambulance operations, driver fleet/profile, trips, tracking, and SOS already have
modules in `packages/data-access/src/ambulance` and corresponding contracts.
Search these owners before implementing a similarly named service or adapter.

Device integration remains app-specific: notification registration is under
`features/notifications`, while location selection and tracking live in their
owning features. An empty `services/location.ts` or `services/notifications.ts`
does not supersede these implementations.

## Historical placeholders and cleanup

`plans/` retains optional mobile/provider setup and manual verification guides,
indexed by [its README](plans/README.md). Historical audits, generated UI/database
inventories and the unapproved SQL draft have been removed. Use the architecture
documents and backend test guide for current ownership and executable checks;
planning notes are not build inputs or deployment evidence.

Mobile `.gitkeep` markers, empty mobile location/notification service files, and
unreferenced shared appointment/record/ambulance/clinical-contract stubs have been
removed after a reference check. Reviewed web and Supabase placeholders have also been removed; future work is
documented rather than represented by empty source files.

Before any cleanup, inspect imports, route adapters, package exports, config, and
the current working tree. Retain the working owner and remove superseded scaffolds
only in an explicitly scoped cleanup. Record genuinely future work as documentation.
Do not manufacture implementations to populate empty files.

The unused Supabase schema/function/RLS-test placeholders have been removed.
Local `schema_paths = []` remains unchanged. SQL smoke fixtures live under
`supabase/tests/smoke`; Drizzle models and model/integration tests remain in
`packages/database`. Upcoming payment, reservation and dispatch integrations are
documented in `supabase/functions/README.md`; their config entries stay disabled.
Never alter applied migration history as folder cleanup.

Update these documents in the same change when code ownership or integration
status changes. The operational rules are in [AGENTS.md](AGENTS.md).

## Mobile composition boundaries

`packages/mobile-ui` owns the themed `SectionHeader` and presentation-only
`NotificationDrawer`/notification cards. Each mobile app keeps a small
`features/notifications/components/NotificationDrawer.tsx` adapter; its feature
hook owns the client, query/cache actions, notification text and navigation.
Shared UI receives data and callbacks rather than importing app features or
backend clients. Notification UI types live in `mobile-ui/src/types`; the shared
time formatter is a `contracts/src/utils` export. App regression tests live in
their app's `tests` directory rather than alongside runtime components.

Patient booking coordination lives in `features/doctors/hooks`; its screen composes
the booking sections and confirmation dialog. Doctor appointment review and schedule
coordination live in their feature hooks. The consultation form retains its keyed
wizard boundary and composes separate vitals, prescription, and follow-up sections.
Driver registration has individual screens behind its existing compatibility export;
Home and Trip hooks own their existing data/actions, with feature-owned display maps.

Patient's full feature ownership review is recorded in
[`apps/patient-mobile/FEATURE_STRUCTURE.md`](apps/patient-mobile/FEATURE_STRUCTURE.md).
Its screens compose feature hooks rather than importing query/backend APIs. Named
contracts, pure helpers, static configuration, platform integrations and draft
stores have explicit owners within each feature. Structure and lifecycle checks
guard those boundaries while retaining existing routing and workflow behavior.

The same feature ownership review is recorded for
[`apps/doctor-mobile/FEATURE_STRUCTURE.md`](apps/doctor-mobile/FEATURE_STRUCTURE.md)
and [`apps/driver-mobile/FEATURE_STRUCTURE.md`](apps/driver-mobile/FEATURE_STRUCTURE.md).
Their controllers, UI sections, contracts, configuration, platform services and
navigation drafts stay with their owning features. Background task registration
and consultation wizard mount boundaries remain explicit integration points.

Location selection and background tracking have different lifecycle requirements.
The Driver location pickers share pure helpers/styles, while retaining separate
draft stores and confirmation navigation. Structural checks do not replace device
verification of permissions, camera/map behavior, notifications, or tracking.

## Web composition boundaries

Facility Portal and Company Admin record their ownership reviews in
[`apps/facility-portal/FEATURE_STRUCTURE.md`](apps/facility-portal/FEATURE_STRUCTURE.md)
and [`apps/company-admin/FEATURE_STRUCTURE.md`](apps/company-admin/FEATURE_STRUCTURE.md).
Web routes compose public feature entries. Workflow hooks preserve state and effect
ownership; named contracts, static configuration, pure helpers and platform services
stay with their feature. Server query loaders and Server Actions retain their
authorization boundaries and remain outside client module graphs.

Web regression tests live in each app's `tests/unit` directory. Facility Portal's
`scripts` contains the architecture inspector and small shared test tools, also
used by Company Admin; this is tooling reuse, with no runtime app dependency.
Empty web dispatch/staff and server scaffolds have been removed. Their future work
is documented rather than represented by empty source files.

## Test ownership and execution

`pnpm test` runs the existing workspace test scripts through pnpm recursion,
including Patient. Contract tests discover every suite in their tests directory.
Database model/fixture checks run by default; real PostgreSQL integration and SQL
smoke tests remain explicitly opt-in against a disposable target. A skipped
integration suite is not a successful database verification.

Mobile architecture suites are small app-specific entry points for the existing
Facility Portal `scripts/feature-structure.mjs` inspector in mobile mode. This is
test tooling reuse, with no runtime dependency between apps. Local private types
can stay with their component/hook; exported feature contracts retain their owner.
Queue control checks share the reception suite, and database queue checks share
the existing clinic capacity smoke fixture. One-off verification tools and logs
stay ignored; they are not additional permanent test suites.

## Backend composition boundaries

The [Supabase guide](supabase/README.md) owns backend layout and environment
verification. SQL smoke fixtures are separate from pgTAP tests; the existing
disposable runner resolves their files from `supabase/tests/smoke` and retains its
target guards. `supabase/seed.sql` is the main manual SQL fixture; alternative
fixture SQL stays in `supabase/fixtures`. Automatic seeding remains disabled.

`packages/database` remains optional Drizzle tooling for the same Supabase
PostgreSQL database. It is not a separately deployed service or a client import.
The Supabase CLI remains the only deployment migration runner.

## Schedule changes with patient rescheduling

Doctor mobile and Facility Portal now support trimming conflicts or pausing the
affected other-service blocks, with explicit patient-facing rescheduling requests.
Existing booked sessions keep conflicting new slots unavailable until patients
explicitly reschedule or cancel; payment holds still block changes. Patient's
notification drawer, push navigation and Appointment Details use the existing
recovery/payment owners. The new migrations and notification worker are deployed to
the approved test database. See [backend details](supabase/README.md). No app server
was started; browser/device/push delivery verification remains separate.
