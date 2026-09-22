/**
 * Núcleo de elegibilidade acadêmica: avalia se uma matrícula cumpre a
 * regra de conclusão ativa do curso, requisito por requisito, sempre
 * explicável. Nunca decidido no frontend -- tanto a emissão de
 * certificado (certificateService.js) quanto a consulta do professor
 * (rota teacher/academic-documents) chamam esta mesma função.
 *
 * Deliberadamente NÃO reaproveita studentProgressService.getAcademicProgress
 * nem courseContentProgressService.getCourseProgressForStudent: ambas
 * exigem um userId (não um enrollmentId) e filtram
 * `WHERE e.status = 'active'`, o que quebraria a avaliação de uma
 * matrícula já `completed` -- exatamente o caso mais comum ao revisar
 * elegibilidade para certificado. As consultas abaixo reimplementam a
 * mesma fórmula (conteúdo obrigatório, nota normalizada 0-10) direto
 * por enrollment_id, sem esse filtro.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

async function loadEnrollmentContext(db, enrollmentId) {
  const [rows] = await db
    .promise()
    .query(`SELECT id, student_id, course_id, class_id, status FROM enrollments WHERE id = ? LIMIT 1`, [
      enrollmentId,
    ]);

  if (rows.length === 0) {
    throw createServiceError("Matrícula não encontrada.", 404);
  }

  return rows[0];
}

async function getActiveCompletionRule(db, courseId) {
  const [rows] = await db
    .promise()
    .query(`SELECT * FROM completion_rules WHERE course_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`, [
      courseId,
    ]);

  if (rows.length === 0) {
    throw createServiceError("Nenhuma regra de conclusão configurada para este curso.", 422);
  }

  return rows[0];
}

/**
 * Mesma fórmula de courseContentProgressService.js (conteúdos
 * obrigatórios; se nenhum for obrigatório, usa todos), escopada a
 * conteúdo geral + conteúdo da turma da matrícula.
 */
async function calculateContentProgressPercentage(db, { studentId, courseId, classId }) {
  const [rows] = await db.promise().query(
    `
      SELECT cc.id, cc.is_required, scp.status AS progress_status
      FROM course_contents cc
      LEFT JOIN student_content_progress scp ON scp.content_id = cc.id AND scp.student_id = ?
      WHERE cc.course_id = ? AND cc.status = 'active'
        AND (cc.class_id IS NULL OR cc.class_id = ?)
    `,
    [studentId, courseId, classId]
  );

  const required = rows.filter((row) => row.is_required);
  const scoped = required.length > 0 ? required : rows;
  const total = scoped.length;
  const completed = scoped.filter((row) => row.progress_status === "completed").length;

  return total > 0 ? Number(((completed / total) * 100).toFixed(2)) : 0;
}

/**
 * Mesma fórmula de studentProgressService.js's summarizeAcademicItems
 * (média das notas corrigidas, normalizada por max_score, reescalada
 * para 0-10) -- só considera atividades/provas ativas do curso.
 */
async function calculateAverageGrade(db, { studentId, courseId }) {
  const [rows] = await db.promise().query(
    `
      SELECT a.max_score, s.score, s.status
      FROM activities a
      LEFT JOIN submissions s ON s.activity_id = a.id AND s.student_id = ?
      WHERE a.course_id = ? AND a.status = 'active'
    `,
    [studentId, courseId]
  );

  const graded = rows.filter(
    (row) => row.status === "graded" && row.score !== null && Number(row.max_score) > 0
  );

  if (graded.length === 0) {
    return null;
  }

  const averagePercentage =
    graded.reduce((total, row) => total + (Number(row.score) / Number(row.max_score)) * 100, 0) / graded.length;

  return Number((averagePercentage / 10).toFixed(2));
}

/**
 * Não existe hoje nenhuma função de "% de presença de um aluno numa
 * turma" no restante do backend (só uma média por turma inteira, em
 * teacherAttendanceHistoryService.js) -- construída aqui do zero.
 * Denominador = presenças registradas em sessões não canceladas/
 * arquivadas; "late" não conta como presença (mais conservador --
 * não há convenção existente para copiar). Retorna null (não
 * aplicável/não avaliável) quando a matrícula não tem turma ou ainda
 * não há nenhuma presença registrada.
 */
