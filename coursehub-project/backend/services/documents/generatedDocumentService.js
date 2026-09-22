/**
 * Orquestrador neutro de generated_documents -- não conhece contrato,
 * fatura ou pagamento, só o ciclo de vida genérico
 * queued -> generating -> (ready | failed), mais revoked. Os serviços
 * de domínio (backend/services/financial/*DocumentService.js) montam
 * o snapshot e a idempotency_key e chamam enqueueDocument(); o worker
 * (workers/documentGenerationWorker.js) chama claimBatch/markReady/markFailed.
 *
 * Nunca fala com o renderer nem com o storage diretamente -- isso é
 * responsabilidade do worker, propositalmente, para a rota HTTP nunca
 * ficar acoplada à lib de PDF (exigência explícita da spec do usuário).
 */
const { withTransaction } = require("../../utils/dbTransaction");
const { getActiveTemplate } = require("./documentTemplateService");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function toDocumentDto(row) {
  return {
    id: String(row.id),
    type: row.document_type,
    status: row.status,
    createdAt: row.created_at,
    generatedAt: row.generated_at,
    canDownload: row.status === "ready",
  };
}

/**
 * Idempotente por idempotency_key: se já existe uma linha (em
 * qualquer status -- queued/generating/ready/failed/revoked), ela é
 * retornada como está, nenhum novo trabalho é criado. Quem decide
 * regenerar depois de 'failed' é uma ação administrativa explícita
 * (retryFailedDocument), não uma nova chamada a enqueueDocument com a
 * mesma key.
 */
async function enqueueDocument(
  db,
  { documentType, subjectType, subjectId, idempotencyKey, snapshot, requestedByUserId = null }
) {
  return withTransaction(db, async (connection) => {
    const [existingRows] = await connection.query(
      `SELECT * FROM generated_documents WHERE idempotency_key = ? FOR UPDATE`,
      [idempotencyKey]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];

      if (existing.status === "failed") {
        await connection.query(
          `UPDATE generated_documents
           SET status = 'queued', failure_reason = NULL, updated_at = NOW()
           WHERE id = ? AND status = 'failed'`,
          [existing.id]
        );

        const [retriedRows] = await connection.query(
          `SELECT * FROM generated_documents WHERE id = ?`,
          [existing.id]
        );

        return toDocumentDto(retriedRows[0]);
      }

      return toDocumentDto(existing);
    }

    const template = await getActiveTemplate(db, documentType);

    const [result] = await connection.query(
      `INSERT INTO generated_documents
        (document_type, subject_type, subject_id, idempotency_key, template_id, template_version,
         status, snapshot_json, generated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
      [
        documentType,
        subjectType,
        subjectId,
        idempotencyKey,
        template.id,
        template.version,
        JSON.stringify(snapshot),
        requestedByUserId,
      ]
    );

    const [rows] = await connection.query(`SELECT * FROM generated_documents WHERE id = ?`, [
      result.insertId,
    ]);

    return toDocumentDto(rows[0]);
  });
}

async function getDocumentById(db, documentId) {
  const [rows] = await db.promise().query(`SELECT * FROM generated_documents WHERE id = ?`, [documentId]);

  return rows[0] || null;
}

/**
 * Claim-by-lease atômico, mesmo padrão de
 * notificationDeliveryService.claimBatch: FOR UPDATE SKIP LOCKED evita
 * que dois workers peguem a mesma linha; uma linha 'generating' cujo
 * lease expirou (worker anterior morreu) volta a ser elegível.
 */
async function claimBatch(db, { batchSize, workerId, leaseMinutes }) {
  return withTransaction(db, async (connection) => {
    const [rows] = await connection.query(
      `
        SELECT gd.id, gd.document_type, gd.subject_type, gd.subject_id, gd.template_id,
               gd.template_version, gd.snapshot_json, gd.attempt_count, gd.generated_by_user_id,
               dt.template_path
        FROM generated_documents gd
        INNER JOIN document_templates dt ON dt.id = gd.template_id
        WHERE gd.status = 'queued'
           OR (gd.status = 'generating' AND gd.locked_until <= NOW())
        ORDER BY gd.created_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      `,
      [batchSize]
    );

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);

    await connection.query(
      `
        UPDATE generated_documents
        SET status = 'generating', locked_by = ?, locked_until = NOW() + INTERVAL ? MINUTE,
            attempt_count = attempt_count + 1, updated_at = NOW()
        WHERE id IN (${ids.map(() => "?").join(",")})
      `,
      [workerId, leaseMinutes, ...ids]
    );

    return rows;
  });
}

async function markReady(db, documentId, { storageKey, fileHash, fileSizeBytes }) {
  await db.promise().query(
    `UPDATE generated_documents
     SET status = 'ready', storage_key = ?, file_hash = ?, file_size_bytes = ?,
         generated_at = NOW(), locked_by = NULL, locked_until = NULL, updated_at = NOW()
     WHERE id = ? AND status = 'generating'`,
    [storageKey, fileHash, fileSizeBytes, documentId]
  );
}

async function markFailed(db, documentId, { failureReason }) {
  await db.promise().query(
    `UPDATE generated_documents
     SET status = 'failed', failure_reason = ?, locked_by = NULL, locked_until = NULL, updated_at = NOW()
     WHERE id = ? AND status = 'generating'`,
    [String(failureReason || "Falha desconhecida na geração.").slice(0, 500), documentId]
  );
}

/**
 * Ação administrativa explícita para tentar de novo um documento
 * 'failed' -- reaproveita a mesma linha (mesma idempotency_key), só
 * volta o status para 'queued' para o worker pegar de novo.
 */
async function retryFailedDocument(db, documentId) {
  const [result] = await db
    .promise()
    .query(
      `UPDATE generated_documents SET status = 'queued', failure_reason = NULL, updated_at = NOW()
       WHERE id = ? AND status = 'failed'`,
      [documentId]
    );

  if (result.affectedRows === 0) {
    throw createServiceError("Documento não está em estado de falha para ser reprocessado.", 409);
  }
}

async function revokeDocument(db, { documentId, actorUserId, reason }) {
  const [result] = await db.promise().query(
    `UPDATE generated_documents
     SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = ?, revocation_reason = ?, updated_at = NOW()
     WHERE id = ? AND status = 'ready'`,
    [actorUserId, String(reason || "").slice(0, 500), documentId]
  );

  if (result.affectedRows === 0) {
    throw createServiceError("Documento não está disponível para ser revogado.", 409);
  }
}

module.exports = {
  enqueueDocument,
  getDocumentById,
  claimBatch,
  markReady,
  markFailed,
  retryFailedDocument,
  revokeDocument,
  toDocumentDto,
};
