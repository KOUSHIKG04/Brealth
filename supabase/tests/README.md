# Backend SQL tests

## Schedule update smoothness (not yet run)

`smoke/schedule-update-smoothness.cli-smoke.sql` requires
`20261113103000_schedule_update_smoothness.sql`. Inside `BEGIN/ROLLBACK` it
sets a known clinic/online layout on an existing managed single-practice doctor,
then checks the busy-block projection, `PT410` for a conflicting draft, `PT409`
for a stale token and for a change made after the preview, the success path, the
absence of a suggested date when nothing is booked, and authenticated-only grants.
It does not create bookings, so the suggested-date path itself is not covered.

## Driver evidence immutability regression (test verified)

The synthetic rollback suite smoke/driver-evidence-immutability.cli-smoke.sql passed after the approved migration. It checks pending/approved/rejected/superseded paths, authenticated INSERT RLS, fresh uploads, DELETE guard and helper grants.

Applied 20261101075451_driver_evidence_review_immutability.sql to the explicitly approved test project. SQL regression PASS. Actual owner API DELETE removed zero submitted objects; replacement POST returned HTTP 400. Original bytes and approved/version-1 metadata stayed unchanged. Fresh random-path upload and deletion succeeded. All six fixture counts zero. Reviewer UI, concurrency and production remain unverified.

The API check uses seeded synthetic approved metadata, not persistent normal-review UI acceptance.

## Security boundary regressions (test project verified)

`smoke/payment-hold-reschedule.cli-smoke.sql` requires
`20261101055806_security_booking_and_video_boundaries.sql`. It checks that both
the patient and authorized staff cannot move an unpaid payment reservation, that
denial preserves the original reservation and creates no replacement, and that
an ordinary approval-required request still moves with an idempotent replay.
The existing `smoke/appointment-payments.cli-smoke.sql` remains the paid-credit,
top-up and refund regression suite.

`smoke/online-join-credentials.cli-smoke.sql` checks pending, suspended and inactive
assigned clinicians while their facility membership survives. It also checks
the verified doctor and patient branches. It does not sign media tokens, call
the media provider or establish revocation of an already issued token.

Both suites passed against the approved **test** project on 1 November 2026 after
migration `20261101055806_security_booking_and_video_boundaries.sql` was applied.
They create synthetic Auth/domain fixtures inside `BEGIN/ROLLBACK`, execute public
user operations as `authenticated` and make no provider requests.

`smoke/reception-security-synthetic.cli-smoke.sql` also passed. It checks outsider
denial, financial function grants, attempt reuse, stale terms, provider amount
binding, capture-only confirmation, atomic/idempotent cash receipts and stable
50+3 transaction pagination including same-timestamp rows. Its generated fixtures
rolled back; matching dummy doctor/patient counts were zero afterward. It does not
test a nonfinancial facility staff role, browser checkout, provider services or
multi-connection contention. Prefer this wholly synthetic fixture under a
no-real-user-data constraint; the older suite below selects existing identities.

`smoke/facility-reception-payments.cli-smoke.sql` verifies reception checkout
without granting patient access, stale-policy rejection, attempt reuse, authorized
versus captured balances, transaction cursors, unrelated-user denial and anonymous
RPC privileges. It uses synthetic provider records inside BEGIN/ROLLBACK; it does
not call Razorpay or retain financial/patient fixtures. It passed against the
linked test project after `20261031105135_facility_reception_checkout_and_transactions.sql`.

## Current test target

On 30 October 2026, the approved test project is `enjafragbcrrgaclwopd`, which
is also the local linked target. The legacy runner below deliberately rejects a
target matching the linked marker, so it cannot run against this current setup.
Keep that guard intact. The recorded deployment used an explicit project-ref CLI
push after verifying the project name and app URLs, and hosted rollback SQL tests
through the connected database tool. For the legacy runner, use a genuinely
separate disposable project as its instructions require.

## Hosted workflow coverage

