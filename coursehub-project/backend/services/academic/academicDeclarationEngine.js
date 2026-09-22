/**
 * Motor compartilhado pelos 3 tipos de declaração acadêmica
 * (matrícula/frequência/conclusão) -- a máquina de idempotência/
 * transação é idêntica nos 3 casos, só o fingerprint, o snapshot e a
 * checagem extra de elegibilidade (só conclusão) mudam. Mesmo
 * espírito do `mountDocumentAccessRoutes` da Fase 1: uma implementação
 * compartilhada, comportamento específico injetado por config.
 *
 * `declarations` é a entidade de domínio (fato acadêmico + auditoria +
 * código de verificação); `generated_documents` (Fase 0) é só o
 * registro de geração/arquivo do PDF. Uma linha de declarations sempre
 * aponta para exatamente uma linha de generated_documents via
 * generated_document_id, nunca o contrário.
 */
const { withTransaction } = require("../../utils/dbTransaction");
const { getActiveTemplate } = require("../documents/documentTemplateService");
const { enqueueDocument } = require("../documents/generatedDocumentService");
const {
  createServiceError,
  loadEnrollmentForAcademicDocument,
  generateVerificationCode,
} = require("./academicDocumentHelpers");

function toDeclarationDto(declarationRow, documentStatus, canDownload) {
  return {
    id: String(declarationRow.id),
    type: declarationRow.declaration_type,
    enrollmentId: declarationRow.enrollment_id,
    verificationCode: declarationRow.verification_code,
    declarationStatus: declarationRow.status,
    documentStatus,
    canDownload,
    createdAt: declarationRow.created_at,
  };
}

/**
 * @param {object} config
 * @param {string} config.declarationType - 'enrollment' | 'attendance' | 'completion'
 * @param {(db, enrollment, params) => Promise<string>} config.buildFingerprint - async, sem estado compartilhado entre chamadas concorrentes
 * @param {(db, enrollment, params, verificationCode) => Promise<object>} config.buildSnapshot - async; verificationCode já existe neste ponto, gerado antes por requestDeclaration
 * @param {(db, enrollment) => Promise<void>} [config.assertEligible] - só 'completion' usa isto; lança 409 se não elegível
 * @param {(params) => void} [config.validateParams] - só 'attendance' usa isto; lança 400 se faltar período
 */
function createDeclarationService(config) {
  const documentType = `${config.declarationType}_declaration`;

  async function resolveIdempotencyKey(db, enrollment, params) {
    if (config.validateParams) config.validateParams(params);

    const template = await getActiveTemplate(db, documentType);
    const fingerprint = await config.buildFingerprint(db, enrollment, params);

    return {
      idempotencyKey: `declaration:${config.declarationType}:enrollment:${enrollment.id}:fact:${fingerprint}:v${template.version}`,
    };
  }

  async function requestDeclaration(db, { enrollmentId, actorUserId, accessContext, params = {} }) {
    const enrollment = await loadEnrollmentForAcademicDocument(db, enrollmentId, accessContext);

    if (config.assertEligible) {
      await config.assertEligible(db, enrollment);
    }

    const { idempotencyKey } = await resolveIdempotencyKey(db, enrollment, params);

    // O código de verificação precisa existir ANTES do snapshot --
    // ele é impresso/embutido em QR no próprio PDF, então o mesmo
    // código usado no arquivo tem que ser o que acaba gravado em
    // declarations.verification_code, nunca um gerado depois.
    const verificationCode = generateVerificationCode();
    const snapshot = await config.buildSnapshot(db, enrollment, params, verificationCode);

    const documentDto = await enqueueDocument(db, {
      documentType,
      subjectType: "enrollment",
      subjectId: enrollment.id,
      idempotencyKey,
      snapshot,
      requestedByUserId: actorUserId,
    });

    return withTransaction(db, async (connection) => {
      const [existingRows] = await connection.query(
        `SELECT * FROM declarations WHERE generated_document_id = ? LIMIT 1`,
        [documentDto.id]
      );

      if (existingRows.length > 0) {
        return toDeclarationDto(existingRows[0], documentDto.status, documentDto.canDownload);
      }

      const [result] = await connection.query(
        `INSERT INTO declarations
          (declaration_type, enrollment_id, reference_period_start, reference_period_end,
           generated_document_id, verification_code, requested_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          config.declarationType,
          enrollment.id,
          params.referencePeriodStart || null,
          params.referencePeriodEnd || null,
          documentDto.id,
          verificationCode,
          actorUserId,
        ]
      );

      const [rows] = await connection.query(`SELECT * FROM declarations WHERE id = ?`, [result.insertId]);

      return toDeclarationDto(rows[0], documentDto.status, documentDto.canDownload);
    });
  }

  async function getDeclarationStatus(db, { enrollmentId, accessContext, params = {} }) {
    const enrollment = await loadEnrollmentForAcademicDocument(db, enrollmentId, accessContext);
    const { idempotencyKey } = await resolveIdempotencyKey(db, enrollment, params);

    const [docRows] = await db
      .promise()
      .query(`SELECT id, status, generated_at FROM generated_documents WHERE idempotency_key = ?`, [
        idempotencyKey,
      ]);

    if (docRows.length === 0) {
      throw createServiceError("Documento ainda não foi solicitado.", 404);
    }

    const [declRows] = await db
      .promise()
      .query(`SELECT * FROM declarations WHERE generated_document_id = ?`, [docRows[0].id]);

    if (declRows.length === 0) {
      throw createServiceError("Documento ainda não foi solicitado.", 404);
    }

    return toDeclarationDto(declRows[0], docRows[0].status, docRows[0].status === "ready");
  }

  async function getDeclarationFile(db, { enrollmentId, accessContext, params = {} }) {
    const enrollment = await loadEnrollmentForAcademicDocument(db, enrollmentId, accessContext);
    const { idempotencyKey } = await resolveIdempotencyKey(db, enrollment, params);

    const [docRows] = await db
      .promise()
      .query(`SELECT id, status, storage_key FROM generated_documents WHERE idempotency_key = ?`, [
        idempotencyKey,
      ]);

    if (docRows.length === 0 || docRows[0].status !== "ready") {
      throw createServiceError("Documento não está disponível para download.", 404);
    }

    const [declRows] = await db
      .promise()
      .query(`SELECT status FROM declarations WHERE generated_document_id = ?`, [docRows[0].id]);

    if (declRows.length === 0 || declRows[0].status !== "active") {
      throw createServiceError("Documento não está disponível para download.", 404);
    }

    return {
      storageKey: docRows[0].storage_key,
      filename: `declaracao-${config.declarationType}-${enrollment.id}.pdf`,
    };
  }

  return { requestDeclaration, getDeclarationStatus, getDeclarationFile };
}

async function revokeDeclaration(db, { declarationId, actorUserId, reason }) {
  const [result] = await db.promise().query(
    `UPDATE declarations
     SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = ?, revocation_reason = ?, updated_at = NOW()
     WHERE id = ? AND status = 'active'`,
    [actorUserId, String(reason || "").slice(0, 500), declarationId]
  );

  if (result.affectedRows === 0) {
    throw createServiceError("Declaração não está ativa para ser revogada.", 409);
  }
}

module.exports = { createDeclarationService, revokeDeclaration };
