# Admin Learning Management (Phase 3)

Status: implemented, pending final approval before commit.
Branch: `feature/admin-learning-management` (off `main`, which already contains
Phases 1 and 2 — dashboards, `QuickActionsCard`, classes/users/enrollments
administration).

## Objective

Give the admin role global CRUD over course materials, activities, and
assessments — reusing the exact scope rules (`class_id IS NULL` = general,
`class_id` set = class-specific) and the same underlying tables
(`course_contents`, `activities`) already used by the teacher/student flows,
instead of inventing parallel entities.

## Architecture

`frontend page → apiFetch → admin route → admin service → shared
scope/access helpers → db.promise() → DTO → frontend`. No inline logic in
`server.js` beyond `require` + `app.use`.

### New files

```
backend/routes/adminContentRoutes.js
backend/routes/adminActivityRoutes.js
backend/services/admin/adminContentService.js
backend/services/admin/adminActivityService.js
backend/services/activities/activityQuestionService.js   (shared, see below)

coursehub/src/pages/admin/MaterialsAdmin.jsx
coursehub/src/pages/admin/ActivitiesAdmin.jsx
coursehub/src/pages/admin/AssessmentsAdmin.jsx
coursehub/src/components/admin/AdminContentModal.jsx
coursehub/src/components/admin/AdminActivitiesPage.jsx    (shared, see below)
coursehub/src/services/AdminContentService.jsx
coursehub/src/services/AdminActivityService.jsx
```

### Modified files

```
backend/server.js                                          — 2 require + 2 app.use
backend/services/activities/teacherActivityService.js       — refactored to use
                                                                the new shared
                                                                activityQuestionService
                                                                (see below); zero
                                                                behavior change,
                                                                verified by regression
backend/services/calendar/adapters/activityCalendarAdapter.js       — admin deepLink
                                                                        (was null)
backend/services/calendar/adapters/courseContentCalendarAdapter.js  — admin deepLink
                                                                        fix (was
                                                                        silently
                                                                        returning the
                                                                        student link)
coursehub/src/components/teachers/ActivityModal.jsx          — new optional
                                                                `endpoints` prop
                                                                (see below)
coursehub/src/routes/Router.jsx                               — 3 new admin routes
coursehub/src/components/NavbarAdmin.jsx                      — split "Atividades e
                                                                Avaliações" into two
                                                                links (Materiais was
                                                                already linked)
coursehub/src/pages/admin/DashboardAdmin.jsx                  — 1 new Quick Action
                                                                ("Gerenciar materiais")
```

## Why one service handles both activities and exams

`activities.activity_kind` (`'activity'` | `'exam'`) is the only thing
distinguishing a task from an assessment — same table, same columns, same
`activity_questions`/`activity_options`/`submissions`/`grades` relationships.
Building two parallel services would duplicate every validation and query.
Instead:

- `adminActivityService.js` takes `activityKind` as an explicit parameter on
  every function — **never read from the request body**. All reads
  (`getActivityById`, list filters) and writes (`updateActivity`,
  `updateActivityStatus`, `deleteActivity`) filter by
  `WHERE id = ? AND activity_kind = ?`, so an exam's ID returns 404 through
  the activities routes and vice versa — verified over HTTP, not just by
  code review.
- `adminActivityRoutes.js` mounts two identical sets of REST routes
  (`/admin/activities/*` and `/admin/assessments/*`) through one
  `mountKindRoutes(prefix, activityKind, labels)` helper — the kind is
  closed over at mount time, so there is no code path where a client value
  can select it.
- On the frontend, `AdminActivitiesPage.jsx` is the same pattern already
  used by the pre-existing `TeacherActivitiesPage.jsx` (an `activityKind`
  prop swaps vocabulary and which cards show), just wired to the admin
  backend with server-side pagination/filters instead of the teacher page's
  client-side filtering.

### Shared question/option validation — `activityQuestionService.js`