`smoke/multi-block-schedule.cli-smoke.sql` also checks conflict preview without
writes, stale confirmation rejection, partial replacement, booking preservation,
persistent review notices and function grants. It requires
`20261030081657_schedule_conflict_resolution.sql` on the disposable target and the
fixture's existing empty managed future schedule prerequisites. The expanded fixture passed against the test project on 30 October 2026, including
authenticated preview/replacement, denied access, a new payment hold after preview,
full service removal and clearing the notice after setting new hours.

`smoke/clinic-channel-capacity.cli-smoke.sql` also owns hybrid queue regression
checks. Apply the hybrid queue migration to an explicitly disposable project
first. The fixture requires a verified managed practice with an empty future
clinic day and at least six open single-patient windows in one session. It uses
real booking RPCs/table triggers and rolls back registration, settings and queue
changes. It is not run by the default workspace test command and does not prove
multi-connection contention or native QR behavior. No substitute schema, mocked
authorization functions or separately installed PGlite runtime is needed.

`smoke/schedule-publication-performance.cli-smoke.sql` verifies repeated saves,
quota-only saves with stable window IDs, fee/duration/eight-block rebuilds, booking
preservation and invalid timezone rejection under an eight-second timeout. It uses
an existing managed practice (preferring Doctor-02) and rolls back every write.
Run only after `20261027143412_schedule_publication_performance.sql` is deployed:

```powershell
pnpm supabase db query --linked --file supabase/tests/smoke/schedule-publication-performance.cli-smoke.sql
```

`smoke/*.cli-smoke.sql` contains the existing transactional smoke fixtures moved
from the database package. Each script now supplies explicit transaction/rollback
boundaries, including fixtures formerly requiring an outer wrapper. Existing
success-field names are preserved.

These are CLI SQL checks returning success fields, not pgTAP test files. Do not
run them as though `supabase test db` expects their JSON output. Add actual pgTAP
checks under `tests/database` when implemented; the three empty RLS test stubs
were removed rather than treated as passing coverage.

## Existing guarded runner

From the repository root, set `TEST_PROJECT_REF` to an explicitly disposable
project, separate from the linked project, then run:

```powershell
& ./packages/database/tooling/verify-disposable.ps1 -UseCli
```

This preserves the existing dry-run behavior. Only the explicit `-UseCli -Apply`
mode applies reviewed pending migrations to that disposable project and runs the
runner's selected smoke suite. It is not an automatic step in a source cleanup.
The runner rejects the linked project, checks command failures and requires each
selected script's success field. Other smoke files remain available for targeted
verification of their domain on the reviewed disposable target.

Model and filesystem contract checks need no database:

```powershell
pnpm --filter @startup/database test
```

Optional Bun database integration checks retain their existing opt-in environment
setup under [packages/database](../../packages/database/README.md). A skipped
database suite or a filesystem test does not establish SQL/RLS correctness.

Historical dated audit notes may contain pre-move paths; use this guide and the
current runner for active verification. No hosted SQL was executed to move files.

## Schedule changes with patient rescheduling

The existing multi-block smoke suite now verifies required patient-facing reasons,
permission grants, active-payment-hold rejection on both replacement paths, unchanged
reservations after requesting a move, paused availability, and unavailable Clinic
time while waiting. It switches to a non-manager patient to confirm a replacement,
checks that the Clinic slot reopens, verifies notice clearing, and rejects revival
of a separately cancelled appointment. Tests roll back all fixtures and notification
intents. Five hosted workflow suites passed after the main deployment; final checks
also cover the terminal-state follow-up. Browser/device/push delivery are separate.

The follow-up `20261030112058_schedule_refresh_after_rescheduling.sql` defers
resolved-session cleanup until transaction completion, so a replacement inserted
in the same session is visible before cleanup. Both cross-session paid-credit
rescheduling and same-session reservation protection passed rollback checks.
The follow-up is applied to the approved test project.
