# Admin Academic Entities (Phase 2)

Status: implemented, pending final approval before commit.
Branch: `feature/admin-academic-entities` (off `main`, which already contains
Phase 1 — real-data dashboards and the standardized `QuickActionsCard`).

## Objective

Give the admin role full CRUD over three entities that previously had no
dedicated admin surface: **classes** (`turmas`), **user identities**
(`users`, distinct from the academic/professional entities), and
**enrollments** (`matrículas`) — including, for the first time in this
codebase, an enrollment flow that actually creates data (before this phase,
nothing in the backend ever inserted into `enrollments` or
`financial_contracts`; the 117/13 rows that existed were seed data).

This is Phase 2 of a 5-phase plan. Phases 3–5 (materials, activities,
assessments, grades, attendance admin pages) are out of scope here.

## Architecture

Same layering as Phase 1: `frontend page → apiFetch → admin route → admin
service → shared helpers → db.promise() → DTO → frontend`. No inline logic
in `server.js` beyond `require` + `app.use`.

### New files

```
backend/routes/adminClassRoutes.js
backend/routes/adminUserRoutes.js
backend/routes/adminEnrollmentRoutes.js
backend/services/admin/adminClassService.js
backend/services/admin/adminUserService.js
backend/services/admin/adminEnrollmentService.js

coursehub/src/pages/admin/ClassesAdmin.jsx
coursehub/src/pages/admin/UsersAdmin.jsx
coursehub/src/pages/admin/EnrollmentsAdmin.jsx
coursehub/src/components/admin/AdminClassModal.jsx
coursehub/src/components/admin/AdminUserModal.jsx
coursehub/src/components/admin/AdminEnrollmentModal.jsx
coursehub/src/services/AdminClassService.jsx
coursehub/src/services/AdminUserService.jsx
coursehub/src/services/AdminEnrollmentService.jsx

database/migrations/20260803_001_add_class_change_audit_to_enrollments.sql
database/rollback/20260803_001_remove_class_change_audit_from_enrollments.sql
```

### Modified files

```
backend/server.js                                    — 4 require + 4 app.use
backend/routes/adminCourseRoutes.js                   — + GET /:id/pricing-plans
backend/services/admin/adminCourseService.js           — + listActivePricingPlansByCourse
coursehub/src/routes/Router.jsx                        — 3 new admin routes
coursehub/src/components/NavbarAdmin.jsx                — + "Usuários" link
                                                           (Turmas/Matrículas already existed
                                                           as dead links, now live)
coursehub/src/components/ui/StatusBadge.jsx             — + finished/cancelled/locked labels
```

`AdminCreateEditModal.jsx` (the existing generic student/teacher/course
modal) was **not** extended — it's a single monolithic component with
hardcoded per-variant state/validation/payload branches, not a config-driven
one. Adding a 4th/5th/6th variant there would have made an already-large
file worse, so each new entity got its own modal component instead.

## Why the app-wide route → service pattern held up

No teacher route was reused for admin operations. `classAccessService.js`'s
helpers are teacher-scoped (assume ownership by the authenticated teacher)
and weren't reusable for admin's global scope as-is; only its
`createServiceError` convention was replicated (each new service defines its
own, matching the rest of the codebase). `getFinancialDashboardSummary` and
`aggregateCalendarEvents` from Phase 1 were not touched or duplicated —
enrollments' financial data reads directly from `financial_contracts`
instead.

## Endpoints

### Classes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/classes` | paginated, filters below |
| GET | `/api/admin/classes/:id` | |
| GET | `/api/admin/classes/:id/impact` | preview before delete |
| POST | `/api/admin/classes` | |
| PUT | `/api/admin/classes/:id` | `course_id` immutable — see below |
| PATCH | `/api/admin/classes/:id/status` | active/inactive/finished |
| DELETE | `/api/admin/classes/:id` | only when impact is all-zero, else 409 |