`teacherActivityService.js` already had ~100 lines of question/option
validation and a deep-equality diff (used to decide whether an edit changed
actual quiz structure vs. just general fields) that the admin side needed
verbatim. Rather than duplicate it, that logic was extracted into
`services/activities/activityQuestionService.js`
(`validateQuestions`, `isOptionCorrect`, `buildQuestionStructureForDiff`,
`haveQuestionsChanged`), and **`teacherActivityService.js` itself was
refactored to import from it** instead of keeping local copies. This was
the highest-risk change in this phase (it touches a file real teachers use
today), so it was verified with a dedicated regression script before and
after: create with questions, edit-with-no-submissions (structure replaced),
edit-with-submissions (structural change blocked with 409, general-field
change still allowed) — all three produced byte-identical behavior to the
pre-refactor version.

### Adapting `ActivityModal.jsx` instead of building a new admin modal

The existing teacher `ActivityModal.jsx` was already close to config-driven
(`mode`, `activityKind`, `courses`, `classes`, `userId`) — only its
fetch/save endpoints were hardcoded to teacher-scoped URLs. It now accepts
an optional `endpoints` prop (`{ fetchDetail, create, update }`); when
omitted, behavior is byte-identical to before (verified). `AdminActivitiesPage.jsx`
passes admin-scoped endpoints; no separate `AdminActivityModal.jsx` was
built, avoiding a second ~700-line copy of the question/option editor UI.

## Endpoints

### Materials (`course_contents`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/materials` | paginated, filters below |
| GET | `/api/admin/materials/:id` | |
| GET | `/api/admin/materials/:id/scope-impact?newClassId=` | preview before scope change |
| GET | `/api/admin/materials/:id/impact` | preview before delete |
| POST | `/api/admin/materials` | |
| PUT | `/api/admin/materials/:id` | `course_id` immutable |
| PATCH | `/api/admin/materials/:id/status` | |
| DELETE | `/api/admin/materials/:id` | only when zero `student_content_progress`, else 409 |

### Activities / Assessments (`activities`, kind forced server-side)

| Method | Path (activities / assessments) |
|---|---|
| GET | `/api/admin/activities` · `/api/admin/assessments` |
| GET | `/api/admin/{..}/:id` |
| GET | `/api/admin/{..}/:id/impact` |
| POST | `/api/admin/{..}` |
| PUT | `/api/admin/{..}/:id` |
| PATCH | `/api/admin/{..}/:id/status` |
| DELETE | `/api/admin/{..}/:id` |

Supporting addition also used by enrollments (Phase 2):
`GET /api/admin/courses/:id/pricing-plans` was already there; no new
course-related endpoint was needed here.

All endpoints: `authenticateToken` + `authorizeRoles("admin")`.

## `course_contents.type` — confirmed legacy values excluded

The enum still contains `'activity'`/`'assessment'`, and **19 rows are
actually populated** with those types (pre-dating the dedicated `activities`
table). `courseContentScopeService.js` already defines
`CONTENT_TYPES = ["video", "pdf", "text", "live_class"]` and both
`teacherCourseContentService.js` and `studentCourseContentService.js`
already filter every query by it — those 19 rows are already invisible to
teachers and students today. `adminContentService.js` reuses the same
constant; `MaterialsAdmin` never lists, creates, or edits those legacy rows.
Nothing was migrated or deleted — see known issues.

## Business rules

### Materials

- `course_id` required and immutable after creation; `class_id` optional,
  must belong to the same course (409 otherwise).
- `content_url` required for `video`/`pdf`/`live_class`; `content_text`
  required for `text` — validation that didn't exist even on the teacher
  side, added only in the admin service per instruction.
- **`due_date` is rejected for `type = 'live_class'`** (see known issues —
  this preserves the calendar's existing dedup convention against
  `class_sessions`).
