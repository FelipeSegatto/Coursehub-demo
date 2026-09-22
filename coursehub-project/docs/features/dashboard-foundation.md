# Dashboard Foundation (Phase 1)

Status: implemented, pending final approval before commit.
Branch: `feature/dashboard-foundation` (off `main`).

## Objective

Replace the fully-mocked `DashboardProfessor` and `DashboardAdmin` pages with
dashboards backed by real aggregated data, and standardize `QuickActionsCard`
so it can express both navigational actions (`to`) and imperative actions
(`onClick`), including a disabled state with a visible reason. This is Phase 1
of a 5-phase plan; phases 2–5 (dedicated pages for turmas/matrículas/notas/etc.
at the admin level) are out of scope here and are listed under "Future" below.

## Backend

### New files

- `backend/services/dashboard/teacherDashboardService.js` — exports
  `getTeacherDashboard(db, userId)`.
- `backend/services/dashboard/adminDashboardService.js` — exports
  `getAdminDashboard(db, userId)`.
- `backend/routes/teacherDashboardRoutes.js` — `GET /teacher/dashboard`.
- `backend/routes/adminDashboardRoutes.js` — `GET /admin/dashboard`.
- `backend/server.js` — 2 `require` + 2 `app.use("/api", ...)` lines added to
  the existing router-mount block. No other change to this file.

### Endpoints

| Method | Path                     | Role required | Identity source     |
|--------|--------------------------|----------------|---------------------|
| GET    | `/api/teacher/dashboard` | `teacher`      | `req.auth.userId`   |
| GET    | `/api/admin/dashboard`   | `admin`        | `req.auth.userId`   |

Both routes follow the existing convention: `authenticateToken` +
`authorizeRoles(...)`, thin route handler, all logic in the service file,
errors surfaced as `res.status(error.statusCode || 500).json({ message, error, code, sqlMessage })`.

### Teacher dashboard — data sources and DTO

```
{
  summary: {
    activeClasses,          // classes.status = 'active', teacher_id = ?
    uniqueActiveStudents,   // see "Aluno acompanhado" below
    pendingReviews,         // submissions.status IN ('submitted','pending_review')
    upcomingCommitments,    // calendarResult.counts.total (next 7 days)
  },
  pendingReviews: [
    { activityId, title, activityKind, courseName, className, dueDate,
      totalSubmissions, pendingCount, deepLink }
  ], // limit 5, ordered by due_date (nulls last)
  upcomingSessions: [
    { sessionId, sessionDate, startTime, endTime, title, status,
      classId, className, deepLink }
  ], // limit 5, next 7 days, status = 'scheduled'
  classesOverview: [
    { classId, className, courseName, activeStudentCount, nextSessionDate,
      averageAttendancePercentage } // null when no attendance record exists yet
  ], // limit 5
  upcomingEvents: [ ... ] // first 5 entries from calendarAggregationService, role: "teacher"
}
```

**"Aluno acompanhado pelo professor"** — the spec left this ambiguous
(a class-scoped teacher may also have students enrolled generally, without a
class). Rather than mutating real enrollment data with a fabricated class
assignment, the count uses a query-level rule: a student counts if they hold
an **active** enrollment either (a) in one of the teacher's classes, or
(b) in one of the teacher's courses with no class assigned
(`enrollments.class_id IS NULL`). See the `TEACHER_STUDENT_SCOPE_JOIN` /
`_CONDITION` constants in `teacherDashboardService.js`.

**Reused as-is, no duplication**: `getTeacherIdByUserId` from
`services/classes/classAccessService.js`; `aggregateCalendarEvents` from
`services/calendar/calendarAggregationService.js`.

### Admin dashboard — data sources and DTO

```
{
  summary: { activeUsers, activeEnrollments, activeCourses, activeClasses },
  financial: { paidAmount, openAmount, overdueAmount, overdueInvoices },
  academic: { activeStudents, activeTeachers, openActivities, pendingSubmissions },
  administrativePendingItems: [
    { type, label, count, deepLink } // only included when count > 0
  ],
  upcomingEvents: [ ... ] // first 8 entries, role: "admin" (deepLink always null — no admin activity-detail page exists yet)
}
```

`administrativePendingItems` currently covers two conditions with an
objective, schema-backed definition:

- `courses_without_teacher` — active courses with `teacher_id IS NULL`.
  This is documented elsewhere as expected behavior, not a bug
  (`courses.teacher_id` is nullable by design), but it's still useful as an
  admin follow-up item.
- `sessions_past_without_attendance` — `class_sessions` still `'scheduled'`
  with `session_date < CURDATE()`.

**Explicitly excluded** (no objective rule exists yet, not invented):
"matrículas pendentes" (`enrollments.status` has no `'pending'` value — enum
is `active/inactive/completed/cancelled/locked`) and "contratos incompletos"
(no defined criteria in `financial_contracts`).

**Reused verbatim, no duplication**: `getFinancialDashboardSummary(db)` from
`services/financial/adminFinancialReadService.js` supplies the entire
`financial` section; `aggregateCalendarEvents` supplies `upcomingEvents`.

### Performance