### Users

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/users` | paginated, filters below |
| GET | `/api/admin/users/:id` | |
| POST | `/api/admin/users` | creates **admin-only** accounts |
| PUT | `/api/admin/users/:id` | name/email/gender, synced to linked entity |
| PATCH | `/api/admin/users/:id/status` | active/inactive/blocked |
| PATCH | `/api/admin/users/:id/role` | blocked when a linked entity exists |
| POST | `/api/admin/users/:id/send-password-reset` | reuses `authService.requestPasswordReset` |
| DELETE | `/api/admin/users/:id` | soft delete = alias of `status: inactive` |

### Enrollments

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/enrollments` | paginated, filters below |
| GET | `/api/admin/enrollments/:id` | |
| POST | `/api/admin/enrollments` | creates enrollment **+ financial contract** together |
| PUT | `/api/admin/enrollments/:id` | only corrects `enrolled_at` |
| PATCH | `/api/admin/enrollments/:id/status` | active/inactive/completed/cancelled |
| GET | `/api/admin/enrollments/:id/class-change-impact` | preview before change |
| POST | `/api/admin/enrollments/:id/change-class` | same-course only, audited |

### Supporting addition

`GET /api/admin/courses/:id/pricing-plans` — lists a course's **active**
pricing plans. Nothing in the backend read `course_pricing_plans` before
this phase; this was a prerequisite for the enrollment-creation UI to let
the admin pick a plan.

All endpoints: `authenticateToken` + `authorizeRoles("admin")`. Identity for
audit fields (`class_changed_by_user_id`, self-action guards) always comes
from `req.auth.userId`, never from the request body.

## DTOs

```js
// Class
{
  id, name,
  course: { id, name },
  teacher: { id, name } | null,   // never actually null — classes.teacher_id is NOT NULL
  status, shift, startDate, endDate,
  activeEnrollments, sessionCount
}

// User
{
  id, name, email, role, status,
  linkedEntity: { type: "student" | "teacher", id, displayName } | null,
  createdAt
}

// Enrollment
{
  id,
  student: { id, name, registrationNumber },
  course: { id, name },
  class: { id, name } | null,
  status, enrolledAt,
  financialContract: { id, status } | null
}
```

No `SELECT *`, no `password_hash`/tokens ever returned. List endpoints
return `{ data, summary, pagination }` — `summary` is computed unfiltered
(global counts for the stat cards, independent of the current page/filter,
otherwise the cards would jump around as the admin filters/paginates).

## Business rules

### Distinction: users vs. students vs. teachers

`users` = authentication identity (role, status, credentials).
`students`/`teachers` = academic/professional identity, with their own
duplicated `name`/`email` columns (pre-existing schema design, not
introduced here). `UsersAdmin` makes this explicit in its own copy and
**does not duplicate** the existing student/teacher creation flows — those
already do the `users` + entity transaction correctly
(`adminStudentService.createStudent` / `adminTeacherService.createTeacher`).
`POST /api/admin/users` only creates plain `admin` accounts.

`PUT /api/admin/users/:id` updates `name`/`email`/`gender` on `users` **and**
syncs the same fields into the linked `students`/`teachers` row, in the same
transaction — the schema stores these fields twice, and not syncing them
would silently diverge the two admin screens.

### Class lifecycle

- Create/update require an existing course and an existing, **active**
  teacher. `course_id` is immutable after creation — a class's activities
  and course contents are tied to it via their own `course_id`/`class_id`
  pair, and nothing in the schema validates that pair stays consistent if
  the class moved to a different course.
- No real uniqueness constraint on `classes.name` exists in the schema —
  duplicate-name prevention (same name + same course, non-finished status)
  is an application-level heuristic, documented as such, not a DB rule.
- Deletion: `classes.id` is referenced by `class_sessions` with `ON DELETE
  CASCADE`, and `class_sessions.id` cascades again into `attendance`. A
  naive `DELETE FROM classes` could silently wipe attendance history even
  though `activities`/`course_contents` (RESTRICT) would block it in other
  cases, and `enrollments.class_id` would silently become `NULL` (`SET
  NULL`). Because of this, `DELETE /api/admin/classes/:id` computes impact
  (active enrollments, activities, course contents, sessions, attendance)
  and only executes a physical delete when **all five are zero**; otherwise
  it returns 409 with the impact payload. Archiving
  (`PATCH /status → inactive`) is always available regardless.

