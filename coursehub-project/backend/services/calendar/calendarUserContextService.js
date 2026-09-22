const {
  getStudentIdByUserId,
  getTeacherIdByUserId,
} = require("../classes/classAccessService");

/**
 * Enriquece eventos derivados de entidades que possuem estado
 * específico por usuário. Na v1 a única fonte consultada é
 * `submissions` (para eventos sourceType:"activity"), mas a
 * assinatura já é genérica o bastante para acomodar outras fontes de
 * estado-por-usuário no futuro (certificados, progresso, pagamentos,
 * notificações) sem precisar renomear o service.
 *
 * Nunca consulta por evento — sempre em lote, por
 * `activity_id IN (...)`.
 */
async function getUserContextForEvents(db, { role, userId, basicEvents }) {
  const activityEvents = basicEvents.filter(
    (event) => event.sourceType === "activity"
  );

  if (activityEvents.length === 0) {
    return new Map();
  }

  const runner = db.promise();
  const activityIds = activityEvents.map((event) => event.sourceId);

  if (role === "student") {
    return getStudentActivityContext(runner, { userId, activityIds });
  }

  if (role === "teacher") {
    return getTeacherActivityContext(runner, { userId, activityIds });
  }

  return new Map();
}

async function getStudentActivityContext(runner, { userId, activityIds }) {
  const contextByEventId = new Map();

  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) return contextByEventId;

  const placeholders = activityIds.map(() => "?").join(", ");

  const [rows] = await runner.execute(
    `
      SELECT activity_id, status, score
      FROM submissions
      WHERE student_id = ?
        AND activity_id IN (${placeholders})
    `,
    [studentId, ...activityIds]
  );

  for (const row of rows) {
    const submitted = row.status !== "draft";
    const graded = row.status === "graded" || row.status === "returned";

    contextByEventId.set(`activity:${row.activity_id}`, {
      submissionStatus: row.status,
      submitted,
      pendingReview: row.status === "pending_review",
      graded,
      gradeAvailable: graded && row.score !== null,
      completed: graded,
    });
  }

  return contextByEventId;
}

async function getTeacherActivityContext(runner, { userId, activityIds }) {
  const contextByEventId = new Map();

  const teacherId = await getTeacherIdByUserId(runner, userId);

  if (!teacherId) return contextByEventId;

  const placeholders = activityIds.map(() => "?").join(", ");

  const [rows] = await runner.execute(
    `
      SELECT
        activity_id,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'graded' THEN 1 ELSE 0 END) AS graded
      FROM submissions
      WHERE activity_id IN (${placeholders})
      GROUP BY activity_id
    `,
    activityIds
  );

  for (const row of rows) {
    contextByEventId.set(`activity:${row.activity_id}`, {
      totalSubmissions: Number(row.total),
      pendingReviews: Number(row.pending),
      gradedSubmissions: Number(row.graded),
    });
  }

  return contextByEventId;
}

module.exports = { getUserContextForEvents };
