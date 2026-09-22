const {
  getStudentIdByUserId,
  getTeacherIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");

const GENERAL_SCOPE = "general";
const CLASS_SPECIFIC_SCOPE = "class_specific";

/**
 * "general" quando a atividade não pertence a nenhuma turma
 * específica, "class_specific" caso contrário.
 */
function resolveActivityClassScope(classId) {
  return classId ? CLASS_SPECIFIC_SCOPE : GENERAL_SCOPE;
}

/**
 * Confirma que uma turma já carregada pertence ao curso informado.
 * Função pura — não acessa o banco. Use
 * classAccessService.assertClassBelongsToCourseAndTeacher quando
 * a turma ainda precisar ser buscada/validada quanto à posse do
 * professor.
 */
function validateClassBelongsToCourse(classRow, courseId) {
  if (!classRow) {
    throw createServiceError("Turma não encontrada.", 404);
  }

  if (Number(classRow.course_id) !== Number(courseId)) {
    throw createServiceError(
      "A turma informada não pertence ao curso selecionado.",
      409
    );
  }

  return classRow;
}

/**
 * Regra de elegibilidade compartilhada entre listagem, detalhe,
 * submissão, correção e notas:
 *
 * activity.course_id = enrollment.course_id
 * AND enrollment.status = 'active'
 * AND (activity.class_id IS NULL OR activity.class_id = enrollment.class_id)
 *
 * Função pura — não acessa o banco.
 */
function validateStudentActivityScope(activity, enrollment) {
  if (!activity || !enrollment) return false;
  if (enrollment.status !== "active") return false;

  if (
    Number(enrollment.course_id) !== Number(activity.course_id)
  ) {
    return false;
  }

  if (activity.class_id === null || activity.class_id === undefined) {
    return true;
  }

  return Number(enrollment.class_id) === Number(activity.class_id);
}

/**
 * Busca a matrícula ativa do aluno (studentId já resolvido) no
 * curso da atividade e confirma que ela é elegível ao escopo da
 * atividade (geral ou mesma turma).
 *
 * Usada em contextos onde o studentId já foi resolvido pelo
 * chamador (ex.: dentro da transação de envio de submissão, ou ao
 * validar a matrícula do dono de uma submissão já carregada).
 *
 * Lança erros distintos para "não matriculado no curso" vs
 * "matriculado, mas em turma incompatível", preservando o texto já
 * usado hoje pelo projeto para o primeiro caso.
 */
async function getEligibleEnrollmentForActivity(
  runner,
  { studentId, activity }
) {
  const [rows] = await runner.execute(
    `
      SELECT id, student_id, course_id, class_id, status
      FROM enrollments
      WHERE student_id = ?
        AND course_id = ?
        AND status = 'active'
      LIMIT 1
    `,
    [studentId, activity.course_id]
  );

  const enrollment = rows[0] || null;

  if (!enrollment) {
    throw createServiceError(
      "Você não está matriculado neste curso.",
      403
    );
  }

  if (!validateStudentActivityScope(activity, enrollment)) {
    throw createServiceError(
      "Esta atividade não está disponível para a turma do aluno.",
      403
    );
  }

  return enrollment;
}

/**
 * Resolve o acesso completo de um aluno autenticado (userId) a uma
 * atividade: converte userId em studentId, busca a atividade ativa
 * e a matrícula elegível. Usada por listagem/detalhe, onde a
 * resposta correta para qualquer falha de escopo é "não
 * encontrada" (evita revelar que a atividade existe em outra
 * turma).
 */
async function getStudentActivityAccess(
  runner,
  { userId, activityId }
) {
  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const [activityRows] = await runner.execute(
    `
      SELECT
        a.id,
        a.course_id,
        a.class_id,
        a.activity_kind,
        a.title,
        a.description,
        a.type,
        a.due_date,
        a.max_score,
        a.order_index,
        a.is_required,
        a.status,
        a.created_at,
        a.updated_at,

        c.name AS course_title,
        cl.name AS class_name,

        sub.id AS submission_id,
        sub.status AS submission_status,
        sub.score AS submission_score,
        sub.feedback AS submission_feedback,
        sub.submitted_at,
        sub.graded_at

      FROM activities a

      INNER JOIN courses c
        ON c.id = a.course_id

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      LEFT JOIN submissions sub
        ON sub.activity_id = a.id
        AND sub.student_id = ?

      WHERE a.id = ?
        AND a.status = 'active'
        AND c.status = 'active'

      LIMIT 1
    `,
    [studentId, activityId]
  );

  const activity = activityRows[0] || null;

  const notFoundError = createServiceError(
    "Atividade não encontrada ou indisponível para este aluno.",
    404
  );

  if (!activity) {
    throw notFoundError;
  }

  const [enrollmentRows] = await runner.execute(
    `
      SELECT id, student_id, course_id, class_id, status
      FROM enrollments
      WHERE student_id = ?
        AND course_id = ?
        AND status = 'active'
      LIMIT 1
    `,
    [studentId, activity.course_id]
  );

  const enrollment = enrollmentRows[0] || null;

  if (!validateStudentActivityScope(activity, enrollment)) {
    throw notFoundError;
  }

  return { studentId, activity, enrollment };
}

/**
 * Resolve o acesso do professor autenticado (userId) a uma
 * atividade: converte userId em teacherId e confirma que a
 * atividade pertence a um curso do professor.
 */
async function validateTeacherActivityAccess(
  runner,
  { userId, activityId }
) {
  const teacherId = await getTeacherIdByUserId(runner, userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

  const [activityRows] = await runner.execute(
    `
      SELECT
        a.id,
        a.course_id,
        a.class_id,
        a.activity_kind,
        a.title,
        a.description,
        a.type,
        a.due_date,
        a.max_score,
        a.order_index,
        a.is_required,
        a.status,
        a.created_at,
        a.updated_at,

        c.name AS course_title

      FROM activities a

      INNER JOIN courses c
        ON c.id = a.course_id

      WHERE a.id = ?
        AND (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
          )
          OR c.teacher_id = ?
        )

      LIMIT 1
    `,
    [activityId, teacherId, teacherId]
  );

  const activity = activityRows[0] || null;

  if (!activity) {
    throw createServiceError(
      "Atividade não encontrada ou não pertence ao professor.",
      404
    );
  }

  return { teacherId, activity };
}

module.exports = {
  GENERAL_SCOPE,
  CLASS_SPECIFIC_SCOPE,
  resolveActivityClassScope,
  validateClassBelongsToCourse,
  validateStudentActivityScope,
  getEligibleEnrollmentForActivity,
  getStudentActivityAccess,
  validateTeacherActivityAccess,
};
