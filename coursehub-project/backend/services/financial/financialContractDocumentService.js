/**
 * Documento comercial do contrato (PDF). accessContext segue o mesmo
 * formato de invoicePaymentService.js: {scope:'admin'} para rotas
 * administrativas (sem checagem extra de ownership, mesmo padrão do
 * resto do financeiro admin) ou {scope:'student', studentId} para o
 * aluno autenticado, cujo ownership é sempre verificado por SQL --
 * nunca confiado no corpo da requisição.
 *
 * Minuta enquanto o contrato não foi ativado; documento definitivo a
 * partir da ativação (activated_at não nulo) -- uma vez definitivo,
 * nunca regenerado, mesmo que o plano/preço mude depois (idempotency_key
 * muda de stage só uma vez, na transição draft -> definitive).
 */
const { getActiveTemplate } = require("../documents/documentTemplateService");
const { enqueueDocument } = require("../documents/generatedDocumentService");

const DOCUMENT_TYPE = "financial_contract";

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function parseJsonValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function loadContractForDocument(db, contractId, accessContext) {
  const [rows] = await db.promise().query(
    `
      SELECT
        fc.id, fc.student_id, fc.course_id, fc.activation_invoice_id, fc.activated_at, fc.status,
        fc.contracting_party_name, fc.contracting_party_document, fc.contracting_party_email,
        fc.contracting_party_address, fc.pricing_plan_id, fc.billing_type, fc.plan_name,
        fc.total_amount, fc.monthly_payment_count, fc.monthly_payment_amount, fc.start_date,
        fc.created_at,
        s.name AS student_name, s.cpf AS student_cpf,
        co.name AS course_name
      FROM financial_contracts fc
      INNER JOIN students s ON s.id = fc.student_id
      INNER JOIN courses co ON co.id = fc.course_id
      WHERE fc.id = ?
      LIMIT 1
    `,
    [contractId]
  );

  if (rows.length === 0) {
    throw createServiceError("Contrato financeiro não encontrado.", 404);
  }

  const contract = rows[0];

  // 404 (não 403) numa checagem de ownership -- nunca revela que o
  // registro existe para quem não tem acesso a ele.
  if (accessContext.scope === "student" && contract.student_id !== accessContext.studentId) {
    throw createServiceError("Contrato financeiro não encontrado.", 404);
  }

  return contract;
}

async function loadFirstInvoice(db, contract) {
  const params = contract.activation_invoice_id
    ? { sql: `SELECT amount, due_date, description FROM invoices WHERE id = ? LIMIT 1`, args: [contract.activation_invoice_id] }
    : {
        sql: `SELECT amount, due_date, description FROM invoices WHERE financial_contract_id = ? ORDER BY id ASC LIMIT 1`,
        args: [contract.id],
      };

  const [rows] = await db.promise().query(params.sql, params.args);

  return rows[0] || { amount: contract.total_amount, due_date: null, description: contract.plan_name };
}

// Sinal primário é activated_at, mas contratos anteriores à introdução
// dessa coluna existem com activated_at nulo mesmo já tendo sido
// ativados de verdade (confirmado em dados reais: contratos
// 'completed'/'overdue' com activated_at NULL) -- o status também
// nunca sai de 'pending_payment' sem passar por
// activateContractFromPaidInvoice, então ele é um sinal igualmente
// confiável e cobre essa lacuna de dado legado sem precisar de
// backfill.
const STATUSES_IMPLYING_ACTIVATION = new Set(["active", "overdue", "completed"]);

function resolveStage(contract) {
  if (contract.activated_at || STATUSES_IMPLYING_ACTIVATION.has(contract.status)) {
    return "definitive";
  }

  return "draft";
}

function buildSnapshot(contract, firstInvoice, stage) {
  return {
    contract: {
      id: contract.id,
      planName: contract.plan_name,
      billingType: contract.billing_type,
      totalAmount: contract.total_amount,
      monthlyPaymentCount: contract.monthly_payment_count,
      monthlyPaymentAmount: contract.monthly_payment_amount,
      startDate: contract.start_date,
      createdAt: contract.created_at,
      activatedAt: contract.activated_at,
      stage,
    },
    course: { name: contract.course_name },
    contractingParty: {
      name: contract.contracting_party_name,
      document: contract.contracting_party_document,
      email: contract.contracting_party_email,
      address: parseJsonValue(contract.contracting_party_address),
    },
    student: { name: contract.student_name, document: contract.student_cpf },
    firstInvoice: {
      amount: firstInvoice.amount,
      dueDate: firstInvoice.due_date,
      description: firstInvoice.description,
    },
  };
}

async function resolveContext(db, contractId, accessContext) {
  const contract = await loadContractForDocument(db, contractId, accessContext);
  const stage = resolveStage(contract);
  const template = await getActiveTemplate(db, DOCUMENT_TYPE);
  const idempotencyKey = `contract:contract:${contract.id}:stage:${stage}:v${template.version}`;

  return { contract, stage, idempotencyKey };
}

async function requestContractDocument(db, { contractId, actorUserId, accessContext }) {
  const { contract, stage, idempotencyKey } = await resolveContext(db, contractId, accessContext);
  const firstInvoice = await loadFirstInvoice(db, contract);
  const snapshot = buildSnapshot(contract, firstInvoice, stage);

  return enqueueDocument(db, {
    documentType: DOCUMENT_TYPE,
    subjectType: "financial_contract",
    subjectId: contract.id,
    idempotencyKey,
    snapshot,
    requestedByUserId: actorUserId,
  });
}

async function getContractDocumentStatus(db, { contractId, accessContext }) {
  const { idempotencyKey } = await resolveContext(db, contractId, accessContext);

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

async function getContractDocumentFile(db, { contractId, accessContext }) {
  const { contract, idempotencyKey } = await resolveContext(db, contractId, accessContext);

  const [rows] = await db
    .promise()
    .query(`SELECT id, status, storage_key FROM generated_documents WHERE idempotency_key = ?`, [idempotencyKey]);

  if (rows.length === 0 || rows[0].status !== "ready") {
    throw createServiceError("Documento não está disponível para download.", 404);
  }

  return { storageKey: rows[0].storage_key, filename: `contrato-${contract.id}.pdf` };
}

module.exports = {
  requestContractDocument,
  getContractDocumentStatus,
  getContractDocumentFile,
};
