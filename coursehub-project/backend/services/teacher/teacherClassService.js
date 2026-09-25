const {
  getTeacherIdByUserId,
  getClassOwnedByTeacher,
  createServiceError,
} = require("../classes/classAccessService");

const ALLOWED_CLASS_STATUSES = new Set(["", "active", "inactive", "finished"]);
const ALLOWED_ACTIVITY_KINDS = new Set(["", "activity", "exam"]);
const ALLOWED_ACTIVITY_STATUSES = new Set([
  "",
  "active",
  "inactive",
  "draft",
  "archived",
]);

function mapClassListItem(classItem) {
  return {
    id: classItem.id,
    name: classItem.name,
    courseId: classItem.course_id,
    teacherId: classItem.teacher_id,
    courseName: classItem.course_name,
    courseDescription: classItem.course_description,
    courseImageUrl: classItem.course_image_url,
    courseCategory: classItem.course_category,
    courseLevel: classItem.course_level,
    shift: classItem.shift,
    startDate: classItem.start_date,
    endDate: classItem.end_date,
    status: classItem.status,
    studentCount: Number(classItem.student_count || 0),
    contentCount: Number(classItem.content_count || 0),
    activityCount: Number(classItem.activity_count || 0),
    createdAt: classItem.created_at,
    updatedAt: classItem.updated_at,
  };
}

/**
 * Lista as turmas atribuídas ao professor, com contagem de
 * alunos, conteúdos e atividades ativas de cada uma.
 */