### Enrollment lifecycle

- `enrollments` has a real `UNIQUE (student_id, course_id)` constraint — a
  student can only have one enrollment row per course, regardless of class.
  This means **changing class is always an UPDATE of the existing row**,
  never a new enrollment.
- `student_id` always validates against `students.id`; nothing accepts
  `users.id` for this field.
- A class given at creation must belong to the given course (409 otherwise).
- Cancel/complete/reactivate only ever change the enrollment's own `status`
  column — submissions, grades, progress, attendance, and financial history
  are never touched by these transitions.
- `'locked'` (the 5th value in the real status enum) is intentionally
  **excluded** from the generic `PATCH /status` endpoint — it has its own
  `lock_reason`/`locked_by_user_id` columns implying a more careful,
  probably override-driven flow (e.g. financial overdue) that wasn't part of
  this phase's request.
- Changing course is explicitly blocked (409) — swapping `course_id` on an
  existing enrollment has bigger academic/financial consequences (contract
  tied to the old course's pricing plan, progress tied to the old course's
  content) than this phase's scope covers. Documented as a future,
  dedicated flow.

### Automatic financial contract on enrollment

Per explicit product decision, `POST /api/admin/enrollments` creates the
enrollment **and** a `financial_contracts` row in the same transaction,
copying the selected `course_pricing_plans` row's billing fields
(`billing_type`, `total_amount`, installment fields, accepted payment
methods) with `status = 'pending'`.

**Explicit limitation, not built in this phase:** no `invoices` rows are
generated. Nothing in the codebase (before or after this phase) generates
invoices from a contract — that would mean building an installment/due-date
schedule engine from scratch, which wasn't requested. If invoice generation
is wanted, it should be scoped as its own task rather than folded silently
into enrollment creation.

A course with no active pricing plan cannot receive new enrollments through
this endpoint (`pricing_plan_id` is required) — the modal surfaces this
clearly rather than silently creating a contract-less enrollment.

### Class-change audit trail