- Scope changes (`class_id` null↔set, or between classes) never block or
  silently drop anything. `getContentScopeImpact` computes
  `studentsLosingAccess`/`studentsGainingAccess` (from `enrollments`) and
  `existingProgressOutsideNewScope` (from `student_content_progress`);
  the frontend requires an explicit confirmation step showing these numbers
  before the actual `PUT` is sent.
- Deletion: `course_contents.id` cascades into `student_content_progress`
  (`ON DELETE CASCADE`) — a naive physical delete would silently wipe
  student progress. `deleteMaterial` computes the count first and only
  deletes when it's zero, otherwise 409 with the impact.

### Activities / Assessments

- `activity_kind` can never be set or changed by the client — it's a
  parameter injected by the route, and the update path additionally
  re-validates the existing row's kind matches before allowing any change.
  Converting activity↔exam is therefore not a blocked *feature* — it's
  structurally impossible through these endpoints.
- `class_id` must belong to `course_id` (409 otherwise), reusing
  `activityScopeService.validateClassBelongsToCourse` (already a pure,
  ownership-agnostic function — no adaptation needed).
- Structural changes to questions/options are blocked (409) once any
  submission exists, exactly mirroring the teacher rule; general fields
  (title, description, due date, status) remain editable regardless.
- **New rule, admin-only**: once any `grades` row exists for an activity,
  `max_score` can no longer be changed (409) — changing it would silently
  invalidate already-computed grades. This does not exist on the teacher
  side; it wasn't requested there and wasn't added to avoid scope creep on
  a live path.
- Deletion is blocked (409, with the submission/grade counts) whenever any
  submission or grade exists; status changes (including archiving) remain
  available regardless, so an admin can always take a live item out of
  circulation without needing to delete it.

## DTOs

```js
// Content (Material)
{
  id, title, description, type, contentUrl, contentText,   // contentText
  course: { id, name },                                     // truncated to
  class: { id, name } | null,                                // 200 chars in
  scopeLabel, isRequired, orderIndex, dueDate, status,       // listings only
  progressCount, createdAt, updatedAt
}

// Activity / Assessment
{
  id, activityKind, title, description, type,
  course: { id, name },
  class: { id, name } | null,
  teacher: { id, name } | null,     // the course's responsible teacher
  scopeLabel, dueDate, maxScore, orderIndex, isRequired, status,
  questionCount,
  submissionCounts: { total, pendingReview, graded },
  createdAt, updatedAt
  // detail adds: questions: [{ id, question_text, question_type, points,
  //                            order_index, options: [...] }]
}
```

List endpoints return `{ data, summary, pagination }`; `summary` is a
single aggregate query per list (global counts, independent of the current
filter/page).

## Filters & pagination

- Materials: `search, courseId, classId, type, status, isRequired, scope, from, to, page, limit`
- Activities/Assessments: `search, courseId, classId, teacherId, status, type, from, to, scope, page, limit`

All parameterized; `page`/`limit` validated and capped at 100.

## Transactions

`createMaterial`/`updateMaterial`, `createActivity`/`updateActivity` (activity
row + questions + options together, `FOR UPDATE` locked on update to avoid a
concurrent submission landing mid-edit), `deleteMaterial`/`deleteActivity`
(impact check + delete in the same transaction, no TOCTOU gap).

## Calendar integration

No changes to the calendar's architecture. Both `activityCalendarAdapter.js`
and `courseContentCalendarAdapter.js` already query `activities`/
`course_contents` directly with no caching — anything created, edited, or
status-changed through these new admin endpoints appears on the next
calendar query automatically. Verified end-to-end: created a real
`course_contents` row with a `due_date` through `adminContentService`,
confirmed it appeared immediately in `getCourseContentCalendarEvents`, then
cleaned it up.

Two small pre-existing gaps fixed in the adapters (not part of the calendar
architecture, just their per-role `deepLink` logic):