async function listClasses(db, { userId, status }) {
  const normalizedStatus = typeof status === "string" ? status.trim() : "";

  if (!ALLOWED_CLASS_STATUSES.has(normalizedStatus)) {
    throw createServiceError("Status de turma inválido.", 400);
  }

  const teacherId = await getTeacherIdByUserId(db.promise(), userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

  const queryParams = [teacherId];
  let statusCondition = "";

  if (normalizedStatus) {
    statusCondition = "AND cl.status = ?";
    queryParams.push(normalizedStatus);
  }

  const [rows] = await db.promise().query(
    `
      SELECT
        cl.id, cl.course_id, cl.teacher_id, cl.name, cl.shift,
        cl.start_date, cl.end_date, cl.status, cl.created_at, cl.updated_at,
        c.name AS course_name, c.description AS course_description,
        c.image_url AS course_image_url, c.category AS course_category,
        c.nivel AS course_level,
        COALESCE(enrollment_stats.student_count, 0) AS student_count,
        (
          SELECT COUNT(*) FROM course_contents cc
          WHERE cc.course_id = cl.course_id
            AND (cc.class_id IS NULL OR cc.class_id = cl.id)
            AND cc.status = 'active'
            AND cc.type IN ('video', 'pdf', 'text', 'live_class')
        ) AS content_count,
        (
          SELECT COUNT(*) FROM activities a
          WHERE a.course_id = cl.course_id
            AND (a.class_id IS NULL OR a.class_id = cl.id)
            AND a.status = 'active'
        ) AS activity_count
      FROM classes cl
      INNER JOIN courses c ON c.id = cl.course_id
      LEFT JOIN (
        SELECT e.class_id, COUNT(DISTINCT e.student_id) AS student_count
        FROM enrollments e
        WHERE e.status = 'active'
        GROUP BY e.class_id
      ) enrollment_stats ON enrollment_stats.class_id = cl.id
      WHERE cl.teacher_id = ?
        ${statusCondition}
      ORDER BY
        CASE
          WHEN cl.status = 'active' THEN 1
          WHEN cl.status = 'inactive' THEN 2
          WHEN cl.status = 'finished' THEN 3
          ELSE 4
        END,
        cl.start_date DESC, cl.name ASC
    `,
    queryParams
  );

  return { classes: rows.map(mapClassListItem) };
}

/**
 * Resolve e valida que o professor autenticado pode operar a turma
 * (responsável ou co-professor do curso). 404 se a turma não existe
 * ou se o users.id não é professor com acesso.
 */
async function requireOwnedClass(runner, { userId, classId }) {
  const teacherId = await getTeacherIdByUserId(runner, userId);

  const classData = teacherId
    ? await getClassOwnedByTeacher(runner, { classId, teacherId })
    : null;

  if (!classData) {
    throw createServiceError(
      "Turma não encontrada ou não vinculada ao professor.",
      404
    );
  }

  return { teacherId, classData };
}

/**
 * Dashboard de uma turma: dados da turma, do curso e contagens
 * de alunos/conteúdos/atividades.
 */
async function getClassDetail(db, { userId, classId }) {
  const { teacherId, classData } = await requireOwnedClass(db.promise(), {
    userId,
    classId,
  });

  const [[studentRows], [contentRows], [activityRows]] = await Promise.all([
    db.promise().query(
      `SELECT COUNT(DISTINCT e.student_id) AS student_count
       FROM enrollments e WHERE e.class_id = ? AND e.status = 'active'`,
      [classId]
    ),
    db.promise().query(
      `SELECT COUNT(*) AS content_count FROM course_contents cc
       WHERE cc.course_id = ? AND (cc.class_id IS NULL OR cc.class_id = ?)
         AND cc.status = 'active'
         AND cc.type IN ('video', 'pdf', 'text', 'live_class')`,
      [classData.course_id, classId]
    ),
    db.promise().query(
      `SELECT COUNT(*) AS activity_count FROM activities a
       WHERE a.course_id = ? AND (a.class_id IS NULL OR a.class_id = ?)
         AND a.status = 'active'`,
      [classData.course_id, classId]
    ),
  ]);

  const studentStats = studentRows[0] || {};
  const contentStats = contentRows[0] || {};
  const activityStats = activityRows[0] || {};

  return {
    class: {
      id: classData.id,
      name: classData.name,
      courseId: classData.course_id,
      teacherId,
      shift: classData.shift,
      startDate: classData.start_date,
      endDate: classData.end_date,
      status: classData.status,
      createdAt: classData.created_at,
      updatedAt: classData.updated_at,
    },
    course: {
      id: classData.course_id,
      name: classData.course_name,
      description: classData.course_description,
      imageUrl: classData.course_image_url,
      category: classData.course_category,
      level: classData.course_level,
    },
    stats: {
      studentCount: Number(studentStats.student_count || 0),
      contentCount: Number(contentStats.content_count || 0),
      activityCount: Number(activityStats.activity_count || 0),
      attendancePercentage: null,
    },
  };
}

/**
 * Lista os alunos matriculados em UMA turma específica (todas
 * as matrículas, independente do status).
 */
async function listClassStudents(db, { userId, classId }) {
  const { classData } = await requireOwnedClass(db.promise(), {
    userId,
    classId,
  });

  const [rows] = await db.promise().query(
    `
      SELECT
        e.id AS enrollment_id, e.status AS enrollment_status,
        e.created_at AS enrolled_at,
        s.id AS student_id, s.registration_number,
        u.id AS user_id, u.name, u.email
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN users u ON u.id = s.user_id
      WHERE e.class_id = ?
      ORDER BY
        CASE
          WHEN e.status = 'active' THEN 1
          WHEN e.status = 'completed' THEN 2
          WHEN e.status = 'inactive' THEN 3
          ELSE 4
        END,
        u.name ASC
    `,
    [classId]
  );

  return {
    class: {
      id: classData.id,
      name: classData.name,
      shift: classData.shift,
      status: classData.status,
      courseId: classData.course_id,
      courseTitle: classData.course_title,
    },
    students: rows.map((student) => ({
      enrollmentId: student.enrollment_id,
      enrollmentStatus: student.enrollment_status,
      enrolledAt: student.enrolled_at,
      studentId: student.student_id,
      registrationNumber: student.registration_number,
      userId: student.user_id,
      name: student.name,
      email: student.email,
    })),
  };
}

/**
 * Lista as atividades/avaliações visíveis para uma turma: gerais
 * do curso (class_id NULL) e exclusivas desta turma. As
 * submissões não são contadas aqui para evitar misturar alunos
 * de turmas diferentes.
 */
async function listClassActivities(db, { userId, classId, activityKind, status }) {
  const normalizedKind =
    typeof activityKind === "string" ? activityKind.trim() : "";
  const normalizedStatus = typeof status === "string" ? status.trim() : "";

  if (!ALLOWED_ACTIVITY_KINDS.has(normalizedKind)) {
    throw createServiceError("Tipo de atividade inválido.", 400);
  }

  if (!ALLOWED_ACTIVITY_STATUSES.has(normalizedStatus)) {
    throw createServiceError("Status de atividade inválido.", 400);
  }

  const { classData } = await requireOwnedClass(db.promise(), {
    userId,
    classId,
  });

  const queryParams = [classData.course_id, classId];
  let activityKindCondition = "";
  let statusCondition = "";

  if (normalizedKind) {
    activityKindCondition = "AND a.activity_kind = ?";
    queryParams.push(normalizedKind);
  }

  if (normalizedStatus) {
    statusCondition = "AND a.status = ?";
    queryParams.push(normalizedStatus);
  }

  const [rows] = await db.promise().query(
    `
      SELECT
        a.id, a.course_id, a.class_id, a.activity_kind, a.title,
        a.description, a.type, a.due_date, a.max_score, a.order_index,
        a.is_required, a.status, a.created_at, a.updated_at,
        COUNT(DISTINCT aq.id) AS question_count
      FROM activities a
      LEFT JOIN activity_questions aq ON aq.activity_id = a.id
      WHERE a.course_id = ?
        AND (a.class_id IS NULL OR a.class_id = ?)
        ${activityKindCondition}
        ${statusCondition}
      GROUP BY
        a.id, a.course_id, a.class_id, a.activity_kind, a.title,
        a.description, a.type, a.due_date, a.max_score, a.order_index,
        a.is_required, a.status, a.created_at, a.updated_at
      ORDER BY a.order_index ASC, a.due_date ASC, a.created_at ASC
    `,
    queryParams
  );

  return {
    class: {
      id: classData.id,
      name: classData.name,
      shift: classData.shift,
      status: classData.status,
      courseId: classData.course_id,
      courseTitle: classData.course_title,
    },
    activities: rows.map((activity) => {
      const isClassSpecific = activity.class_id !== null;

      return {
        id: activity.id,
        courseId: activity.course_id,
        classId: activity.class_id,
        className: isClassSpecific ? classData.name : null,
        activityScope: isClassSpecific ? "class_specific" : "general",
        activityKind: activity.activity_kind,
        title: activity.title,
        description: activity.description,
        type: activity.type,
        dueDate: activity.due_date,
        maxScore: Number(activity.max_score),
        orderIndex: activity.order_index,
        isRequired: Boolean(activity.is_required),
        status: activity.status,
        questionCount: Number(activity.question_count || 0),
        createdAt: activity.created_at,
        updatedAt: activity.updated_at,
      };
    }),
  };
}

module.exports = {
  createServiceError,
  requireOwnedClass,
  listClasses,
  getClassDetail,
  listClassStudents,
  listClassActivities,
};
