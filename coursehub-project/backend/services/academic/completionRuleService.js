/**
 * Regras de conclusão versionadas por curso -- mesma convenção de
 * "só uma versão ativa" via aplicação (não constraint de banco) já
 * usada por document_templates (Fase 0). Editar uma regra sempre cria
 * uma nova versão; a versão anterior é aposentada, nunca editada --
 * certificados/declarações já emitidos guardam o id da versão que
 * usaram (certificates.completion_rule_id) e continuam corretos.
 */
const { withTransaction } = require("../../utils/dbTransaction");
const { createServiceError } = require("./academicDocumentHelpers");

async function getActiveRule(db, courseId) {
  const [rows] = await db
    .promise()
    .query(`SELECT * FROM completion_rules WHERE course_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`, [
      courseId,
    ]);

  return rows[0] || null;
}

async function listRuleVersions(db, courseId) {
  const [rows] = await db
    .promise()
    .query(`SELECT * FROM completion_rules WHERE course_id = ? ORDER BY version DESC`, [courseId]);

  return rows;
}

function normalizePercentage(value) {
  if (value === undefined || value === null || value === "") return null;

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw createServiceError("Percentuais de regra de conclusão devem estar entre 0 e 100.", 400);
  }

  return numeric;
}

function normalizeGrade(value) {
  if (value === undefined || value === null || value === "") return null;

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
    throw createServiceError("A nota mínima deve estar entre 0 e 10.", 400);
  }

  return numeric;
}

async function createRuleVersion(
  db,
  {
    courseId,
    minContentProgressPercentage,
    minAttendancePercentage,
    minAverageGrade,
    requireAllMandatoryItems = true,
    createdByUserId,
  }
) {
  const normalizedContentProgress = normalizePercentage(minContentProgressPercentage);
  const normalizedAttendance = normalizePercentage(minAttendancePercentage);
  const normalizedGrade = normalizeGrade(minAverageGrade);

  if (
    normalizedContentProgress === null &&
    normalizedAttendance === null &&
    normalizedGrade === null &&
    !requireAllMandatoryItems
  ) {
    throw createServiceError("A regra de conclusão precisa definir ao menos um critério.", 400);
  }

  return withTransaction(db, async (connection) => {
    const [maxVersionRows] = await connection.query(
      `SELECT COALESCE(MAX(version), 0) AS maxVersion FROM completion_rules WHERE course_id = ? FOR UPDATE`,
      [courseId]
    );
    const nextVersion = Number(maxVersionRows[0].maxVersion) + 1;

    await connection.query(
      `UPDATE completion_rules SET status = 'retired', updated_at = NOW() WHERE course_id = ? AND status = 'active'`,
      [courseId]
    );

    const [result] = await connection.query(
      `INSERT INTO completion_rules
        (course_id, version, min_content_progress_percentage, min_attendance_percentage, min_average_grade,
         require_all_mandatory_items, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        courseId,
        nextVersion,
        normalizedContentProgress,
        normalizedAttendance,
        normalizedGrade,
        requireAllMandatoryItems,
        createdByUserId,
      ]
    );

    const [rows] = await connection.query(`SELECT * FROM completion_rules WHERE id = ?`, [result.insertId]);

    return rows[0];
  });
}

module.exports = { getActiveRule, listRuleVersions, createRuleVersion };
