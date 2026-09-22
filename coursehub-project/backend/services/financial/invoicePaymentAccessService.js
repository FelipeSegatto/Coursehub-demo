/**
 * Link privado de pagamento de invoice: geração/compartilhamento (uso
 * administrativo) e troca de token por sessão + leitura mínima (uso
 * público, sem login). Nunca expõe o token bruto mais de uma vez, e a
 * leitura pública nunca devolve CPF completo, e-mail completo,
 * contrato inteiro, outras invoices ou IDs internos -- só o essencial
 * para o pagador confirmar que está pagando a cobrança certa.
 */
const {
  createAccessToken,
  findValidAccessToken,
  touchLastAccessed,
  invalidateActiveTokensForInvoice,
} = require("../../repositories/invoicePaymentAccessTokens");
const { createSession, findValidSession } = require("../../repositories/invoicePaymentSessions");
const { createFinancialEvent } = require("./financialEventService");
const { createNotificationEvent } = require("../notifications/notificationService");
const { truncateName } = require("../../utils/nameFormatting");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

function buildPaymentLinkUrl(rawToken) {
  return `${frontendUrl()}/pagamento/fatura?token=${rawToken}`;
}

/**
 * Carrega tudo que é necessário para gerar um link (destinatário,
 * curso, valor, vencimento) a partir da invoice -- usado pelas 3 ações
 * administrativas de compartilhamento.
 */
