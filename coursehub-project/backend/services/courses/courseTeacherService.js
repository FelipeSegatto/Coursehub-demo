/**
 * Fonte central de leitura/escrita de course_teachers -- a relação N:N
 * oficial entre courses e teachers (ver docs/course-teacher-model.md).
 *
 * courses.teacher_id é mantido no schema como campo legado/futuro
 * (compatibilidade + espaço para um eventual "professor principal" /
 * coordenador de curso), mas NENHUMA regra de negócio nova depende
 * dele -- todo código novo de membership/autorização de curso deve
 * passar por este arquivo.
 *
 * `runner` em toda função aqui é `db.promise()` (pool) ou uma
 * connection já aberta dentro de uma transação -- ambos expõem
 * `.execute()`, mesmo padrão já usado em classAccessService.js.
 */

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Converte uma lista arbitrária vinda do frontend em inteiros
 * positivos únicos, descartando qualquer valor não numérico/inválido
 * -- nunca confia em IDs arbitrários do cliente sem passar por
 * validateTeacherIds/validateCourseIds depois.
 */
function normalizeIdList(rawIds) {
  if (!Array.isArray(rawIds)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const rawId of rawIds) {
    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function normalizeTeacherIds(rawIds) {
  return normalizeIdList(rawIds);
}

function normalizeCourseIds(rawIds) {
  return normalizeIdList(rawIds);
}

/**
 * Confirma que todo teacherId realmente existe antes de qualquer
 * escrita em course_teachers -- nunca insere vínculo para um ID
 * inventado pelo cliente.
 */
async function validateTeacherIds(runner, teacherIds) {
  if (teacherIds.length === 0) {
    return teacherIds;
  }

  const placeholders = teacherIds.map(() => "?").join(",");

  const [rows] = await runner.execute(
    `SELECT id FROM teachers WHERE id IN (${placeholders})`,
    teacherIds
  );

  const foundIds = new Set(rows.map((row) => row.id));
  const missingIds = teacherIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    throw createServiceError(
      `Professor(es) não encontrado(s): ${missingIds.join(", ")}.`,
      400
    );
  }

  return teacherIds;
}

async function validateCourseIds(runner, courseIds) {
  if (courseIds.length === 0) {
    return courseIds;
  }

  const placeholders = courseIds.map(() => "?").join(",");

  const [rows] = await runner.execute(
    `SELECT id FROM courses WHERE id IN (${placeholders})`,
    courseIds
  );

  const foundIds = new Set(rows.map((row) => row.id));
  const missingIds = courseIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    throw createServiceError(
      `Curso(s) não encontrado(s): ${missingIds.join(", ")}.`,
      400
    );
  }

  return courseIds;
}

/**
 * Se courses.teacher_id ainda apontar para um professor sem linha
 * ativa correspondente em course_teachers, cria/reativa essa linha.
 * Isso é o que a Seção final do briefing pede: "sempre que
 * courses.teacher_id existir e não houver correspondente em
 * course_teachers, corrigir/sincronizar esse vínculo". Nunca toca em
 * courses.teacher_id em si -- só garante que o vínculo N:N
 * correspondente exista, sem conferir status de "principal" a
 * ninguém. Usado só em caminhos de LEITURA administrativa (listagem/
 * detalhe de curso, elegibilidade de professor de turma) -- nunca
 * dentro dos helpers de autorização de alta frequência (ver
 * isTeacherAssignedToCourse), para não transformar toda checagem de
 * acesso numa escrita no banco.
 */
async function reconcileLegacyCourseTeacher(runner, courseId) {
  const [courseRows] = await runner.execute(
    `SELECT teacher_id FROM courses WHERE id = ? LIMIT 1`,
    [courseId]
  );

  const legacyTeacherId = courseRows[0]?.teacher_id;

  if (!legacyTeacherId) {
    return;
  }

  await runner.execute(
    `
      INSERT INTO course_teachers (course_id, teacher_id, status)
      VALUES (?, ?, 'active')
      ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()
    `,
    [courseId, legacyTeacherId]
  );
}

/**
 * Professores ativos vinculados a um curso. `reconcileLegacy: true`
 * (usado pelas telas administrativas de curso/turma) primeiro
 * garante que courses.teacher_id -- se ainda não refletido em
 * course_teachers -- seja sincronizado, para que course_teachers vá
 * convergindo para a fonte oficial de membership conforme o schema
 * pede.
 */
async function listCourseTeachers(runner, courseId, { reconcileLegacy = false } = {}) {
  if (reconcileLegacy) {
    await reconcileLegacyCourseTeacher(runner, courseId);
  }

  const [rows] = await runner.execute(
    `
      SELECT t.id, t.name, t.status AS teacher_status
      FROM course_teachers ct
      INNER JOIN teachers t ON t.id = ct.teacher_id
      WHERE ct.course_id = ? AND ct.status = 'active'
      ORDER BY t.name ASC
    `,
    [courseId]
  );

  return rows;
}

