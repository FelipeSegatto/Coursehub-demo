/**
 * Recibo de pagamento (PDF). Só pode ser emitido para um pagamento
 * 'approved' -- rejeita com 409 antes de sequer montar o snapshot.
 * idempotency_key não inclui status (diferente da 2ª via de fatura):
 * um pagamento aprovado tem no máximo um recibo, para sempre: um
 * estorno posterior não apaga nem reescreve este documento, é
 * representado como um evento/documento separado (fora do escopo
 * desta fase).
 */
const { getActiveTemplate } = require("../documents/documentTemplateService");
const { enqueueDocument } = require("../documents/generatedDocumentService");

const DOCUMENT_TYPE = "payment_receipt";

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function buildSafeReference(payment) {
  return `${payment.gateway}-${String(payment.id).padStart(6, "0")}`;
}

async function loadPaymentForDocument(db, paymentId, accessContext) {
  const [rows] = await db.promise().query(
    `
      SELECT
        p.id, p.gateway, p.payment_method, p.amount, p.status, p.paid_at, p.invoice_id,
        i.description AS invoice_description, i.financial_contract_id,
        fc.student_id, fc.plan_name, fc.contracting_party_name, fc.contracting_party_email,
        co.name AS course_name
      FROM payments p
      INNER JOIN invoices i ON i.id = p.invoice_id
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      INNER JOIN courses co ON co.id = fc.course_id
      WHERE p.id = ?
      LIMIT 1
    `,
    [paymentId]
  );

  if (rows.length === 0) {
    throw createServiceError("Pagamento não encontrado.", 404);
  }

  const payment = rows[0];

  if (accessContext.scope === "student" && payment.student_id !== accessContext.studentId) {
    throw createServiceError("Pagamento não encontrado.", 404);
  }

  if (payment.status !== "approved") {
    throw createServiceError("Recibo só pode ser emitido para um pagamento confirmado.", 409);
  }

  return payment;
}

function buildSnapshot(payment) {
  return {
    payment: {
      id: payment.id,
      amount: payment.amount,
      paidAt: payment.paid_at,
      paymentMethod: payment.payment_method,
      safeReference: buildSafeReference(payment),
    },
    invoice: { id: payment.invoice_id, description: payment.invoice_description },
    contract: { id: payment.financial_contract_id, planName: payment.plan_name },
    course: { name: payment.course_name },
    payer: { name: payment.contracting_party_name, email: payment.contracting_party_email },
  };
}

async function resolveContext(db, paymentId, accessContext) {
  const payment = await loadPaymentForDocument(db, paymentId, accessContext);
  const template = await getActiveTemplate(db, DOCUMENT_TYPE);
  const idempotencyKey = `receipt:payment:${payment.id}:v${template.version}`;

  return { payment, idempotencyKey };
}

async function requestPaymentReceipt(db, { paymentId, actorUserId, accessContext }) {
  const { payment, idempotencyKey } = await resolveContext(db, paymentId, accessContext);
  const snapshot = buildSnapshot(payment);

  return enqueueDocument(db, {
    documentType: DOCUMENT_TYPE,
    subjectType: "payment",
    subjectId: payment.id,
    idempotencyKey,
    snapshot,
    requestedByUserId: actorUserId,
  });
}

async function getPaymentReceiptStatus(db, { paymentId, accessContext }) {
  const { idempotencyKey } = await resolveContext(db, paymentId, accessContext);

  const [rows] = await db
    .promise()
    .query(`SELECT id, status, created_at, generated_at FROM generated_documents WHERE idempotency_key = ?`, [
      idempotencyKey,
    ]);

  if (rows.length === 0) {
    throw createServiceError("Documento ainda não foi solicitado.", 404);
  }

  return {
    id: String(rows[0].id),
    type: DOCUMENT_TYPE,
    status: rows[0].status,
    createdAt: rows[0].created_at,
    generatedAt: rows[0].generated_at,
    canDownload: rows[0].status === "ready",
  };
}

async function getPaymentReceiptFile(db, { paymentId, accessContext }) {
  const { payment, idempotencyKey } = await resolveContext(db, paymentId, accessContext);

  const [rows] = await db
    .promise()
    .query(`SELECT id, status, storage_key FROM generated_documents WHERE idempotency_key = ?`, [idempotencyKey]);

  if (rows.length === 0 || rows[0].status !== "ready") {
    throw createServiceError("Documento não está disponível para download.", 404);
  }

  return { storageKey: rows[0].storage_key, filename: `recibo-pagamento-${payment.id}.pdf` };
}

module.exports = {
  requestPaymentReceipt,
  getPaymentReceiptStatus,
  getPaymentReceiptFile,
};