async function calculateAttendanceRate(db, { studentId, classId }) {
  if (!classId) {
    return null;
  }

  const [rows] = await db.promise().query(
    `
      SELECT a.status
      FROM attendance a
      INNER JOIN class_sessions cs ON cs.id = a.class_session_id
      WHERE cs.class_id = ? AND a.student_id = ? AND cs.status NOT IN ('cancelled', 'archived')
    `,
    [classId, studentId]
  );

  const total = rows.length;

  if (total === 0) {
    return null;
  }

  const present = rows.filter((row) => row.status === "present").length;

  return Number(((present / total) * 100).toFixed(2));
}

async function checkMandatoryItemsComplete(db, { studentId, courseId }) {
  const [rows] = await db.promise().query(
    `
      SELECT a.id, s.status AS submission_status
      FROM activities a
      LEFT JOIN submissions s ON s.activity_id = a.id AND s.student_id = ?
      WHERE a.course_id = ? AND a.status = 'active' AND a.is_required = 1
    `,
    [studentId, courseId]
  );

  if (rows.length === 0) {
    return { applicable: false };
  }

  const gradedCount = rows.filter((row) => row.submission_status === "graded").length;

  return { applicable: true, total: rows.length, graded: gradedCount };
}

/**
 * Avalia uma matrícula contra a regra de conclusão ativa do seu
 * curso. Retorna elegibilidade explicável por requisito -- nunca um
 * booleano isolado. Critérios com valor NULL na regra são "não
 * exigidos para este curso" e simplesmente não entram no array
 * (diferente de "reprovado").
 */
async function evaluateEnrollmentCompletion(db, enrollmentId) {
  const enrollment = await loadEnrollmentContext(db, enrollmentId);
  const rule = await getActiveCompletionRule(db, enrollment.course_id);

  const requirements = [];

  if (rule.min_content_progress_percentage !== null) {
    const actual = await calculateContentProgressPercentage(db, {
      studentId: enrollment.student_id,
      courseId: enrollment.course_id,
      classId: enrollment.class_id,
    });

    requirements.push({
      key: "content_progress",
      label: "Progresso de conteúdo",
      required: Number(rule.min_content_progress_percentage),
      actual,
      met: actual >= Number(rule.min_content_progress_percentage),
    });
  }

  if (rule.min_attendance_percentage !== null) {
    const actual = await calculateAttendanceRate(db, {
      studentId: enrollment.student_id,
      classId: enrollment.class_id,
    });

    requirements.push({
      key: "attendance",
      label: "Frequência",
      required: Number(rule.min_attendance_percentage),
      actual,
      met: actual !== null && actual >= Number(rule.min_attendance_percentage),
    });
  }

  if (rule.min_average_grade !== null) {
    const actual = await calculateAverageGrade(db, {
      studentId: enrollment.student_id,
      courseId: enrollment.course_id,
    });

    requirements.push({
      key: "average_grade",
      label: "Nota média",
      required: Number(rule.min_average_grade),
      actual,
      met: actual !== null && actual >= Number(rule.min_average_grade),
    });
  }

  if (rule.require_all_mandatory_items) {
    const mandatory = await checkMandatoryItemsComplete(db, {
      studentId: enrollment.student_id,
      courseId: enrollment.course_id,
    });

    if (mandatory.applicable) {
      requirements.push({
        key: "mandatory_items",
        label: "Atividades/provas obrigatórias",
        required: mandatory.total,
        actual: mandatory.graded,
        met: mandatory.graded === mandatory.total,
      });
    }
  }

  if (requirements.length === 0) {
    throw createServiceError("A regra de conclusão ativa não define nenhum critério avaliável.", 422);
  }

  const eligible = requirements.every((requirement) => requirement.met);

  return {
    eligible,
    requirements,
    completionRuleId: rule.id,
    completionRuleVersion: rule.version,
  };
}

module.exports = {
  evaluateEnrollmentCompletion,
  calculateAttendanceRate,
  createServiceError,
};
