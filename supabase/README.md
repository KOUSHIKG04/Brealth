# Shared Supabase backend

## Facility teams and roles (local, not deployed)

`20261114120000_facility_team_roles.sql` adds invitation links and team
management. Ranks: owner 4 > organization_admin 3 (all facilities) >
facility_admin 2 (one facility) > receptionist 1 (one facility, assigned
doctors via `member_doctor_scope`); nobody grants a role at or above their
own and owners are not managed here. `member_invitation` stores only a token
hash; links last 7 days and only the invited (confirmed) email can accept,
which creates the identity when needed. RPCs: `list_my_facility_roles`,
`list_facility_team`, `create_/revoke_/get_/accept_member_invitation`,
`update_facility_member`. Money: `can_manage_appointment_money` now includes
receptionists assigned to the doctor (cash, desk checkout, billing and
transactions for those doctors); `guard_refund_decision_role` keeps refund
approval, rejection and cash refunds with owners, administrators and the
doctor. Requires `20261114095000` (`clinzo.current_identity`). Not applied.

## Facility approval of doctor schedule changes (local, not deployed)

`20261114095000_schedule_approval_rules.sql` decides who changes a practice's
schedule directly: the doctor at their own facility (owner or administrator
member), and facility owners/administrators. At hospitals and at clinics the
doctor does not run, the doctor's changes need the facility's approval.
`20261114100000_schedule_change_requests.sql` adds:

- triggers on `doctor_schedule_preferences`, `schedule_rule` and
  `schedule_exception` that reject such a doctor's direct changes (`PT403`)
  from any RPC; previews mark themselves (`clinzo.schedule_preview`) and are allowed;
- `schedule_change_request` (schedule per service, time off add/remove,
  recovery policy), with one pending schedule/policy request per service,
  newer submissions superseding older ones, and `stale` when the practice
  changed after submission;
- doctor RPCs `submit_/withdraw_/list_my_schedule_change_request(s)` and
  `schedule_change_requires_approval`; approver RPCs
  `list_facility_/preview_/approve_/reject_schedule_change_request`. Approval
  applies the change through the existing publisher, conflict resolution,
  time-off and policy RPCs as the approver; decisions notify the doctor
  (`schedule.request_*` push templates) and are audited;
- single-doctor clinics (owned by a doctor identity) removed from the join
  list; pending requests to them are closed with a reason.

`20261114096000_schedule_preview_approval_guard.sql` recreates the preview so
it marks itself for the guard and stops a doctor trimming an approval-required
practice from another practice's conflict dialog. None of this is applied or
verified. `tests/smoke/schedule-change-requests.cli-smoke.sql` (approvals) and
`tests/smoke/facility-team-roles.cli-smoke.sql` (team roles) are rollback
suites written without a database run; run them after applying
`20261114095000` through `20261114120000` to the test project. `20261113103000`
is already applied on test and stays unchanged.

## Schedule update smoothness (local, not deployed)

`20261113103000_schedule_update_smoothness.sql` adds no tables. It recreates
`preview_doctor_schedule_change` with an optional `suggested_effective_from`:
the day after the last booked, held or started session in the conflicting rules,
offered only when a later date alone clears every blocking conflict. New
`publish_previewed_doctor_schedule` reruns the preview under the same doctor,
session and rule locks before publishing: a new overlap raises `PT410` and a
stale token or version raises `PT409`. Read-only `list_my_schedule_busy_blocks`
returns the doctor's other published blocks (no patient details) for the editors.
Existing RPC names, arguments and grants are unchanged; data-access falls back to
the unchecked publisher and an empty busy list while the migration is absent.

The migration and `tests/smoke/schedule-update-smoothness.cli-smoke.sql` were
written without a database run. They have not been applied to test or checked
against a hosted project. Consolidating the text-patched schedule publisher into
one readable `CREATE OR REPLACE` remains a follow-up: take its exact current
definition with `pg_get_functiondef` from the approved test project first.

## Driver evidence integrity fix verified on test