No general-purpose audit log table exists in the schema. Rather than
introduce one, migration `20260803_001_add_class_change_audit_to_enrollments.sql`
adds three columns directly to `enrollments`:
`class_change_reason`, `class_changed_at`, `class_changed_by_user_id`
(the last one a plain `INT`, no FK — mirroring the existing convention of
`locked_by_user_id`/`reactivated_by_user_id` on the same table). Applied
manually by the project owner (the app's DB user has no `ALTER` privilege).

`POST /:id/change-class` only allows moving within the **same course**,
requires the enrollment to be `active`, and returns the previous class's
impact (activities/contents/submissions/attendance counts) — informational,
since nothing is deleted by the move (those records stay tied to their own
`class_session_id`/`activity_id`, not to the enrollment). `GET
/:id/class-change-impact` exposes the same calculation as a preview, so the
admin sees it before confirming, not just after.

### Role change

`PATCH /api/admin/users/:id/role` is blocked (409) whenever the target
already has a linked `students`/`teachers` row — converting one entity type
into another would require a data migration this version doesn't have
(different required fields, no conversion flow). In practice this means the
endpoint only does something for accounts with no academic/professional
entity (plain admins). Documented as a deliberate, conservative limitation
rather than building entity-conversion logic.

### Self-action and last-admin protection

An admin can never inactivate, block, delete, or change the role of their
**own** account through these endpoints (409, checked server-side, not just
hidden in the UI). Inactivating or demoting the **last active admin** is
blocked the same way. Not exercised against the two real admin accounts in
this environment during testing (to avoid touching production-like data);
verified via code review and via non-boundary cases (a throwaway third admin
account, created and deleted for the test).

## Filters & pagination

All three list endpoints validate `page`/`limit` (capped at 100) and use
parameterized queries throughout. No unfiltered full-table scan without a
`LIMIT`.

- Classes: `search, courseId, teacherId, status, shift, page, limit`
- Users: `search, role, status, linkedEntityType, page, limit`
- Enrollments: `search, studentId, courseId, classId, status, from, to, page, limit`

## Transactions

Used wherever more than one table (or more than one logically-atomic
statement) is involved: `createClass`/`updateClass` (course/teacher
validation + duplicate check + insert/update), `updateUser` (users +
students/teachers sync), `createEnrollment` (enrollment + financial
contract, full rollback on any validation failure — no orphaned contract is
possible), `changeEnrollmentClass` (impact calculation + update, same
connection). No transaction stays open across an email send — password
reset happens outside any transaction.

## Security

- `authenticateToken` + `authorizeRoles("admin")` on every route.
- Identity for audit/self-checks always from `req.auth.userId`.
- No endpoint accepts or returns `password_hash`, refresh tokens, or
  password-reset tokens.
- IDOR-relevant IDs (`student_id`, `course_id`, `class_id`, `pricing_plan_id`)
  are always re-validated against the database inside the service, never
  trusted from the client beyond existence/ownership checks.
- Field allowlists: request bodies are destructured field-by-field into
  each service function's payload — no mass assignment of arbitrary body
  keys into a SQL statement.

## Tests performed

Full HTTP path (self-signed JWTs against a disposable local backend
instance on a throwaway port — never the developer's running dev server
until explicitly authorized to restart it once) plus direct service-level
calls against the real database, with all test-created rows cleaned up
immediately after (verified row counts back to baseline: 20 classes, 80
users, 117 enrollments, 13 financial contracts).

- Classes: create/edit/duplicate name (409)/course-or-teacher-not-found
  (404)/date validation (400)/status change/delete blocked by impact
  (409)/delete of an empty class (success)/all filters/pagination/403 for
  non-admin roles.
- Users: list/filter by role/create admin/duplicate email
  (409)/update-with-rollback-on-conflict (verified no partial write)/status
  toggle/self-protection (409)/role-change blocked for linked entities
  (409)/role no-op/password reset (reused flow, verified via the existing
  Ethereal test-mailer preview)/404 for missing user/403 for non-admin.
- Enrollments: create with automatic contract (verified the
  `financial_contracts` row directly)/student-or-course-not-found
  (404)/class-from-wrong-course (409)/plan-from-wrong-course (409)/missing
  plan (400)/duplicate enrollment (409, rollback verified — no orphaned
  contract)/status transitions/`'locked'` rejected (400)/change-class
  (impact preview, same-class rejection, cross-course rejection, audit
  columns persisted correctly, blocked on non-active enrollments)/all
  filters/pagination/403 for non-admin.
- Regression: dashboards (admin/teacher), courses, students, teachers,
  financial summary/contracts, admin calendar events, teacher
  activities/classes/calendar, login rejection — all still 200/401 as
  expected after the accumulated `server.js` changes.
- `npm run build` — passes.
- `npm run lint` — baseline moved from 47 (end of Phase 1) to 52 across this
  phase's checkpoints; every new error is the same `react-hooks/set-state-in-effect`
  pattern already present and accepted since `FinancialDashboard.jsx`, not a
  new category. Not mass-fixed, per instruction.
- Not performed: live browser click-through (would require typing a real
  login password, which isn't done even for local dev) — deferred to the
  project owner's own manual pass.

## Limitations / not implemented in this phase

- No invoice generation from the auto-created financial contract (see
  above).
- No pricing-plan management UI — `course_pricing_plans` is read-only in
  this phase; a course with none configured simply can't receive new
  enrollments yet.
- Role change is effectively a no-op for any account with an academic or
  professional entity.
- `'locked'` enrollment status isn't manageable through the generic status
  endpoint.
- No dedicated audit log table — class-change history lives directly on
  `enrollments`, not in a reusable log others could plug into later.
- `relational-model.md`, `business-rules.md`, and the Mermaid diagrams
  referenced in the original task instructions are **not present on this
  branch** (they exist only on the separate, unmerged
  `feature/coursehub-documentation` branch) — nothing to update here without
  merging that branch first, which wasn't requested. `docs/features/`
  (this file, plus Phase 1's `dashboard-foundation.md`) is the only docs
  location that exists on `main`.
