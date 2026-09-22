/**
 * Certificados de conclusão -- sempre emitidos por admin, sempre só
 * depois de evaluateEnrollmentCompletion confirmar elegibilidade.
 * `certificates` é a entidade de domínio (fato + auditoria + código
 * de verificação + snapshot congelado da elegibilidade que gerou o
 * certificado); `generated_documents` (Fase 0) é só o registro de
 * geração/arquivo do PDF.
 *
 * No máximo um certificado 'active' por enrollment_id -- checado
 * antes de inserir (mesma convenção de document_templates/
 * completion_rules: sem constraint de banco para "só um ativo",
 * garantido em código).
 */
const { withTransaction } = require("../../utils/dbTransaction");
const { getActiveTemplate } = require("../documents/documentTemplateService");
const { enqueueDocument } = require("../documents/generatedDocumentService");
const {
  createServiceError,
  loadEnrollmentForAcademicDocument,
  generateVerificationCode,
} = require("./academicDocumentHelpers");
const { evaluateEnrollmentCompletion } = require("./enrollmentCompletionService");
const { buildVerificationUrl, buildVerificationQrDataUri } = require("../documents/templates/academic/verificationQrCode");

const DOCUMENT_TYPE = "certificate";

function toCertificateDto(row, documentStatus, canDownload) {
  return {
    id: String(row.id),
    enrollmentId: row.enrollment_id,
    verificationCode: row.verification_code,
    certificateStatus: row.status,
    documentStatus,
    canDownload,
    createdAt: row.created_at,
  };
}

/**
 * O QR code é gerado aqui (uma vez, no momento da emissão) e embutido
 * como data URI direto no snapshot -- o template (render()) permanece
 * uma função síncrona e pura, nunca precisa gerar nada nem acessar
 * rede; o worker/renderer também nunca busca a imagem, só embute o
 * data URI já pronto que veio no snapshot congelado.
 */
async function buildCertificateSnapshot(enrollment, evaluation, verificationCode) {
  const verificationQrDataUri = await buildVerificationQrDataUri(verificationCode);
  const verificationUrl = buildVerificationUrl(verificationCode);

  return {
    verificationUrl,
    verificationQrDataUri,
    student: { name: enrollment.student_name, document: enrollment.student_cpf },
    course: { name: enrollment.course_name, workloadHours: enrollment.workload_hours },
    completedAt: enrollment.completed_at,
    verificationCode,
    issuedAt: new Date(),
    eligibility: evaluation,
  };
}