async function loadInvoiceForSharing(runner, invoiceId) {
  const [rows] = await runner.query(
    `
      SELECT
        i.id AS invoice_id, i.status AS invoice_status, i.amount, i.due_date,
        fc.id AS contract_id, fc.contracting_party_name, fc.contracting_party_email,
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

  const OPEN_STATUSES = new Set(["pending", "processing", "overdue"]);

  if (!OPEN_STATUSES.has(rows[0].invoice_status)) {
    throw createServiceError(
      "Só é possível gerar um link de pagamento para uma fatura em aberto.",
      409
    );
  }

  return rows[0];
}

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateBr(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("pt-BR");
}

/**
 * Gera um novo link de pagamento (invalida qualquer anterior) e
 * devolve a URL bruta -- só nesta resposta, uma única vez. Chamada
 * tanto pela ação administrativa explícita "Copiar link" quanto
 * internamente por contractCreationService quando o contratante é
 * externo (ver services/financial/contractCreationService.js).
 */
async function generateInvoicePaymentLink(db, { invoiceId, actorUserId = null }) {
  const normalizedInvoiceId = Number(invoiceId);

  if (!Number.isInteger(normalizedInvoiceId) || normalizedInvoiceId <= 0) {
    throw createServiceError("O identificador da fatura é obrigatório e deve ser válido.", 400);
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const invoice = await loadInvoiceForSharing(connection, normalizedInvoiceId);

    const { rawToken, expiresAt } = await createAccessToken(connection, {
      invoiceId: normalizedInvoiceId,
      recipientName: invoice.contracting_party_name,
      recipientEmail: invoice.contracting_party_email,
      createdByUserId: actorUserId,
    });

    await createFinancialEvent(connection, {
      financialContractId: invoice.contract_id,
      invoiceId: normalizedInvoiceId,
      eventType: "invoice_payment_link_generated",
      source: actorUserId ? "admin" : "system",
      actorUserId,
    });

    await connection.commit();

    return { paymentLinkUrl: buildPaymentLinkUrl(rawToken), expiresAt, invoice };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function sendInvoicePaymentLinkByEmail(db, { invoiceId, actorUserId }) {
  const { paymentLinkUrl, expiresAt, invoice } = await generateInvoicePaymentLink(db, {
    invoiceId,
    actorUserId,
  });

  await db.promise().query(
    `
      INSERT INTO financial_events (financial_contract_id, invoice_id, event_type, source, actor_user_id)
      VALUES (?, ?, 'invoice_payment_link_sent', 'admin', ?)
    `,
    [invoice.contract_id, invoiceId, actorUserId]
  );

  await createNotificationEvent(db, {
    type: "financial.invoice.payment_link_shared",
    sourceType: "invoice",
    sourceId: Number(invoiceId),
    actorUserId,
    context: {
      invoiceId: Number(invoiceId),
      studentName: invoice.student_name,
      courseName: invoice.course_name,
      amount: formatCurrency(invoice.amount),
      dueDate: formatDateBr(invoice.due_date),
      paymentLinkUrl,
      linkToken: require("crypto").randomUUID(),
    },
    recipients: [{ external: true, email: invoice.contracting_party_email, name: invoice.contracting_party_name }],
    excludeActor: false,
  });

  return { message: "Link enviado por e-mail.", expiresAt };
}

/**
 * Monta a mensagem de WhatsApp localmente -- nenhuma integração real,
 * o texto é só devolvido para o frontend copiar. O link em si nunca é
 * persistido em texto puro além da própria linha de token (já
 * hasheada) -- este retorno é intencionalmente a única vez que ele
 * aparece em claro.
 */
async function buildWhatsAppMessage(db, { invoiceId, actorUserId }) {
  const { paymentLinkUrl, expiresAt, invoice } = await generateInvoicePaymentLink(db, {
    invoiceId,
    actorUserId,
  });

  await db.promise().query(
    `
      INSERT INTO financial_events (financial_contract_id, invoice_id, event_type, source, actor_user_id)
      VALUES (?, ?, 'invoice_payment_link_message_prepared', 'admin', ?)
    `,
    [invoice.contract_id, invoiceId, actorUserId]
  );

  const message = [
    `Olá, ${invoice.contracting_party_name}.`,
    "",
    `Segue o link para pagamento da cobrança referente ao curso ${invoice.course_name}`,
    `para ${invoice.student_name}:`,
    "",
    paymentLinkUrl,
    "",
    `Valor: R$ ${formatCurrency(invoice.amount)}`,
    `Vencimento: ${formatDateBr(invoice.due_date)}`,
    "",
    "Por segurança, não encaminhe este link a outras pessoas.",
  ].join("\n");

  return { message, paymentLinkUrl, expiresAt };
}

const ALLOWED_DELIVERY_METHODS = ["copy_link", "email", "whatsapp_message"];

/**
 * POST /api/admin/financial/invoices/:invoiceId/payment-link -- ponto
 * único que despacha para as 3 ações acima, mesmo padrão de
 * deliveryMethod usado em accountActivationService.createAccountActivationInvitation.
 */
async function shareInvoicePaymentLink(db, { invoiceId, deliveryMethod, actorUserId }) {
  if (!ALLOWED_DELIVERY_METHODS.includes(deliveryMethod)) {
    throw createServiceError(
      "Canal de entrega inválido. Utilize copy_link, email ou whatsapp_message.",
      400
    );
  }

  if (deliveryMethod === "email") {
    return sendInvoicePaymentLinkByEmail(db, { invoiceId, actorUserId });
  }

  if (deliveryMethod === "whatsapp_message") {
    return buildWhatsAppMessage(db, { invoiceId, actorUserId });
  }

  const { paymentLinkUrl, expiresAt } = await generateInvoicePaymentLink(db, {
    invoiceId,
    actorUserId,
  });

  return { paymentLinkUrl, expiresAt };
}

/**
 * POST /api/public/invoice-payment/session -- troca o token bruto
 * (enviado uma única vez, no corpo da requisição) por uma sessão
 * curta ligada a um cookie HTTP-only. Erro genérico sempre que o token
 * não é utilizável, sem revelar se ele não existe, já expirou ou já
 * foi invalidado -- mesmo princípio de findValidAccessToken.
 */
async function exchangeInvoicePaymentToken(db, rawToken) {
  if (!rawToken) {
    throw createServiceError("Link de pagamento inválido ou expirado.", 400);
  }

  const runner = db.promise();

  const token = await findValidAccessToken(runner, rawToken);

  if (!token) {
    throw createServiceError("Link de pagamento inválido ou expirado.", 400);
  }

  await touchLastAccessed(runner, token.id);

  const { rawSessionToken, expiresAt } = await createSession(runner, {
    accessTokenId: token.id,
    invoiceId: token.invoice_id,
  });

  return { rawSessionToken, expiresAt, invoiceId: token.invoice_id };
}

/**
 * GET /api/public/invoice-payment/me -- leitura mínima autorizada
 * apenas pela sessão (nunca por um invoiceId vindo do cliente). Nunca
 * inclui CPF, e-mail completo, IDs internos ou qualquer outra invoice
 * do mesmo contrato.
 */
async function getInvoicePaymentSessionSnapshot(db, invoiceId) {
  const [rows] = await db.promise().query(
    `
      SELECT
        i.status AS invoice_status, i.amount, i.due_date,
        s.name AS student_name,
        co.name AS course_name,
        fc.accepts_pix, fc.accepts_boleto, fc.accepts_credit_card
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
    throw createServiceError("Cobrança não encontrada.", 404);
  }

  const row = rows[0];

  return {
    studentDisplayName: truncateName(row.student_name),
    courseName: row.course_name,
    amount: Number(row.amount),
    dueDate: row.due_date,
    status: row.invoice_status,
    acceptedMethods: {
      pix: Boolean(row.accepts_pix),
      boleto: Boolean(row.accepts_boleto),
      creditCard: Boolean(row.accepts_credit_card),
    },
  };
}

/**
 * Chamada a partir de todo ponto do sistema que fecha uma invoice
 * (paga, cancelada ou reembolsada) -- bloqueia só a emissão de NOVOS
 * links/sessões a partir de agora; uma sessão já aberta continua
 * válida até seu próprio TTL curto (ver invoicePaymentSessions.js),
 * para que quem estiver no meio do pagamento sempre veja o resultado
 * real.
 */
async function invalidateAccessTokensForInvoice(connection, invoiceId) {
  await invalidateActiveTokensForInvoice(connection, invoiceId);
}

module.exports = {
  createServiceError,
  generateInvoicePaymentLink,
  sendInvoicePaymentLinkByEmail,
  buildWhatsAppMessage,
  shareInvoicePaymentLink,
  exchangeInvoicePaymentToken,
  getInvoicePaymentSessionSnapshot,
  invalidateAccessTokensForInvoice,
};
