/**
 * Helpers compartilhados pelos serviços de documentos acadêmicos
 * (declarações + certificados): resolução de matrícula com ownership,
 * e geração de código de verificação público.
 */
const crypto = require("crypto");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * accessContext: {scope:'admin'} | {scope:'student', studentId} --
 * mesmo formato usado pelos serviços financeiros da Fase 1. 404 (não
 * 403) numa checagem de ownership, nunca revela que o registro existe
 * para quem não tem acesso a ele.
 */
async function loadEnrollmentForAcademicDocument(db, enrollmentId, accessContext) {
  const [rows] = await db.promise().query(
    `
      SELECT
        e.id, e.student_id, e.course_id, e.class_id, e.status,
        e.enrolled_at, e.completed_at,
        s.name AS student_name, s.cpf AS student_cpf,
        co.name AS course_name, co.workload_hours
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN courses co ON co.id = e.course_id
      WHERE e.id = ?
      LIMIT 1
    `,
    [enrollmentId]
  );

  if (rows.length === 0) {
    throw createServiceError("Matrícula não encontrada.", 404);
  }

  const enrollment = rows[0];

  if (accessContext.scope === "student" && enrollment.student_id !== accessContext.studentId) {
    throw createServiceError("Matrícula não encontrada.", 404);
  }

  return enrollment;
}

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I) -- código pensado
// para ser lido/digitado por alguém verificando um documento.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateVerificationCode(length = 12) {
  const bytes = crypto.randomBytes(length);
  let code = "";

  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }

  return code;
}

module.exports = {
  createServiceError,
  loadEnrollmentForAcademicDocument,
  generateVerificationCode,
};
