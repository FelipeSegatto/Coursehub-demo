const GENERAL_SCOPE = "general";
const CLASS_SPECIFIC_SCOPE = "class_specific";

const CONTENT_TYPES = ["video", "pdf", "text", "live_class"];

/**
 * Cria um erro de negócio com status HTTP associado.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Condição SQL de escopo compartilhada por todas as consultas de
 * course_contents: conteúdo geral (class_id NULL) ou exclusivo da
 * turma informada. Requer um parâmetro posicional (classId) no
 * mesmo lugar do "?".
 */
function getContentScopeCondition(alias = "cc") {
  return `(${alias}.class_id IS NULL OR ${alias}.class_id = ?)`;
}

function resolveContentScope(classId) {
  return classId ? CLASS_SPECIFIC_SCOPE : GENERAL_SCOPE;
}

/**
 * Acrescenta classId/className/contentScope (camelCase) a uma linha
 * já normalizada, sem alterar nenhum campo existente.
 */
function withContentScopeFields(row, { classId, className } = {}) {
  const resolvedClassId =
    classId ?? row.classId ?? row.class_id ?? null;

  const resolvedClassName =
    className ?? row.className ?? row.class_name ?? null;

  return {
    ...row,
    classId: resolvedClassId,
    className: resolvedClassName,
    contentScope: resolveContentScope(resolvedClassId),
  };
}

/**
 * Mesma coisa, mas também garante as chaves snake_case
 * (class_id/class_name) para rotas legadas que devolvem os campos
 * crus do banco e onde não é seguro assumir que só a chave camelCase
 * será lida pelo frontend.
 */
function withContentScopeFieldsBothCasing(row, { classId, className } = {}) {
  const camelCased = withContentScopeFields(row, { classId, className });

  return {
    ...camelCased,
    class_id: camelCased.classId,
    class_name: camelCased.className,
  };
}

/**
 * Confirma que o conteúdo existe e pertence a um curso do professor
 * autenticado (membership via course_teachers, incluindo
 * courses.teacher_id legado como vínculo elegível -- ver
 * courseTeacherService.js#isTeacherAssignedToCourse). Lança 404
 * quando não existe ou não pertence.
 */
async function assertContentOwnedByTeacher(runner, { contentId, teacherId }) {
  const [rows] = await runner.execute(
    `
      SELECT
        cc.id,
        cc.course_id,
        cc.class_id,
        cc.title,
        cc.type,
        cc.status,
        cc.due_date

      FROM course_contents cc

      INNER JOIN courses c
        ON c.id = cc.course_id

      WHERE cc.id = ?
        AND (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
          )
          OR c.teacher_id = ?
        )

      LIMIT 1
    `,
    [contentId, teacherId, teacherId]
  );

  if (rows.length === 0) {
    throw createServiceError(
      "Conteúdo não encontrado ou não pertence ao professor.",
      404
    );
  }

  return rows[0];
}

module.exports = {
  GENERAL_SCOPE,
  CLASS_SPECIFIC_SCOPE,
  CONTENT_TYPES,
  createServiceError,
  getContentScopeCondition,
  resolveContentScope,
  withContentScopeFields,
  withContentScopeFieldsBothCasing,
  assertContentOwnedByTeacher,
};