async function issueCertificate(db, { enrollmentId, actorUserId, reissueOfCertificateId = null }) {
  const enrollment = await loadEnrollmentForAcademicDocument(db, enrollmentId, { scope: "admin" });
  const evaluation = await evaluateEnrollmentCompletion(db, enrollmentId);

  if (!evaluation.eligible) {
    const unmet = evaluation.requirements
      .filter((requirement) => !requirement.met)
      .map((requirement) => requirement.label);

    throw createServiceError(
      `Matrícula não elegível para certificado. Requisitos não cumpridos: ${unmet.join(", ")}.`,
      409
    );
  }

  if (!reissueOfCertificateId) {
    const [existingActiveRows] = await db
      .promise()
      .query(`SELECT * FROM certificates WHERE enrollment_id = ? AND status = 'active' LIMIT 1`, [enrollmentId]);

    if (existingActiveRows.length > 0) {
      const [docRows] = await db
        .promise()
        .query(`SELECT status FROM generated_documents WHERE id = ?`, [existingActiveRows[0].generated_document_id]);

      return toCertificateDto(existingActiveRows[0], docRows[0]?.status, docRows[0]?.status === "ready");
    }
  }

  const template = await getActiveTemplate(db, DOCUMENT_TYPE);
  const verificationCode = generateVerificationCode();

  // Reemissão precisa de uma idempotency_key distinta -- caso
  // contrário reaproveitaria o mesmo PDF já gerado (com o código de
  // verificação ANTIGO impresso nele), o que seria incorreto: um
  // certificado reemitido tem um código novo e precisa de um PDF novo.
  const idempotencyKey = reissueOfCertificateId
    ? `certificate:enrollment:${enrollmentId}:rule:${evaluation.completionRuleId}:v${template.version}:reissue:${reissueOfCertificateId}`
    : `certificate:enrollment:${enrollmentId}:rule:${evaluation.completionRuleId}:v${template.version}`;

  const snapshot = await buildCertificateSnapshot(enrollment, evaluation, verificationCode);

  const documentDto = await enqueueDocument(db, {
    documentType: DOCUMENT_TYPE,
    subjectType: "enrollment",
    subjectId: enrollmentId,
    idempotencyKey,
    snapshot,
    requestedByUserId: actorUserId,
  });

  return withTransaction(db, async (connection) => {
    const [existingLinkedRows] = await connection.query(
      `SELECT * FROM certificates WHERE generated_document_id = ? LIMIT 1 FOR UPDATE`,
      [documentDto.id]
    );

    if (existingLinkedRows.length > 0) {
      return toCertificateDto(existingLinkedRows[0], documentDto.status, documentDto.canDownload);
    }

    const [result] = await connection.query(
      `INSERT INTO certificates
        (enrollment_id, completion_rule_id, eligibility_snapshot, generated_document_id, verification_code, issued_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        enrollmentId,
        evaluation.completionRuleId,
        JSON.stringify(evaluation),
        documentDto.id,
        verificationCode,
        actorUserId,
      ]
    );

    const [rows] = await connection.query(`SELECT * FROM certificates WHERE id = ?`, [result.insertId]);

    return toCertificateDto(rows[0], documentDto.status, documentDto.canDownload);
  });
}

async function getCertificateStatus(db, { enrollmentId, accessContext }) {
  const enrollment = await loadEnrollmentForAcademicDocument(db, enrollmentId, accessContext);

  const [rows] = await db.promise().query(
    `SELECT c.*, gd.status AS document_status
     FROM certificates c
     LEFT JOIN generated_documents gd ON gd.id = c.generated_document_id
     WHERE c.enrollment_id = ? AND c.status = 'active'
     ORDER BY c.id DESC LIMIT 1`,
    [enrollment.id]
  );

  if (rows.length === 0) {
    throw createServiceError("Certificado ainda não foi emitido.", 404);
  }

  return toCertificateDto(rows[0], rows[0].document_status, rows[0].document_status === "ready");
}

async function getCertificateFile(db, { enrollmentId, accessContext }) {
  const enrollment = await loadEnrollmentForAcademicDocument(db, enrollmentId, accessContext);

  const [rows] = await db.promise().query(
    `SELECT c.id, gd.status, gd.storage_key
     FROM certificates c
     INNER JOIN generated_documents gd ON gd.id = c.generated_document_id
     WHERE c.enrollment_id = ? AND c.status = 'active'
     ORDER BY c.id DESC LIMIT 1`,
    [enrollment.id]
  );

  if (rows.length === 0 || rows[0].status !== "ready") {
    throw createServiceError("Certificado não está disponível para download.", 404);
  }

  return { storageKey: rows[0].storage_key, filename: `certificado-${enrollment.id}.pdf` };
}

async function revokeCertificate(db, { certificateId, actorUserId, reason }) {
  const [result] = await db.promise().query(
    `UPDATE certificates
     SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = ?, revocation_reason = ?, updated_at = NOW()
     WHERE id = ? AND status = 'active'`,
    [actorUserId, String(reason || "").slice(0, 500), certificateId]
  );

  if (result.affectedRows === 0) {
    throw createServiceError("Certificado não está ativo para ser revogado.", 409);
  }
}

async function reissueCertificate(db, { certificateId, actorUserId }) {
  const [oldRows] = await db.promise().query(`SELECT * FROM certificates WHERE id = ?`, [certificateId]);

  if (oldRows.length === 0) {
    throw createServiceError("Certificado não encontrado.", 404);
  }

  const old = oldRows[0];

  if (old.status !== "revoked") {
    throw createServiceError("Só é possível reemitir um certificado revogado.", 409);
  }

  const newCertificate = await issueCertificate(db, {
    enrollmentId: old.enrollment_id,
    actorUserId,
    reissueOfCertificateId: old.id,
  });

  await db
    .promise()
    .query(`UPDATE certificates SET superseded_by_certificate_id = ?, updated_at = NOW() WHERE id = ?`, [
      newCertificate.id,
      old.id,
    ]);

  return newCertificate;
}

module.exports = {
  issueCertificate,
  getCertificateStatus,
  getCertificateFile,
  revokeCertificate,
  reissueCertificate,
};