Both services run every independent query through a single `Promise.all` —
7 parallel operations for the teacher dashboard, 4 for the admin dashboard.
No query runs inside a loop; per-class and per-activity aggregates
(`listClassesOverview`, `listPendingReviewActivities`) use `GROUP BY` /
subquery joins (`enrollment_stats`, `attendance_stats`) rather than N+1
per-row queries.

## Frontend

### `QuickActionsCard` — new contract

`components/ui/QuickActionsCard.jsx` now accepts
`{ title, description, icon, to, onClick, disabled, disabledReason }`:

- `to` present (and not disabled) → renders a `react-router-dom` `Link`.
- `onClick` present, no `to` (and not disabled) → renders a `button`.
- `disabled: true` → always renders a `button disabled`, never a `Link`
  (an anchor can't be truly disabled without still being clickable), shows
  `disabledReason` as visible text plus `title`/`aria-disabled` for
  accessibility.
- Never both `to` and `onClick` handled at once, and never a nested
  interactive element inside the card.

Backward compatible: the 3 existing consumers
(`AdminManagementPage.jsx`, `TeacherManagementPage.jsx`,
`StudentManagementPage.jsx`) only ever passed `title`/`description`/`onClick`
and continue to work unchanged; they were updated to also forward
`icon`/`to`/`disabled`/`disabledReason` so new callers can use the full
contract through those shells.

`pages/admin/CourseAdmin.jsx` had two literal `onClick: () => {}` no-ops
("Gerenciar acessos", "Acompanhar métricas dos cursos"). No page exists for
either in `Router.jsx`, so both were changed to `disabled: true` with a
`disabledReason` rather than inventing a route.

**Known, not fixed in this phase**: the same `onClick: () => {}` pattern
also exists in `pages/admin/TeachersAdmin.jsx`, `pages/admin/StudentsAdmin.jsx`,
`components/teachers/TeacherActivitiesPage.jsx`,
`pages/professor/MaterialProfessor.jsx`, and
`pages/professor/MyClassesProfessor.jsx`. Out of scope for this task (only
`CourseAdmin.jsx` was requested); left as a known issue.

### `services/DashboardService.jsx` (new)

Two functions, `getTeacherDashboard()` / `getAdminDashboard()`, following the
exact shape of `FinancialService.jsx` — thin wrappers around `apiFetch`.

### `DashboardProfessor.jsx` / `DashboardAdmin.jsx`

Both rewritten from 100%-mocked arrays to real data with loading / error
(with retry) / empty states per section. Visual identity (headline, stat
grid, quick actions panel, blue CTA banner) preserved; only the data source
and a couple of section labels changed. Sections with no real backing data
source were **removed** rather than left mocked or invented:

- Teacher: no change of section count, "Atividade recente" replaced by
  "Próximos encontros" (`upcomingSessions`) since no generic activity-feed
  data source exists.
- Admin: "Cursos em destaque" (per-course completion %) and "Certificados
  emitidos" removed — no aggregation for either exists, and building one
  for completion % would require a new, non-trivial join not requested in
  this phase. Replaced with a "Resumo financeiro" panel reusing the
  existing `financial` DTO fields.

## Security

Both endpoints require `authenticateToken` + `authorizeRoles("teacher"|"admin")`.
Identity is always read from `req.auth.userId` (JWT subject), never from a
URL parameter.

## Tests performed

- Direct service-level calls against the real database
  (`getTeacherDashboard(db, 11)`, `getAdminDashboard(db, 42)`) — verified
  shape and plausibility of every field.
- `npm run build` (frontend) — passes.
- `npm run lint` (frontend) — baseline went from 45 to 47 problems (+2
  errors). Both new errors are `react-hooks/set-state-in-effect`, the same
  pattern already present and accepted in `FinancialDashboard.jsx`; not a
  new category of issue, not mass-fixed per instructions.
- Full HTTP authorization matrix against the restarted dev backend, using
  JWTs self-signed with the app's own `JWT_SECRET` (no real user password
  used or required):
  - teacher token → `/api/teacher/dashboard` → 200
  - teacher token → `/api/admin/dashboard` → 403
  - admin token → `/api/admin/dashboard` → 200
  - admin token → `/api/teacher/dashboard` → 403
  - student token → both → 403
  - no cookie → 401
  - malformed cookie → 401
- Regression check on 3 pre-existing endpoints after the `server.js` mount
  change (`/api/admin/financial/dashboard/summary`,
  `/api/teacher/by-user/:id/activities`,
  `/api/teacher/by-user/:id/calendar`) — all still 200.
- Link audit: every `to` target used in the two rewritten dashboards and in
  `CourseAdmin.jsx`'s quick actions exists in `routes/Router.jsx`; no new
  dead links introduced.
- Not performed: live browser click-through. Doing so would require typing
  a real user's password into the login form, which isn't done even for a
  local dev instance; deferred to the user's own manual check.

## Future (phases 2–5, not implemented here)

Planned navigation entries referenced by the original 5-phase plan
(turmas/matrículas/notas administration pages, etc.) are intentionally
**not** added to `NavbarAdmin.jsx` / `NavbarProfessor.jsx` in this phase —
adding a nav entry without a corresponding route would just create a new
dead link, the exact problem already documented for the pre-existing dead
links in those two navbars. Phases 2–5 should add both the route and the
navbar entry together, in the same change.
