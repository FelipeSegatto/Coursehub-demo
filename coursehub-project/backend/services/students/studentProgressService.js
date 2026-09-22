const {
  getStudentIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");
const { loadAttendanceSummary } = require("../attendance/studentAttendanceSummaryService");

/**
 * Normaliza o status acadêmico de um item (atividade/avaliação).
 *
 * pending: sem submission, prazo ainda não terminou.
 * overdue: sem submission, prazo já terminou.
 * submitted: entregue, aguardando correção (inclui pending_review).
 * graded: corrigida e avaliada.
 * returned: devolvida para ajustes.
 */
function resolveAcademicStatus(row) {
  if (row.submission_status === "graded") {
    return "graded";
  }

  if (row.submission_status === "returned") {
    return "returned";
  }

  if (
    row.submission_status === "submitted" ||
    row.submission_status === "pending_review"
  ) {
    return "submitted";
  }

  if (Boolean(row.is_overdue)) {
    return "overdue";
  }

  return "pending";
}

/**
 * Mapeia uma linha crua da consulta de atividades/avaliações
 * (com LEFT JOIN em submissions) para o formato da API.
 */
function mapAcademicItem(row) {
  return {
    activity_id: Number(row.activity_id),
    course_id: Number(row.course_id),

    activity_kind: row.activity_kind,
    title: row.title,
    description: row.description,
    type: row.type,
    due_date: row.due_date,

    max_score:
      row.max_score !== null && row.max_score !== undefined
        ? Number(row.max_score)
        : 10,

    order_index: Number(row.order_index),
    is_required: Boolean(row.is_required),
    activity_status: row.activity_status,

    submission_id:
      row.submission_id !== null && row.submission_id !== undefined
        ? Number(row.submission_id)
        : null,

    submission_status: row.submission_status,
    academic_status: resolveAcademicStatus(row),

    score:
      row.score !== null && row.score !== undefined
        ? Number(row.score)
        : null,

    feedback: row.feedback,
    submitted_at: row.submitted_at,
    graded_at: row.graded_at,
    is_overdue: Boolean(row.is_overdue),
  };
}

/**
 * Calcula o resumo de um conjunto de itens acadêmicos: contagens
 * por status, percentual de entrega e média das notas corrigidas
 * (normalizada pelo max_score de cada item).
 *
 * Reutilizada tanto para o resumo geral quanto para os recortes
 * por tipo (atividades/avaliações) em ambos os endpoints de
 * progresso do aluno.
 */
function summarizeAcademicItems(items) {
  const totalItems = items.length;

  const submittedItems = items.filter(
    (item) => item.academic_status === "submitted"
  ).length;

  const gradedItems = items.filter(
    (item) => item.academic_status === "graded"
  ).length;

  const returnedItems = items.filter(
    (item) => item.academic_status === "returned"
  ).length;

  const pendingItems = items.filter(
    (item) =>
      item.academic_status === "pending" ||
      item.academic_status === "overdue"
  ).length;

  const overdueItems = items.filter(
    (item) => item.academic_status === "overdue"
  ).length;

  // Entregue inclui qualquer item com submission válida: submitted,
  // graded ou returned — returned continua sendo uma entrega
  // realizada, ainda que exija nova ação do aluno.
  const deliveredItems = submittedItems + gradedItems + returnedItems;

  const progressPercentage =
    totalItems > 0
      ? Number(((deliveredItems / totalItems) * 100).toFixed(2))
      : 0;

  const gradedWithScore = items.filter(
    (item) =>
      item.academic_status === "graded" &&
      item.score !== null &&
      Number.isFinite(item.score) &&
      item.max_score > 0
  );

  const averagePercentage =
    gradedWithScore.length > 0
      ? gradedWithScore.reduce(
          (total, item) => total + (item.score / item.max_score) * 100,
          0
        ) / gradedWithScore.length
      : null;

  const averageGrade =
    averagePercentage !== null
      ? Number((averagePercentage / 10).toFixed(2))
      : null;

  return {
    total_items: totalItems,
    delivered_items: deliveredItems,
    submitted_items: submittedItems,
    graded_items: gradedItems,
    returned_items: returnedItems,
    pending_items: pendingItems,
    overdue_items: overdueItems,
    progress_percentage: progressPercentage,
    average_grade: averageGrade,
    average_percentage:
      averagePercentage !== null
        ? Number(averagePercentage.toFixed(2))
        : null,
  };
}

function findMostRecentGraded(items) {
  return (
    items
      .filter((item) => item.academic_status === "graded" && item.graded_at)
      .sort(
        (a, b) => new Date(b.graded_at).getTime() - new Date(a.graded_at).getTime()
      )[0] || null
  );
}

/**
 * Progresso acadêmico de um aluno em UM curso: lista completa de
 * atividades/avaliações com status, resumo geral e por tipo.
 * Não calcula progresso de conteúdo (vídeos/PDFs/textos) — isso
 * pertence a student_content_progress.
 */
async function getAcademicProgress(db, { userId, courseId }) {
  const normalizedCourseId = Number(courseId);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const [enrollmentRows] = await db.promise().query(
    `
      SELECT
        e.id AS enrollment_id,
        e.student_id,
        e.course_id,
        e.status AS enrollment_status,
        c.name AS course_title,
        c.category,
        c.image_url,
        c.status AS course_status
      FROM enrollments e
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ?
        AND e.course_id = ?
        AND e.status = 'active'
        AND c.status = 'active'
      LIMIT 1
    `,
    [studentId, normalizedCourseId]
  );

  if (enrollmentRows.length === 0) {
    throw createServiceError(
      "O aluno não possui matrícula ativa neste curso.",
      403
    );
  }

  const enrollment = enrollmentRows[0];

  const [academicRows] = await db.promise().query(
    `
      SELECT
        a.id AS activity_id, a.course_id, a.activity_kind, a.title,
        a.description, a.type, a.due_date, a.max_score, a.order_index,
        a.is_required, a.status AS activity_status,
        sub.id AS submission_id, sub.status AS submission_status,
        sub.score, sub.feedback, sub.submitted_at, sub.graded_at,
        CASE
          WHEN sub.id IS NULL AND a.due_date IS NOT NULL AND a.due_date < NOW()
          THEN 1 ELSE 0
        END AS is_overdue
      FROM activities a
      LEFT JOIN submissions sub
        ON sub.activity_id = a.id AND sub.student_id = ?
      WHERE a.course_id = ? AND a.status = 'active'
      ORDER BY
        CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END ASC,
        a.due_date ASC, a.order_index ASC, a.id ASC
    `,
    [studentId, normalizedCourseId]
  );

  const items = academicRows.map(mapAcademicItem);

  const activityItems = items.filter((item) => item.activity_kind === "activity");
  const examItems = items.filter((item) => item.activity_kind === "exam");

  return {
    student_id: Number(studentId),
    course: {
      course_id: normalizedCourseId,
      course_title: enrollment.course_title,
      category: enrollment.category,
      image_url: enrollment.image_url,
    },
    summary: summarizeAcademicItems(items),
    by_kind: {
      activities: summarizeAcademicItems(activityItems),
      exams: summarizeAcademicItems(examItems),
    },
    recent_graded_item: findMostRecentGraded(items),
    items,
  };
}

const EMPTY_PROGRESS_OVERVIEW_SUMMARY = {
  total_courses: 0,
  courses_in_progress: 0,
  completed_courses: 0,
  not_started_courses: 0,
  total_contents: 0,
  completed_contents: 0,
  in_progress_contents: 0,
  not_started_contents: 0,
  content_progress_percentage: 0,
  total_academic_items: 0,
  delivered_academic_items: 0,
  submitted_academic_items: 0,
  graded_academic_items: 0,
  returned_academic_items: 0,
  pending_academic_items: 0,
  overdue_academic_items: 0,
  academic_progress_percentage: 0,
  average_grade: null,
  average_percentage: null,
  total_attendance_sessions: 0,
  attendance_present: 0,
  attendance_absent: 0,
  attendance_late: 0,
  attendance_excused: 0,
  attendance_rate: null,
};

/**
 * Visão consolidada do progresso do aluno em todos os cursos com
 * matrícula ativa: progresso de conteúdo, progresso acadêmico,
 * ponto de "continuar estudando" e item corrigido mais recente.
 * O backend descobre todos os relacionamentos — nenhuma porcentagem
 * é confiada ao frontend.
 */
async function getProgressOverview(db, { userId }) {
  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const [courseRows] = await db.promise().query(
    `
      SELECT
        c.id AS course_id, c.name AS course_title, c.description,
        c.category, c.nivel, c.image_url, c.workload_hours,
        c.status AS course_status,
        e.id AS enrollment_id, e.status AS enrollment_status,
        e.enrolled_at, e.class_id
      FROM enrollments e
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ? AND e.status = 'active' AND c.status = 'active'
      ORDER BY e.enrolled_at DESC, c.name ASC
    `,
    [studentId]
  );

  // O aluno pode existir mas ainda não ter matrícula ativa — devolve
  // uma estrutura vazia compatível com o frontend, em vez de erro.
  if (courseRows.length === 0) {
    return {
      student_id: Number(studentId),
      summary: EMPTY_PROGRESS_OVERVIEW_SUMMARY,
      continue_learning: null,
      recent_graded_item: null,
      courses: [],
    };
  }

  const courseIds = courseRows.map((course) => Number(course.course_id));

  // Mapa course_id -> class_id da matrícula, usado para excluir
  // conteúdo exclusivo de uma turma diferente da turma do aluno.
  const classIdByCourse = new Map(
    courseRows.map((course) => [Number(course.course_id), course.class_id])
  );

  const coursePlaceholders = courseIds.map(() => "?").join(", ");

  const [contentRows] = await db.promise().query(
    `
      SELECT
        cc.id AS content_id, cc.course_id, cc.class_id, cc.title,
        cc.description, cc.type, cc.content_url, cc.order_index,
        cc.is_required, cc.status AS content_status,
        scp.id AS progress_id, scp.status AS progress_status,
        scp.progress_percentage, scp.last_position_seconds,
        scp.started_at, scp.completed_at, scp.last_accessed_at,
        scp.created_at AS progress_created_at,
        scp.updated_at AS progress_updated_at
      FROM course_contents cc
      LEFT JOIN student_content_progress scp
        ON scp.content_id = cc.id AND scp.student_id = ?
      WHERE cc.course_id IN (${coursePlaceholders})
        AND cc.status = 'active'
        AND cc.type IN ('video', 'pdf', 'text', 'live_class')
      ORDER BY cc.course_id ASC, cc.order_index ASC, cc.id ASC
    `,
    [studentId, ...courseIds]
  );

  const [academicRows] = await db.promise().query(
    `
      SELECT
        a.id AS activity_id, a.course_id, a.activity_kind, a.title,
        a.description, a.type, a.due_date, a.max_score, a.order_index,
        a.is_required, a.status AS activity_status,
        sub.id AS submission_id, sub.status AS submission_status,
        sub.score, sub.feedback, sub.submitted_at, sub.graded_at,
        CASE
          WHEN sub.id IS NULL AND a.due_date IS NOT NULL AND a.due_date < NOW()
          THEN 1 ELSE 0
        END AS is_overdue
      FROM activities a
      LEFT JOIN submissions sub
        ON sub.activity_id = a.id AND sub.student_id = ?
      WHERE a.course_id IN (${coursePlaceholders}) AND a.status = 'active'
      ORDER BY
        a.course_id ASC,
        CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END ASC,
        a.due_date ASC, a.order_index ASC, a.id ASC
    `,
    [studentId, ...courseIds]
  );

  const contentsByCourse = new Map();

  for (const content of contentRows) {
    const courseId = Number(content.course_id);
    const enrollmentClassId = classIdByCourse.get(courseId);

    // Conteúdo geral (class_id null) sempre entra; conteúdo exclusivo
    // de outra turma que não a da matrícula do aluno é descartado.
    if (
      content.class_id !== null &&
      content.class_id !== undefined &&
      Number(content.class_id) !== Number(enrollmentClassId)
    ) {
      continue;
    }

    if (!contentsByCourse.has(courseId)) {
      contentsByCourse.set(courseId, []);
    }

    contentsByCourse.get(courseId).push({
      content_id: Number(content.content_id),
      course_id: courseId,
      title: content.title,
      description: content.description,
      type: content.type,
      content_url: content.content_url,
      order_index: Number(content.order_index),
      is_required: Boolean(content.is_required),
      content_status: content.content_status,
      progress_id:
        content.progress_id !== null && content.progress_id !== undefined
          ? Number(content.progress_id)
          : null,
      progress_status: content.progress_status || "not_started",
      progress_percentage:
        content.progress_percentage !== null &&
        content.progress_percentage !== undefined
          ? Number(content.progress_percentage)
          : 0,
      last_position_seconds:
        content.last_position_seconds !== null &&
        content.last_position_seconds !== undefined
          ? Number(content.last_position_seconds)
          : null,
      started_at: content.started_at,
      completed_at: content.completed_at,
      last_accessed_at: content.last_accessed_at,
      progress_created_at: content.progress_created_at,
      progress_updated_at: content.progress_updated_at,
    });
  }

  const academicItemsByCourse = new Map();

  for (const row of academicRows) {
    const courseId = Number(row.course_id);

    if (!academicItemsByCourse.has(courseId)) {
      academicItemsByCourse.set(courseId, []);
    }

    academicItemsByCourse.get(courseId).push(mapAcademicItem(row));
  }

  // Uma consulta de frequência por turma (não por curso) -- cursos
  // sem turma na matrícula simplesmente não têm frequência a mostrar.
  const attendanceByCourse = new Map(
    await Promise.all(
      courseIds.map(async (courseId) => [
        courseId,
        await loadAttendanceSummary(db, {
          studentId,
          classId: classIdByCourse.get(courseId) || null,
        }),
      ])
    )
  );

  const courses = courseRows.map((courseRow) => {
    const courseId = Number(courseRow.course_id);
    const courseContents = contentsByCourse.get(courseId) || [];
    const academicItems = academicItemsByCourse.get(courseId) || [];

    // Para o percentual geral, considera só conteúdos obrigatórios;
    // se nenhum for obrigatório, usa todos (evita curso preso em 0%).
    const requiredContents = courseContents.filter(
      (content) => content.is_required
    );
    const contentsForProgress =
      requiredContents.length > 0 ? requiredContents : courseContents;

    const totalContents = contentsForProgress.length;
    const completedContents = contentsForProgress.filter(
      (content) => content.progress_status === "completed"
    ).length;
    const inProgressContents = contentsForProgress.filter(
      (content) => content.progress_status === "in_progress"
    ).length;
    const notStartedContents =
      totalContents - completedContents - inProgressContents;

    const contentProgressPercentage =
      totalContents > 0
        ? Number(((completedContents / totalContents) * 100).toFixed(2))
        : 0;

    let progressStatus = "not_started";

    if (totalContents > 0 && completedContents === totalContents) {
      progressStatus = "completed";
    } else if (completedContents > 0 || inProgressContents > 0) {
      progressStatus = "in_progress";
    }

    const academicSummary = summarizeAcademicItems(academicItems);

    // Conteúdo ainda não concluído com menor order_index.
    const nextContent =
      courseContents.find((content) => content.progress_status !== "completed") ||
      null;

    const lastAccessedAt =
      courseContents
        .map((content) => content.last_accessed_at)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ||
      null;

    const activityItems = academicItems.filter(
      (item) => item.activity_kind === "activity"
    );
    const examItems = academicItems.filter((item) => item.activity_kind === "exam");

    const attendance = attendanceByCourse.get(courseId) || null;

    return {
      course_id: courseId,
      course_title: courseRow.course_title,
      description: courseRow.description,
      category: courseRow.category,
      nivel: courseRow.nivel,
      image_url: courseRow.image_url,
      workload_hours:
        courseRow.workload_hours !== null && courseRow.workload_hours !== undefined
          ? Number(courseRow.workload_hours)
          : null,
      enrolled_at: courseRow.enrolled_at,
      progress_status: progressStatus,
      last_accessed_at: lastAccessedAt,
      next_content_id: nextContent?.content_id || null,
      next_content_title: nextContent?.title || null,
      content_progress: {
        total_contents: totalContents,
        completed_contents: completedContents,
        in_progress_contents: inProgressContents,
        not_started_contents: notStartedContents,
        progress_percentage: contentProgressPercentage,
      },
      academic_progress: {
        ...academicSummary,
        activities: summarizeAcademicItems(activityItems),
        exams: summarizeAcademicItems(examItems),
      },
      attendance_progress: attendance
        ? {
            total_sessions: attendance.total,
            present: attendance.present,
            absent: attendance.absent,
            late: attendance.late,
            excused: attendance.excused,
            attendance_rate: attendance.attendanceRate,
          }
        : null,
      // Listas completas — a página geral só usa os resumos hoje,
      // mas ficam disponíveis para expansões futuras.
      contents: courseContents,
      academic_items: academicItems,
    };
  });

  // Consolida conteúdos de todos os cursos usando o mesmo critério
  // do cálculo individual (obrigatórios quando existirem).
  const allContentsForProgress = courses.flatMap((course) => {
    const originalContents = course.contents || [];
    const required = originalContents.filter((content) => content.is_required);

    return required.length > 0 ? required : originalContents;
  });

  const totalContents = allContentsForProgress.length;
  const completedContents = allContentsForProgress.filter(
    (content) => content.progress_status === "completed"
  ).length;
  const inProgressContents = allContentsForProgress.filter(
    (content) => content.progress_status === "in_progress"
  ).length;
  const notStartedContents = totalContents - completedContents - inProgressContents;

  const contentProgressPercentage =
    totalContents > 0
      ? Number(((completedContents / totalContents) * 100).toFixed(2))
      : 0;

  const allAcademicItems = courses.flatMap((course) => course.academic_items || []);
  const globalAcademicSummary = summarizeAcademicItems(allAcademicItems);

  const attendanceSummaries = courses
    .map((course) => course.attendance_progress)
    .filter(Boolean);

  const totalAttendanceSessions = attendanceSummaries.reduce(
    (sum, summary) => sum + summary.total_sessions,
    0
  );
  const totalAttendancePresent = attendanceSummaries.reduce(
    (sum, summary) => sum + summary.present,
    0
  );
  const totalAttendanceAbsent = attendanceSummaries.reduce(
    (sum, summary) => sum + summary.absent,
    0
  );
  const totalAttendanceLate = attendanceSummaries.reduce(
    (sum, summary) => sum + summary.late,
    0
  );
  const totalAttendanceExcused = attendanceSummaries.reduce(
    (sum, summary) => sum + summary.excused,
    0
  );

  const globalAttendanceRate =
    totalAttendanceSessions > 0
      ? Number(((totalAttendancePresent / totalAttendanceSessions) * 100).toFixed(2))
      : null;

  const totalCourses = courses.length;
  const coursesInProgress = courses.filter(
    (course) => course.progress_status === "in_progress"
  ).length;
  const completedCourses = courses.filter(
    (course) => course.progress_status === "completed"
  ).length;
  const notStartedCourses = courses.filter(
    (course) => course.progress_status === "not_started"
  ).length;

  const recentGradedItem = findMostRecentGraded(allAcademicItems);

  // Prioridade para "continuar estudando": curso acessado mais
  // recentemente > primeiro em andamento > primeiro não iniciado >
  // primeiro disponível.
  const courseWithRecentAccess =
    courses
      .filter((course) => course.last_accessed_at)
      .sort(
        (a, b) =>
          new Date(b.last_accessed_at).getTime() -
          new Date(a.last_accessed_at).getTime()
      )[0] || null;

  const continueCourse =
    courseWithRecentAccess ||
    courses.find((course) => course.progress_status === "in_progress") ||
    courses.find((course) => course.progress_status === "not_started") ||
    courses[0] ||
    null;

  const continueLearning = continueCourse
    ? {
        course_id: continueCourse.course_id,
        course_title: continueCourse.course_title,
        content_id: continueCourse.next_content_id,
        content_title: continueCourse.next_content_title,
        last_accessed_at: continueCourse.last_accessed_at,
      }
    : null;

  // Remove as listas detalhadas da resposta por curso — a página
  // ProgressoAluno só precisa dos resumos hoje.
  const summarizedCourses = courses.map(
    ({ contents, academic_items, ...courseSummary }) => courseSummary
  );

  return {
    student_id: Number(studentId),
    summary: {
      total_courses: totalCourses,
      courses_in_progress: coursesInProgress,
      completed_courses: completedCourses,
      not_started_courses: notStartedCourses,
      total_contents: totalContents,
      completed_contents: completedContents,
      in_progress_contents: inProgressContents,
      not_started_contents: notStartedContents,
      content_progress_percentage: contentProgressPercentage,
      total_academic_items: globalAcademicSummary.total_items,
      delivered_academic_items: globalAcademicSummary.delivered_items,
      submitted_academic_items: globalAcademicSummary.submitted_items,
      graded_academic_items: globalAcademicSummary.graded_items,
      returned_academic_items: globalAcademicSummary.returned_items,
      pending_academic_items: globalAcademicSummary.pending_items,
      overdue_academic_items: globalAcademicSummary.overdue_items,
      academic_progress_percentage: globalAcademicSummary.progress_percentage,
      average_grade: globalAcademicSummary.average_grade,
      average_percentage: globalAcademicSummary.average_percentage,
      total_attendance_sessions: totalAttendanceSessions,
      attendance_present: totalAttendancePresent,
      attendance_absent: totalAttendanceAbsent,
      attendance_late: totalAttendanceLate,
      attendance_excused: totalAttendanceExcused,
      attendance_rate: globalAttendanceRate,
    },
    continue_learning: continueLearning,
    recent_graded_item: recentGradedItem,
    courses: summarizedCourses,
  };
}

module.exports = {
  createServiceError,
  mapAcademicItem,
  summarizeAcademicItems,
  getAcademicProgress,
  getProgressOverview,
};