Applied 20261101075451_driver_evidence_review_immutability.sql to the explicitly approved test project. SQL regression PASS. Actual owner API DELETE removed zero submitted objects; replacement POST returned HTTP 400. Original bytes and approved/version-1 metadata stayed unchanged. Fresh random-path upload and deletion succeeded. All six fixture counts zero. Reviewer UI, concurrency and production remain unverified.

The helper keeps schema isolation and guards all referenced statuses and historical versions. Approved metadata was seeded for the API test; the pre-fix normal reviewer control ran inside rollback.

## Security fixes verified on the test project

`20261101055806_security_booking_and_video_boundaries.sql` contains two
security fixes. It rejects new rescheduling of payment-pending reservations, while
preserving successful idempotent replays, and independently requires the assigned
doctor to be active with verified clinical credentials before returning a fresh
online join context. Facility owner/admin membership does not replace clinical
eligibility. Patient access and existing payment/time/state gates remain in place.

Both failures were independently reproduced with synthetic records. The reviewed
migration was applied to **test** (`enjafragbcrrgaclwopd`) on 1 November 2026 and
both focused rollback suites passed: unpaid holds cannot move, ordinary moves and
replays work, revoked/inactive doctors are denied fresh context, and eligible
patients and verified doctors retain access. Function grants were preserved.

The additional all-synthetic reception suite passed scope, retry, amount,
capture-versus-authorization, cash and cursor checks. Fixture counts were zero
following rollback. No payment or media provider calls were made. These checks do
not establish device/browser behavior, provider quotas or revocation of previously
issued video tokens. The deployed migration version is `20261101055806`; its
local filename matches that recorded version to avoid a duplicate migration push.

## Environment and launch policy

Current implementation and feature verification use the project named **test**,
`enjafragbcrrgaclwopd`. The local linked marker and the Patient, Doctor, Driver
and Facility Portal environment URLs point there. Verify that identity before
any future migration; a local linked marker alone is not target approval.

When feature work and acceptance testing are complete and global hosting is ready,
create a separate production database. Apply the reviewed versioned migration
history and configure production Auth, provider secrets, functions and app public
URLs/keys separately. Do not copy test users, credentials or fixture bookings into
production. Detailed setup and rollout instructions will be prepared at that
stage; no production project was created or changed for this deployment.

## Schedule conflict replacement

Migration `20261030081657_schedule_conflict_resolution.sql` adds authorized
`preview_doctor_schedule_change`, `replace_doctor_schedule_conflicts` and
`list_my_schedule_adjustments` RPCs. Preview reuses canonical settings validation
inside a rolled-back subtransaction. Confirmation rechecks the preview token and
permissions under doctor/session/rule locks before retiring conflicting rules,
preserving unaffected weekdays and complete appointment blocks, and publishing
the requested schedule in the same transaction. Travel buffers are included.

No appointment is automatically moved or cancelled. The legacy replacement path
blocks active bookings. The explicit rescheduling-request flow below can publish
unaffected time while preserving booked sessions. Active payment holds, already
started sessions, manual rules and unauthorized practices still block replacement. Other-service
settings remain as drafts; their published rules hold the remaining availability.
Persistent review notices are cleared when that service is published again.

Both this migration and `20261029085810_hybrid_clinic_queue.sql` were applied to
the confirmed **test** project (`enjafragbcrrgaclwopd`) on 30 October 2026. The
CLI reports no pending migrations. The first queue-migration attempt rolled back
because its function-text guard assumed unspaced SQL; the unapplied migration was
corrected to tolerate whitespace before both migrations were successfully applied.

Five hosted rollback suites passed: multi-block scheduling/conflict replacement,
clinic channel capacity/queue numbering, appointment recovery, consultation
availability/signed records, and schedule publication performance. The expanded
schedule suite exercises authenticated callers, denied identities, stale consent,
a payment hold arriving after preview, partial/full removal and notice clearing.
Existing counts remained unchanged after tests: 23 appointments, 8 patients,
281 sessions, 17 schedule rules, 11 check-ins, 9 consultations and 18 queue entries.
No real provider requests or charges were made. Browser/native interaction,
physical QR/device flows and multi-connection contention remain separate checks.

