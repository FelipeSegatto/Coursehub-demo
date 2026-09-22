const {
  getStudentIdByUserId,
  getActiveEnrollmentForStudent,
  createServiceError,
} = require("../classes/classAccessService");

const {
  CONTENT_TYPES,
  withContentScopeFields,
} = require("./courseContentScopeService");

const { assertPublicCourse } = require("../public/publicCourseService");

/**
 * Valida um ID numérico positivo (course_id, etc).
 */
function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0
    ? normalized
    : null;
}

/**
 * Retorna os conteúdos GERAIS (class_id NULL) de um curso.
 * Usada pela rota pública GET /api/courses/:id/contents — nunca
 * deve expor conteúdo exclusivo de turma.
 */
async function getPublicCourseContents(db, courseId) {
  const normalizedCourseId = normalizePositiveId(courseId);

  if (!normalizedCourseId) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  await assertPublicCourse(db, normalizedCourseId);

  const typePlaceholders = CONTENT_TYPES.map(() => "?").join(", ");

  const [rows] = await db.promise().query(
    `
      SELECT
        id,
        course_id,
        title,
        description,
        type,
        order_index,
        is_required,
        status,
        due_date
      FROM course_contents
      WHERE course_id = ?
        AND status = 'active'
        AND class_id IS NULL
        AND type IN (${typePlaceholders})
      ORDER BY order_index ASC
    `,
    [normalizedCourseId, ...CONTENT_TYPES]
  );

  return rows;
}

/**
 * Retorna os conteúdos visíveis para um aluno autenticado em um
 * curso: gerais (class_id NULL) + exclusivos da turma da matrícula
 * ativa do aluno. Nunca inclui conteúdo de outra turma.
 */
async function getStudentCourseContents(db, { userId, courseId }) {
  const normalizedCourseId = normalizePositiveId(courseId);

  if (!normalizedCourseId) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const runner = db.promise();

  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const enrollment = await getActiveEnrollmentForStudent(runner, {
    studentId,
    courseId: normalizedCourseId,
  });

  if (!enrollment) {
    throw createServiceError(
      "O aluno não possui matrícula ativa neste curso.",
      403
    );
  }

  const typePlaceholders = CONTENT_TYPES.map(() => "?").join(", ");

  const [rows] = await runner.execute(
    `
      SELECT
        cc.id,
        cc.course_id,
        cc.class_id,
        cc.title,
        cc.description,
        cc.type,
        cc.content_url,
        cc.content_text,
        cc.order_index,
        cc.is_required,
        cc.status,
        cc.due_date,
        cc.created_at,
        cc.updated_at,

        cl.name AS class_name

      FROM course_contents cc

      LEFT JOIN classes cl
        ON cl.id = cc.class_id

      WHERE cc.course_id = ?
        AND cc.status = 'active'
        AND cc.type IN (${typePlaceholders})
        AND (
          cc.class_id IS NULL
          OR cc.class_id = ?
        )

      ORDER BY cc.order_index ASC
    `,
    [normalizedCourseId, ...CONTENT_TYPES, enrollment.class_id]
  );

  /*
   * Campos duplicados em camelCase e snake_case: componentes como
   * LessonPlayer.jsx leem content_url/content_text (snake_case) —
   * expor as duas formas evita quebrar quem já consome uma delas.
   */
  const contents = rows.map((row) =>
    withContentScopeFields(
      {
        id: row.id,
        courseId: row.course_id,
        title: row.title,
        description: row.description,
        type: row.type,

        contentUrl: row.content_url,
        content_url: row.content_url,
        contentText: row.content_text,
        content_text: row.content_text,

        orderIndex: row.order_index,
        order_index: row.order_index,
        isRequired: Boolean(row.is_required),
        is_required: Boolean(row.is_required),
        status: row.status,
        dueDate: row.due_date,
        due_date: row.due_date,
        createdAt: row.created_at,
        created_at: row.created_at,
        updatedAt: row.updated_at,
        updated_at: row.updated_at,
      },
      { classId: row.class_id, className: row.class_name }
    )
  );

  return {
    courseId: normalizedCourseId,
    classId: enrollment.class_id,
    contents,
  };
}

module.exports = {
  getPublicCourseContents,
  getStudentCourseContents,
};
