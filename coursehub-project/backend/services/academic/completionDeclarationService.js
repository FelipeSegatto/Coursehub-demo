/**
 * Declaração de conclusão -- só emitida se evaluateEnrollmentCompletion
 * confirmar elegibilidade (mesma função usada para o certificado).
 * Fingerprint inclui a regra de conclusão usada (id+versão): se a
 * regra ativa do curso mudar depois, um novo pedido reavalia e gera
 * uma declaração nova refletindo a regra atual, em vez de reaproveitar
 * uma decisão tomada sob uma regra antiga.
 */
const { createDeclarationService } = require("./academicDeclarationEngine");
const { createServiceError } = require("./academicDocumentHelpers");
const { evaluateEnrollmentCompletion } = require("./enrollmentCompletionService");
const { buildVerificationUrl, buildVerificationQrDataUri } = require("../documents/templates/academic/verificationQrCode");

async function assertEligible(db, enrollment) {
  const evaluation = await evaluateEnrollmentCompletion(db, enrollment.id);

  if (!evaluation.eligible) {
    const unmet = evaluation.requirements.filter((requirement) => !requirement.met).map((requirement) => requirement.label);

    throw createServiceError(
      `Matrícula não elegível para declaração de conclusão. Requisitos não cumpridos: ${unmet.join(", ")}.`,
      409
    );
  }
}

const service = createDeclarationService({
  declarationType: "completion",

  assertEligible,

  buildFingerprint: async (db, enrollment) => {
    const evaluation = await evaluateEnrollmentCompletion(db, enrollment.id);

    return `rule:${evaluation.completionRuleId}:v${evaluation.completionRuleVersion}`;
  },

  buildSnapshot: async (db, enrollment, params, verificationCode) => {
    const evaluation = await evaluateEnrollmentCompletion(db, enrollment.id);

    return {
      verificationUrl: buildVerificationUrl(verificationCode),
      verificationQrDataUri: await buildVerificationQrDataUri(verificationCode),
      verificationCode,
      student: { name: enrollment.student_name, document: enrollment.student_cpf },
      course: { name: enrollment.course_name, workloadHours: enrollment.workload_hours },
      enrollment: { completedAt: enrollment.completed_at },
      eligibility: evaluation,
      issuedAt: new Date(),
    };
  },
});

module.exports = {
  requestCompletionDeclaration: service.requestDeclaration,
  getCompletionDeclarationStatus: service.getDeclarationStatus,
  getCompletionDeclarationFile: service.getDeclarationFile,
};