/** Cursos ativamente vinculados a um professor -- usado por "Meus cursos" e telas administrativas. */
async function listTeacherCourses(runner, teacherId, { includeInactive = false } = {}) {
  const statusClause = includeInactive ? "" : "AND ct.status = 'active'";

  const [rows] = await runner.execute(
    `
      SELECT c.id, c.name, c.status AS course_status
      FROM course_teachers ct
      INNER JOIN courses c ON c.id = ct.course_id
      WHERE ct.teacher_id = ? ${statusClause}
      ORDER BY c.name ASC
    `,
    [teacherId]
  );

  return rows;
}

/**
 * Checagem de leitura pura (sem escrita), usada pelos helpers de
 * autorização de alta frequência -- ativa em course_teachers OU
 * courses.teacher_id legado, tratando o vínculo legado como elegível
 * mesmo quando ainda não foi refletido em course_teachers (ver
 * reconcileLegacyCourseTeacher para a versão que também escreve).
 */
async function isTeacherAssignedToCourse(runner, { courseId, teacherId }) {
  const [rows] = await runner.execute(
    `
      SELECT 1 FROM course_teachers
      WHERE course_id = ? AND teacher_id = ? AND status = 'active'
      UNION
      SELECT 1 FROM courses
      WHERE id = ? AND teacher_id = ?
      LIMIT 1
    `,
    [courseId, teacherId, courseId, teacherId]
  );

  return rows.length > 0;
}

async function assertTeacherAssignedToCourse(
  runner,
  { courseId, teacherId },
  { statusCode = 403, message = "O curso selecionado não pertence ao professor." } = {}
) {
  const assigned = await isTeacherAssignedToCourse(runner, { courseId, teacherId });

  if (!assigned) {
    throw createServiceError(message, statusCode);
  }
}

/**
 * Sincroniza, dentro da MESMA transação do chamador, o conjunto de
 * professores ativos de um curso para exatamente `teacherIds`.
 * Vínculo removido -> status='inactive' (nunca DELETE, preserva
 * histórico). Vínculo readicionado -> volta para 'active' em vez de
 * duplicar linha (PRIMARY KEY (course_id, teacher_id) garante isso).
 * `connection` precisa ser uma connection de transação (não o pool),
 * já que múltiplas escritas acontecem aqui.
 */
async function syncCourseTeachers(connection, courseId, teacherIds) {
  const [existingRows] = await connection.execute(
    `SELECT teacher_id, status FROM course_teachers WHERE course_id = ? FOR UPDATE`,
    [courseId]
  );

  const desiredIds = new Set(teacherIds);

  for (const teacherId of teacherIds) {
    await connection.execute(
      `
        INSERT INTO course_teachers (course_id, teacher_id, status)
        VALUES (?, ?, 'active')
        ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()
      `,
      [courseId, teacherId]
    );
  }

  const toDeactivate = existingRows.filter(
    (row) => row.status === "active" && !desiredIds.has(row.teacher_id)
  );

  for (const row of toDeactivate) {
    await connection.execute(
      `UPDATE course_teachers SET status = 'inactive', updated_at = NOW() WHERE course_id = ? AND teacher_id = ?`,
      [courseId, row.teacher_id]
    );
  }

  return {
    active: teacherIds,
    deactivated: toDeactivate.map((row) => row.teacher_id),
  };
}

/** Mesma lógica de syncCourseTeachers, espelhada pelo lado do professor (edição de professor -> conjunto de cursos). */
async function syncTeacherCourses(connection, teacherId, courseIds) {
  const [existingRows] = await connection.execute(
    `SELECT course_id, status FROM course_teachers WHERE teacher_id = ? FOR UPDATE`,
    [teacherId]
  );

  const desiredIds = new Set(courseIds);

  for (const courseId of courseIds) {
    await connection.execute(
      `
        INSERT INTO course_teachers (course_id, teacher_id, status)
        VALUES (?, ?, 'active')
        ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()
      `,
      [courseId, teacherId]
    );
  }

  const toDeactivate = existingRows.filter(
    (row) => row.status === "active" && !desiredIds.has(row.course_id)
  );

  for (const row of toDeactivate) {
    await connection.execute(
      `UPDATE course_teachers SET status = 'inactive', updated_at = NOW() WHERE course_id = ? AND teacher_id = ?`,
      [row.course_id, teacherId]
    );
  }

  return {
    active: courseIds,
    deactivated: toDeactivate.map((row) => row.course_id),
  };
}

module.exports = {
  createServiceError,
  normalizeTeacherIds,
  normalizeCourseIds,
  validateTeacherIds,
  validateCourseIds,
  listCourseTeachers,
  listTeacherCourses,
  isTeacherAssignedToCourse,
  assertTeacherAssignedToCourse,
  syncCourseTeachers,
  syncTeacherCourses,
};