- Admin activity/exam events had `deepLink: null` (no admin detail page
  existed before this phase) — now point to `/admin/atividades` /
  `/admin/avaliacoes`.
- Admin course-content events were falling into the `else` branch and
  incorrectly returning the **student's** deep link — now correctly return
  `/admin/materiais`.

`live_class` dedup with `class_sessions` (the concern flagged in the
diagnosis) still holds: all 8 `live_class` rows have `due_date = NULL`, and
`AdminContentModal`/`adminContentService` now actively enforce that (see
known issues — it's still an application convention, not a DB constraint).

## Security

- `authenticateToken` + `authorizeRoles("admin")` on every route.
- IDOR: every ID (`courseId`, `classId`, activity/content `id`) is
  re-validated against the database inside the service; `activity_kind`
  is never accepted from the client in any form.
- No mass assignment — every service destructures the exact fields it
  expects from the payload.

## Tests performed

Direct service-level calls against the real database plus full HTTP path
(self-signed JWTs against disposable local backend instances on throwaway
ports — the developer's running dev server was never touched this phase),
with every test-created row cleaned up and row counts verified back to
baseline after each checkpoint (20 activities, 108 course_contents, 6
submissions, 4 grades, 9 activity_questions, 12 activity_options).

- Materials: general/class-specific creation, class-from-wrong-course (409),
  type validation, required-field-per-type validation, `live_class` +
  `due_date` rejection (400), scope change with real impact numbers (8
  students losing access, 0 gaining, verified against real enrollment
  data), archive, delete blocked by real progress data (409) and allowed
  when none, filters, pagination, teacher role → 403.
- Activities: creation with questions/options, course/class validation,
  structural-change-blocked-by-submissions (409) vs. general-field-only
  edit allowed, `max_score` blocked once a grade exists (409, new rule),
  delete blocked by real submission/grade data (409) with impact, status
  changes still allowed regardless, filters, pagination, teacher role → 403.
- Assessments: same suite, plus the kind-isolation boundary tested over
  **both** read and write (`GET` and `PATCH .../status` on an exam's ID
  through the `/activities` routes both return 404), submission/grade
  preservation verified by direct re-query after archiving.
- Regression: `teacherActivityService.js` refactor verified byte-identical
  before/after; full sweep of dashboards (admin/teacher), classes/users/
  enrollments admin, teacher activities/classes/calendar, student
  courses/calendar, financial summary, admin calendar events, login
  rejection, unknown-route 404 — all unaffected by the accumulated
  `server.js` changes across this phase.
- `npm run build` — passes.
- `npm run lint` — baseline moved from 55 (end of Phase 2) to 57 across
  this phase; both new errors are the same `react-hooks/set-state-in-effect`
  pattern already accepted since `FinancialDashboard.jsx`. One genuine new
  `exhaustive-deps` warning introduced while adapting `ActivityModal.jsx`
  was fixed (wrapped the endpoint-builder in `useCallback`) rather than
  left in the baseline. Not mass-fixed elsewhere, per instruction.
- Not performed: live browser click-through (would require typing a real
  login password) — deferred to the project owner's own manual pass.

## Limitations / known issues

- The 19 legacy `course_contents` rows with `type IN ('activity',
  'assessment')` are excluded everywhere (teacher, student, and now admin)
  but not migrated or cleaned up — see `docs/known-issues/knownissues.txt`.
- `live_class` / calendar dedup remains an **application convention**
  (`due_date IS NULL`), not a database constraint — `adminContentService`
  enforces it going forward, but nothing prevents a future direct DB write
  from breaking the assumption. Documented as a known issue rather than
  adding a CHECK constraint not requested in this phase.
- `relational-model.md`, `business-rules.md`, and the Mermaid diagrams
  referenced in the original task instructions remain absent from this
  branch (same situation noted in the Phase 2 doc) — they exist only on
  the separate, unmerged `feature/coursehub-documentation` branch.
