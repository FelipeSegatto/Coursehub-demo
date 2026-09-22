/**
 * Declaração de matrícula -- confirma que o aluno está/esteve
 * matriculado no curso, sem exigir nenhuma elegibilidade especial
 * (diferente da declaração de conclusão). Fingerprint = status atual
 * da matrícula: se o status muda (ex.: active -> completed), uma
 * nova declaração imutável é gerada; pedir de novo sem mudança
 * reaproveita a mesma.
 */
const { createDeclarationService } = require("./academicDeclarationEngine");
const { buildVerificationUrl, buildVerificationQrDataUri } = require("../documents/templates/academic/verificationQrCode");

const service = createDeclarationService({
  declarationType: "enrollment",

  buildFingerprint: (db, enrollment) => enrollment.status,

  buildSnapshot: async (db, enrollment, params, verificationCode) => ({
    verificationUrl: buildVerificationUrl(verificationCode),
    verificationQrDataUri: await buildVerificationQrDataUri(verificationCode),
    verificationCode,
    student: { name: enrollment.student_name, document: enrollment.student_cpf },
    course: { name: enrollment.course_name, workloadHours: enrollment.workload_hours },
    enrollment: { status: enrollment.status, enrolledAt: enrollment.enrolled_at },
    issuedAt: new Date(),
  }),
});

module.exports = {
  requestEnrollmentDeclaration: service.requestDeclaration,
  getEnrollmentDeclarationStatus: service.getDeclarationStatus,
  getEnrollmentDeclarationFile: service.getDeclarationFile,
};
