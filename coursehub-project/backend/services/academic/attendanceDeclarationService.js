/**
 * Declaração de frequência por período -- só emitida se a matrícula
 * tiver turma (frequência não existe sem sessões de turma). O
 * fingerprint inclui o período E a contagem de presenças já
 * registradas nesse período: se novas presenças forem lançadas depois
 * (professor corrigindo/completando o registro), pedir de novo gera
 * uma declaração nova; sem mudança, reaproveita a mesma.
 */
const { createDeclarationService } = require("./academicDeclarationEngine");
const { createServiceError } = require("./academicDocumentHelpers");
const { buildVerificationUrl, buildVerificationQrDataUri } = require("../documents/templates/academic/verificationQrCode");

function validateParams(params) {
  if (!params.referencePeriodStart || !params.referencePeriodEnd) {
    throw createServiceError(
      "Período de referência (início e fim) é obrigatório para a declaração de frequência.",
      400
    );
  }
}

async function calculatePeriodAttendance(db, { studentId, classId, periodStart, periodEnd }) {
  if (!classId) {
    return { totalSessions: 0, presentSessions: 0, rate: null };
  }

  const [rows] = await db.promise().query(
    `
      SELECT a.status
      FROM attendance a
      INNER JOIN class_sessions cs ON cs.id = a.class_session_id
      WHERE cs.class_id = ? AND a.student_id = ?
        AND cs.status NOT IN ('cancelled', 'archived')
        AND cs.session_date BETWEEN ? AND ?
    `,
    [classId, studentId, periodStart, periodEnd]
  );

  const totalSessions = rows.length;
  const presentSessions = rows.filter((row) => row.status === "present").length;
  const rate = totalSessions > 0 ? Number(((presentSessions / totalSessions) * 100).toFixed(2)) : null;

  return { totalSessions, presentSessions, rate };
}

const service = createDeclarationService({
  declarationType: "attendance",

  validateParams,

  buildFingerprint: async (db, enrollment, params) => {
    const attendance = await calculatePeriodAttendance(db, {
      studentId: enrollment.student_id,
      classId: enrollment.class_id,
      periodStart: params.referencePeriodStart,
      periodEnd: params.referencePeriodEnd,
    });

    return `${params.referencePeriodStart}:${params.referencePeriodEnd}:${attendance.presentSessions}:${attendance.totalSessions}`;
  },

  buildSnapshot: async (db, enrollment, params, verificationCode) => {
    const attendance = await calculatePeriodAttendance(db, {
      studentId: enrollment.student_id,
      classId: enrollment.class_id,
      periodStart: params.referencePeriodStart,
      periodEnd: params.referencePeriodEnd,
    });

    return {
      verificationUrl: buildVerificationUrl(verificationCode),
      verificationQrDataUri: await buildVerificationQrDataUri(verificationCode),
      verificationCode,
      student: { name: enrollment.student_name, document: enrollment.student_cpf },
      course: { name: enrollment.course_name },
      period: { start: params.referencePeriodStart, end: params.referencePeriodEnd },
      attendance,
      issuedAt: new Date(),
    };
  },
});

module.exports = {
  requestAttendanceDeclaration: service.requestDeclaration,
  getAttendanceDeclarationStatus: service.getDeclarationStatus,
  getAttendanceDeclarationFile: service.getDeclarationFile,
};
