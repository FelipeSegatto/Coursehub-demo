/**
 * 2ª via de fatura (PDF). idempotency_key inclui o status atual da
 * fatura de propósito -- cada mudança de status real (aberta ->
 * vencida -> paga) produz uma nova via imutável (histórico auditável
 * de "como a fatura estava quando foi consultada"), mas pedir de novo
 * sem nenhuma mudança reaproveita a mesma linha já pronta, sem
 * trabalho duplicado.
 */
const { getActiveTemplate } = require("../documents/documentTemplateService");
const { enqueueDocument } = require("../documents/generatedDocumentService");

const DOCUMENT_TYPE = "invoice_copy";

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

async function loadInvoiceForDocument(db, invoiceId, accessContext) {
  const [rows] = await db.promise().query(
    `
      SELECT
        i.id, i.financial_contract_id, i.description, i.original_amount, i.amount,
        i.discount_amount, i.due_date, i.status, i.paid_at,
        fc.student_id, fc.plan_name, fc.contracting_party_name, fc.contracting_party_email,
        s.name AS student_name,
        co.name AS course_name
      FROM invoices i
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      INNER JOIN students s ON s.id = fc.student_id
      INNER JOIN courses co ON co.id = fc.course_id
      WHERE i.id = ?
      LIMIT 1
    `,
    [invoiceId]
  );

  if (rows.length === 0) {
    throw createServiceError("Fatura não encontrada.", 404);
  }

  const invoice = rows[0];

  if (accessContext.scope === "student" && invoice.student_id !== accessContext.studentId) {
    throw createServiceError("Fatura não encontrada.", 404);
  }

  return invoice;
}

function buildSnapshot(invoice) {
  return {
    invoice: {
      id: invoice.id,
      description: invoice.description,
      originalAmount: invoice.original_amount,
      amount: invoice.amount,
      discountAmount: invoice.discount_amount,
      dueDate: invoice.due_date,
      status: invoice.status,
      paidAt: invoice.paid_at,
    },
    contract: { id: invoice.financial_contract_id, planName: invoice.plan_name },
    course: { name: invoice.course_name },
    contractingParty: { name: invoice.contracting_party_name, email: invoice.contracting_party_email },
    student: { name: invoice.student_name },
  };
}

async function resolveContext(db, invoiceId, accessContext) {
  const invoice = await loadInvoiceForDocument(db, invoiceId, accessContext);
  const template = await getActiveTemplate(db, DOCUMENT_TYPE);
  const idempotencyKey = `invoice_copy:invoice:${invoice.id}:status:${invoice.status}:v${template.version}`;

  return { invoice, idempotencyKey };
}

async function requestInvoiceCopyDocument(db, { invoiceId, actorUserId, accessContext }) {
  const { invoice, idempotencyKey } = await resolveContext(db, invoiceId, accessContext);
  const snapshot = buildSnapshot(invoice);

  return enqueueDocument(db, {
    documentType: DOCUMENT_TYPE,
    subjectType: "invoice",
    subjectId: invoice.id,
    idempotencyKey,
    snapshot,
    requestedByUserId: actorUserId,
  });
}

async function getInvoiceCopyDocumentStatus(db, { invoiceId, accessContext }) {
  const { idempotencyKey } = await resolveContext(db, invoiceId, accessContext);

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

async function getInvoiceCopyDocumentFile(db, { invoiceId, accessContext }) {
  const { invoice, idempotencyKey } = await resolveContext(db, invoiceId, accessContext);

  const [rows] = await db
    .promise()
    .query(`SELECT id, status, storage_key FROM generated_documents WHERE idempotency_key = ?`, [idempotencyKey]);

  if (rows.length === 0 || rows[0].status !== "ready") {
    throw createServiceError("Documento não está disponível para download.", 404);
  }

  return { storageKey: rows[0].storage_key, filename: `fatura-${invoice.id}-2via.pdf` };
}

module.exports = {
  requestInvoiceCopyDocument,
  getInvoiceCopyDocumentStatus,
  getInvoiceCopyDocumentFile,
};