Security advisories were compared before/after. The four additional authenticated
SECURITY DEFINER entries are the three intentionally exposed schedule RPCs and the
new recovery-policy overload; anonymous grants and private-helper grants were
checked. Existing anonymous-function and Auth configuration advisories remain
outside this feature's deployment scope. See the
[function access advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Hybrid clinic queue (test deployment)

`20261029085810_hybrid_clinic_queue.sql` adds numbered clinic reservations. The
existing consultation duration, time blocks, breaks and channel quotas continue
to define available capacity; no extra booking capacity is manufactured.

- New sessions reserve stable positions across their appointment windows under
  the session lock. A pending request/payment hold occupies its position too.
  Confirmation and payment capture inherit that number. Cancellation/rejection
  releases the position while retaining appointment history. Completed visits
  remain consumed capacity. Expired unused windows cannot create new priority.
- Existing sessions with appointments keep previously issued tokens. Never
  renumber patients as a migration side effect. Numbers identify a reservation
  within a session, not guaranteed serving order or a global daily sequence.
- Checked-in, due patients are ordered by clinical priority, planned time and
  token. Absent patients do not block service. If nobody due is ready, staff can
  offer early service to the next ready patient; obtain their agreement first.
  Earlier due patients at the same practice remain ahead across clinic blocks.
- Clinic grace defaults to ten minutes after the booked start. Reception-created
  bookings in the current window use the later of start/registration time.
  Check-in after grace records arrival but places the visit on hold for review.
  Explicit staff admission uses recovery time for ordering, preserving the token
  without restoring unlimited historical priority. Skipping before the booked
  time is not a no-show; the existing explicit attendance-resolution flow remains.
- One private queue-ordering function supplies call validation and ready-patient
  counts. Calling serializes by doctor; an active call cannot be silently displaced
  by another service starting. Current exceptions and other-site/video/home
  commitments prevent new clinic calls. Consultation estimates are approximate
  ranges based on configured window duration and currently ready patients.
- Only existing authorized appointment projections expose queue metadata. Private
  helpers remain unavailable to app roles. The versioned recovery-policy RPC has
  a six-argument overload for clinic grace; old five-argument clients still work.

Applied to the test project on 30 October 2026. The maintained
`tests/smoke/clinic-channel-capacity.cli-smoke.sql` fixture passed against actual
tables, triggers, authorization helpers and booking RPCs. It covers channel quotas,
reserved numbering, absent/late arrival handling, cancellation reuse and grants.
Its fixture data rolled back. Existing issued tokens were preserved by migration;
new sessions use reserved positions. Native QR flows and multi-connection call/
allocation scenarios are not established by these single-connection SQL suites.

## Schedule publication performance

`20261027143412_schedule_publication_performance.sql` was deployed to the linked
project on 2026-10-27. A reproduced Doctor-02 publication took about nine seconds,
exceeding the authenticated eight-second statement timeout. Transaction profiling
attributed about 8.4 seconds to 178 repeated timezone-catalog validations.

The existing validator now accepts unchanged validated values without re-enumerating
the catalog. Generated sessions/booking days can prove their timezone against an
already-validated private schedule rule. New or changed unproven values retain the
catalog check, including rejection of invalid timezones. Generated sessions reuse
existing booking days. An identical published grid, including all blocks, preserves
rule/window IDs and changes only quotas/auto-accept settings; changed days, times,
duration, fee, travel buffer or effective rule coverage retain the established
regeneration path. Authorization, optimistic versions, booking protection, live
events and the thirty-day horizon retain their existing owners. The global/API
timeout is unchanged; the Doctor app and Facility Portal share the same fixed RPC.

The dedicated rollback fixture runs unchanged, quota-only, fee, duration and
eight-block publications together under an eight-second statement timeout. In the
predeployment run those cases took about 21 ms, 9 ms, 924 ms, 1.38 s and 2.71 s.
Mixed-service and same-day smoke checks also passed. The mixed-service fixture was
scoped to Doctor-02 because its default practice selection can choose another
doctor with an already overlapping second practice. The older duration fixture
still has stale app/walk-in quota inputs; its full legacy sequence was not reported
as passing. The dedicated fixture separately verifies duration changes and unchanged
appointment/window snapshots. All fixture writes roll back. App/device confirmation
and concurrent production-load timing remain separate from database verification.

Patient, Doctor, Driver, Facility Portal and Company Admin use the same Supabase
project within an environment. Supabase provides Auth, PostgreSQL, RPCs, RLS,
Realtime, Storage and Edge Functions. There is no separate deployed Bun API.

## Ownership

| Location                   | Responsibility                                                                   |
| -------------------------- | -------------------------------------------------------------------------------- |
| `migrations/`              | Ordered SQL history for tables, constraints, RPCs, triggers, policies and grants |
| `migrations/meta/`         | Existing Drizzle generation snapshots/journal; not a second deployment history   |
| `functions/<name>/`        | Implemented integration handlers and their local helpers                         |
| `tests/smoke/`             | Transactional SQL smoke checks used by the guarded disposable runner             |
| `seed.sql`                 | Main manual SQL demo fixture; automatic seeding remains disabled                 |
| `fixtures/`                | Preserved alternative SQL fixtures, excluded from automatic seeding              |
| `config.toml`              | Local CLI settings; hosted settings are managed separately                       |
| `../packages/database/`    | Optional Drizzle models, trusted tooling and model/integration tests             |
| `../packages/data-access/` | App-facing Supabase operations, client factories and wire types                  |
| `../packages/contracts/`   | Client-safe domain schemas and inferred types                                    |

Read the root [working rules](../AGENTS.md) and
[package ownership guide](../packages/ARCHITECTURE.md) before changing boundaries.

## Why the database package remains

`packages/database` is tooling for this same PostgreSQL database, not another
database or API service. Its Drizzle models support table SQL generation, model
checks and the optional synthetic fixture. Apps use Supabase through
`packages/data-access`; they must not import the trusted database client/models.

Supabase CLI owns the applied migration history. For table changes, maintain the
existing Drizzle model owner and review generated SQL before applying it. Models
are not automatically synchronized with later SQL-only changes or a hosted
project; check for drift before generating new table SQL. RPCs, triggers and
policies remain versioned SQL. Do not use Drizzle push/migrate as a second runner.

The unused `schemas/*.sql` placeholders were removed. `schema_paths = []` remains
unchanged; this repository has not switched to Supabase declarative schemas.

## Local implementation and deployment

The structural cleanup verified 134 local SQL migrations through
`20261015160452_consultation_intake_flow.sql`, preserving their bytes and metadata.
That is a local inventory, not evidence that every migration is applied anywhere.
Use the intended environment's migration list and review pending changes before
promotion. Older dated audit/test notes may describe a different deployment state.

Eight functions have implementations: `send-notification`,
`online-video-token`, `ambulance-hospitals`, `search-map-places` and
`resolve-map-address`, `process-payment`, `razorpay-webhook` and
`payment-reconcile`. The payment migrations/functions were deployed on 2026-10-24
with user authorization, including a follow-up ambulance worker alias fix.
Consultation billing is enabled in test mode; live payments, marketplace collections
and Route transfers remain disabled. Signed webhook and server-worker probes passed;
native Checkout and real payment/refund flows remain unverified. See the
[current setup guide](../APPOINTMENT_RECOVERY_PAYMENTS.md) and
[function ownership](functions/README.md). Source
presence does not prove deployment, configured provider secrets or device behavior.

## Development workflow

From the repository root, use the existing commands:

```powershell
pnpm supabase migration list --linked
pnpm db:check
```

Table generation remains `pnpm db:generate`; custom SQL changes start with
`pnpm supabase migration new descriptive_name`. Review the resulting SQL and
verify it against an explicitly disposable target before a deliberate promotion
with `pnpm db:migrate`. Never rename, reorder or rewrite existing migration files
as folder cleanup. Keep `migrations/meta` intact.

Optional local development uses Docker and `pnpm supabase start`. Hosted CLI
commands do not require a running local stack. The checked-in `config.toml`
controls local services; it does not establish hosted Auth redirects, provider
configuration, migration status or function deployment.

## Tests and fixtures

Read [tests/README.md](tests/README.md). SQL smoke checks are now in
`supabase/tests/smoke`; model and Bun integration tests remain in
`packages/database/tests`. The existing
`packages/database/tooling/verify-disposable.ps1` runner keeps its explicit
target guard and opt-in migration behavior; only its smoke-file locations changed.

Automatic seeding remains disabled (`enabled = false`, `sql_paths = []`).
`seed.sql` is the main manual SQL fixture. The differing former
`seed_demo_data.sql` fixture is preserved byte-for-byte as
`fixtures/demo-alternative.sql`; it was not merged or executed. See
[fixture notes](fixtures/README.md) before selecting a fixture.

## Generated types and application configuration

Each app uses its environment's project URL and publishable key: Expo reads
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; web reads
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Provider
secrets, service-role credentials and direct database URLs stay out of app bundles.

After an intentional schema deployment, generate wire types with:

```powershell
pnpm supabase gen types typescript --linked --schema public
```

Save successful TypeScript output to
`packages/data-access/src/generated/supabase.types.ts`. The separate
`database.types.ts` file is a handwritten compatibility overlay importing that
output; do not overwrite it. Review both the generated diff and app typechecks.
The public wire types were regenerated from the migrated test schema on
30 October 2026. Compatibility signatures override matching generated entries so
explicit-null inputs and existing clients retain their supported call shapes.

## Upcoming integrations

Optional reservation orchestration and automatic dispatch orchestration
are documented in [functions/README.md](functions/README.md). Their empty handlers
were removed; their existing local configuration entries remain disabled.
Create code with its first working implementation instead of reserving folders.
Payment models already belong to `packages/database/src/schema/payments.ts`;
shared payment contracts and operations belong to their corresponding packages.

Structural checks do not replace hosted migration, SQL/RLS, provider, browser or
multi-device verification. Structural cleanup does not implicitly deploy changes;
the explicit test deployment and its verification evidence are recorded above.

References: [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations),
[database testing](https://supabase.com/docs/guides/database/testing), and
[generated types](https://supabase.com/docs/guides/api/rest/generating-types).

## Schedule changes with patient rescheduling

Doctor mobile and Facility Portal offer editing, trimming overlapping availability,
or publishing the new schedule while pausing the affected other-service blocks on
the selected weekdays. Other weekdays retain their hours. Both confirmation paths
show affected bookings and require a patient-facing reason before requesting moves.
Active payment holds, started sessions and unauthorized/manual schedule conflicts
remain blocked. Existing appointment IDs, windows, fees and paid credit are preserved.

The shared backend keeps the old booked session reserved until its last active
reservation is explicitly rescheduled or cancelled. The new recurring schedule can
publish elsewhere; conflicting slots are omitted from materialization. Future time
is refilled after resolution, preserving cancelled session/appointment history.
This is conservative at the session boundary: an unaffected part of the old booked
session can also remain unavailable until the reservations are resolved.

Patient's notification drawer shows the reason and opens Appointment Details;
push taps also open that booking. Details offer the existing time picker with a
separate confirmation and preserve payment transfer/refund rules. Doctor-requested
moves do not consume the patient's self-service allowance. Cancellation/rejection
cannot be reversed merely because an old doctor request exists. Sending or reading
a notification does not accept a new time. Persistent waiting notices link to
Appointments; paused-service notices link to setting new hours.

Migrations `20261030095556_schedule_change_rescheduling_requests.sql` and
`20261030111217_schedule_request_terminal_guard.sql`, plus the updated
`send-notification` worker, are deployed to the approved **test** project
`enjafragbcrrgaclwopd` on 30 October 2026. Rollback SQL checks verify the
booking-preservation and patient-confirmed reopening path. Browser, native keyboard,
real device push delivery and concurrent-connection acceptance remain unverified.
No production database was created and no app server was started for this work.

The follow-up `20261030112058_schedule_refresh_after_rescheduling.sql` defers
resolved-session cleanup until transaction completion, so a replacement inserted
in the same session is visible before cleanup. Both cross-session paid-credit
rescheduling and same-session reservation protection passed rollback checks.
The follow-up is applied to the approved test project.
