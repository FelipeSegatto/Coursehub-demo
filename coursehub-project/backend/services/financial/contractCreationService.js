/**
 * Serviço central de criação de contrato administrativo:
 * aluno (existente ou novo, pendente de ativação) -> contratante
 * (self/existing/new) -> contrato "pending_payment" -> primeira
 * fatura (fatura de ativação). Nunca cria matrícula aqui -- a
 * matrícula só nasce em activateContractService.js, quando o
 * pagamento desta fatura é confirmado.
 *
 * Toda a escrita acontece em uma única transação; o e-mail de
 * cobrança só é agendado (outbox) DEPOIS do commit, nunca dentro dele
 * (nunca side effect externo dentro de uma transação de banco).
 */
const { createStudent } = require("../admin/adminStudentService");
const {
  createServiceError: createContractingPartyServiceError,
  findOrCreateSelfContractingPartyForStudent,
  linkStudentToContractingParty,
  createContractingPartyWithConnection,
} = require("./contractingPartyService");
const crypto = require("crypto");
const { createFinancialEvent } = require("./financialEventService");
const { createNotificationEvent } = require("../notifications/notificationService");
const {
  generateAndStoreContractTermsDocument,
} = require("./contractTermsDocumentService");
const {
  createAccessToken: createInvoicePaymentAccessToken,
} = require("../../repositories/invoicePaymentAccessTokens");
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../config/legalVersions");

const ALLOWED_CONTRACTING_PARTY_MODES = ["self", "existing", "new"];

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
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

async function resolveStudent(db, connection, { existingStudentId, newStudentData }) {
  if (existingStudentId) {
    const studentId = normalizeId(existingStudentId, "Aluno inválido.");

    const [rows] = await connection.query(
      `SELECT id, user_id, status FROM students WHERE id = ? LIMIT 1 FOR UPDATE`,
      [studentId]
    );

    if (rows.length === 0) {
      throw createServiceError("Aluno não encontrado.", 404);
    }

    if (rows[0].status === "cancelled") {
      throw createServiceError(
        "Este aluno está removido e não pode receber novos contratos.",
        409
      );
    }

    return { studentId, isNewStudent: false };
  }

  if (!newStudentData) {
    throw createServiceError("Informe um aluno existente ou os dados de um novo aluno.", 400);
  }

  const created = await createStudent(db, newStudentData, {
    connection,
    allowNullPassword: true,
  });

  return { studentId: created.id, isNewStudent: true };
}

async function resolveContractingParty(
  connection,
  { studentId, contractingPartyMode, contractingPartyId, contractingPartyData }
) {
  if (!ALLOWED_CONTRACTING_PARTY_MODES.includes(contractingPartyMode)) {
    throw createServiceError(
      "Modo de contratante inválido. Utilize self, existing ou new.",
      400
    );
  }

  if (contractingPartyMode === "self") {
    return findOrCreateSelfContractingPartyForStudent(connection, { studentId });
  }

  if (contractingPartyMode === "existing") {
    const partyId = normalizeId(contractingPartyId, "Contratante inválido.");

    const [rows] = await connection.query(
      `SELECT id, status FROM contracting_parties WHERE id = ? LIMIT 1`,
      [partyId]
    );

    if (rows.length === 0) {
      throw createContractingPartyServiceError("Contratante não encontrado.", 404);
    }

    if (rows[0].status !== "active") {
      throw createContractingPartyServiceError("Este contratante está inativo.", 409);
    }

    await linkStudentToContractingParty(connection, {
      studentId,
      contractingPartyId: partyId,
      relationshipType: contractingPartyData?.relationshipType || "other",
      isPrimary: true,
    });

    return partyId;
  }

  // 'new'
  const partyId = await createContractingPartyWithConnection(connection, contractingPartyData);

  await linkStudentToContractingParty(connection, {
    studentId,
    contractingPartyId: partyId,
    relationshipType: contractingPartyData?.relationshipType || "other",
    isPrimary: true,
  });

  return partyId;
}

async function assertNoIncompatibleExistingContract(connection, { studentId, courseId }) {
  const [contractRows] = await connection.query(
    `
      SELECT id, status FROM financial_contracts
      WHERE student_id = ? AND course_id = ? AND status <> 'cancelled'
      LIMIT 1
    `,
    [studentId, courseId]
  );

  if (contractRows.length > 0) {
    throw createServiceError(
      "Este aluno já possui um contrato ativo ou pendente para este curso.",
      409
    );
  }

  const [enrollmentRows] = await connection.query(
    `
      SELECT id, status
      FROM enrollments
      WHERE student_id = ? AND course_id = ?
        AND status NOT IN ('cancelled', 'withdrawn')
      LIMIT 1
    `,
    [studentId, courseId]
  );

  if (enrollmentRows.length > 0) {
    throw createServiceError(
      enrollmentRows[0].status === "completed"
        ? "Este aluno já concluiu este curso e não pode se rematricular."
        : "Este aluno já está matriculado neste curso.",
      409
    );
  }
}

async function loadValidatedPlan(connection, { courseId, pricingPlanId }) {
  const [planRows] = await connection.query(
    `
      SELECT id, course_id, billing_type, name, total_amount, monthly_payment_count,
             monthly_payment_amount, max_card_installments, accepts_pix,
             accepts_boleto, accepts_credit_card, status
      FROM course_pricing_plans
      WHERE id = ?
      LIMIT 1
    `,
    [pricingPlanId]
  );

  if (planRows.length === 0) {
    throw createServiceError("Plano de preço não encontrado.", 404);
  }

  const plan = planRows[0];

  if (Number(plan.course_id) !== courseId) {
    throw createServiceError(
      "O plano de preço selecionado não pertence ao curso informado.",
      409
    );
  }

  if (plan.status !== "active") {
    throw createServiceError("Este plano de preço não está ativo.", 409);
  }

  return plan;
}

/**
 * createStudentContractWithInitialInvoice
 *
 * payload:
 *   existingStudentId | newStudentData
 *   contractingPartyMode: 'self' | 'existing' | 'new'
 *   contractingPartyId (mode 'existing')
 *   contractingPartyData ({ relationshipType, ...party fields }, modes 'existing'/'new')
 *   courseId, pricingPlanId
 *   billingData: { dueDate, discountAmount?, discountReason?, notes? }
 *   origin: 'admin' | 'public_checkout' | 'authenticated_checkout' (defaults to 'admin')
 *   acceptance?: { acceptedByUserId, termsVersion, privacyVersion, acceptanceMethod, ipAddress, userAgent }
 *     -- opcional; só o wizard admin (origin 'admin') pode legitimamente
 *     omitir (não grava nenhuma linha em contract_acceptances). Todo
 *     checkout público/autenticado deve passar este bloco.
 *
 * createdByUserId é o admin autenticado quando origin='admin'
 * (obrigatório nesse caso, derivado pela ROTA a partir do token, nunca
 * do payload) ou, para as demais origens, o usuário autenticado que
 * iniciou a compra quando existir (aluno logado) -- pode ser null para
 * um checkout público totalmente anônimo.
 */
async function createStudentContractWithInitialInvoice(db, payload, createdByUserId, options = {}) {
  const {
    existingStudentId,
    newStudentData,
    contractingPartyMode,
    contractingPartyId,
    contractingPartyData,
    courseId,
    pricingPlanId,
    billingData = {},
    origin = "admin",
    acceptance,
  } = payload || {};

  if (!["admin", "public_checkout", "authenticated_checkout"].includes(origin)) {
    throw createServiceError("Origem do contrato inválida.", 400);
  }

  const actorUserId =
    origin === "admin"
      ? normalizeId(createdByUserId, "Administrador responsável é obrigatório.")
      : createdByUserId
        ? normalizeId(createdByUserId, "Usuário inválido.")
        : null;

  if (acceptance) {
    if (acceptance.termsVersion !== CURRENT_TERMS_VERSION || acceptance.privacyVersion !== CURRENT_PRIVACY_VERSION) {
      throw createServiceError(
        "Os Termos de Uso ou a Política de Privacidade foram atualizados. Recarregue a página e aceite novamente.",
        409
      );
    }

    if (!acceptance.acceptanceMethod) {
      throw createServiceError("Método de aceite do contrato é obrigatório.", 400);
    }
  }

  const normalizedCourseId = normalizeId(courseId, "Curso é obrigatório e deve ser válido.");
  const normalizedPricingPlanId = normalizeId(
    pricingPlanId,
    "Plano de preço é obrigatório e deve ser válido."
  );

  if (!billingData?.dueDate) {
    throw createServiceError("Data de vencimento da primeira cobrança é obrigatória.", 400);
  }

  // Aceita uma conexão de transação já aberta pelo chamador (ex.:
  // submitPublicCheckoutContract, que precisa que a checagem de
  // identidade + criação de aluno + criação de contrato aconteçam
  // atomicamente, para nunca deixar um aluno novo "órfão" sem
  // contrato se a criação do contrato falhar depois) -- mesmo padrão
  // já usado por createNotificationEvent (runner pode ser o pool ou
  // uma conexão existente). Quando `connection` é externa, esta
  // função NUNCA chama beginTransaction/commit/rollback/release --
  // quem abriu a transação é quem fecha.
  const ownsTransaction = !options.connection;
  const connection = options.connection || (await db.promise().getConnection());

  try {
    if (ownsTransaction) {
      await connection.beginTransaction();
    }

    const { studentId } = await resolveStudent(db, connection, {
      existingStudentId,
      newStudentData,
    });

    const resolvedContractingPartyId = await resolveContractingParty(connection, {
      studentId,
      contractingPartyMode,
      contractingPartyId,
      contractingPartyData,
    });

    const [courseRows] = await connection.query(`SELECT id, name FROM courses WHERE id = ? LIMIT 1`, [
      normalizedCourseId,
    ]);

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    const plan = await loadValidatedPlan(connection, {
      courseId: normalizedCourseId,
      pricingPlanId: normalizedPricingPlanId,
    });

    await assertNoIncompatibleExistingContract(connection, {
      studentId,
      courseId: normalizedCourseId,
    });

    const [partyRows] = await connection.query(
      `
        SELECT user_id, name, document_number, email, phone, billing_address_line,
               billing_address_city, billing_address_state, billing_address_zip_code
        FROM contracting_parties WHERE id = ? LIMIT 1
      `,
      [resolvedContractingPartyId]
    );

    const party = partyRows[0];

    const [contractResult] = await connection.query(
      `
        INSERT INTO financial_contracts
          (enrollment_id, student_id, course_id, contracting_party_id, created_by_user_id, origin,
           pricing_plan_id, billing_type, plan_name, total_amount, monthly_payment_count,
           monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
           accepts_credit_card, status, start_date, contracting_party_name,
           contracting_party_document, contracting_party_email, contracting_party_phone,
           contracting_party_address, created_at, updated_at)
        VALUES
          (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', CURDATE(),
           ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        studentId,
        normalizedCourseId,
        resolvedContractingPartyId,
        actorUserId,
        origin,
        plan.id,
        plan.billing_type,
        plan.name,
        plan.total_amount,
        plan.monthly_payment_count,
        plan.monthly_payment_amount,
        plan.max_card_installments,
        plan.accepts_pix,
        plan.accepts_boleto,
        plan.accepts_credit_card,
        party.name,
        party.document_number,
        party.email,
        party.phone,
        JSON.stringify({
          line: party.billing_address_line,
          city: party.billing_address_city,
          state: party.billing_address_state,
          zipCode: party.billing_address_zip_code,
        }),
      ]
    );

    const contractId = contractResult.insertId;

    if (acceptance) {
      await connection.query(
        `
          INSERT INTO contract_acceptances
            (financial_contract_id, accepted_by_user_id, contracting_party_id,
             accepted_name_snapshot, accepted_document_snapshot, accepted_email_snapshot,
             terms_version, privacy_version, acceptance_method, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          contractId,
          acceptance.acceptedByUserId || null,
          resolvedContractingPartyId,
          party.name,
          party.document_number,
          party.email,
          acceptance.termsVersion,
          acceptance.privacyVersion,
          acceptance.acceptanceMethod,
          acceptance.ipAddress || null,
          acceptance.userAgent || null,
        ]
      );

      await createFinancialEvent(connection, {
        financialContractId: contractId,
        eventType: "contract_acceptance_recorded",
        source: origin === "admin" ? "admin" : "student",
        actorUserId,
        newValue: { acceptanceMethod: acceptance.acceptanceMethod },
      });
    }

    const isMonthly = plan.billing_type === "monthly_plan";
    const firstAmount = isMonthly ? Number(plan.monthly_payment_amount) : Number(plan.total_amount);

    const discountAmount = Number(billingData.discountAmount || 0);

    if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount >= firstAmount) {
      throw createServiceError("Desconto inválido para a primeira cobrança.", 400);
    }

    const finalAmount = Math.round((firstAmount - discountAmount) * 100) / 100;

    const description =
      billingData.notes?.trim() ||
      `${plan.name} — ${isMonthly ? "Parcela 1" : "Pagamento único"}`;

    const [invoiceResult] = await connection.query(
      `
        INSERT INTO invoices
          (financial_contract_id, invoice_type, installment_number, installment_count,
           description, original_amount, amount, discount_amount, discount_reason,
           discount_applied_at, discount_applied_by_user_id, due_date, status,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())
      `,
      [
        contractId,
        isMonthly ? "monthly_payment" : "full_payment",
        isMonthly ? 1 : null,
        isMonthly ? plan.monthly_payment_count : null,
        description,
        firstAmount,
        finalAmount,
        discountAmount,
        discountAmount ? billingData.discountReason?.trim() || null : null,
        discountAmount ? new Date() : null,
        discountAmount ? actorUserId : null,
        billingData.dueDate,
      ]
    );

    const invoiceId = invoiceResult.insertId;

    await connection.query(
      `UPDATE financial_contracts SET activation_invoice_id = ? WHERE id = ?`,
      [invoiceId, contractId]
    );

    const eventSource = origin === "admin" ? "admin" : "student";

    await createFinancialEvent(connection, {
      financialContractId: contractId,
      eventType: "contract_created",
      source: eventSource,
      actorUserId,
      newValue: {
        studentId,
        courseId: normalizedCourseId,
        contractingPartyId: resolvedContractingPartyId,
        origin,
      },
    });

    await createFinancialEvent(connection, {
      financialContractId: contractId,
      invoiceId,
      eventType: "initial_invoice_created",
      source: eventSource,
      actorUserId,
      newValue: { amount: finalAmount, dueDate: billingData.dueDate },
    });

    const [studentSnapshotRows] = await connection.query(
      `SELECT name, cpf FROM students WHERE id = ? LIMIT 1`,
      [studentId]
    );

    await generateAndStoreContractTermsDocument(connection, {
      contract: {
        id: contractId,
        planName: plan.name,
        billingType: plan.billing_type,
        totalAmount: plan.total_amount,
        monthlyPaymentCount: plan.monthly_payment_count,
        monthlyPaymentAmount: plan.monthly_payment_amount,
        createdAt: new Date(),
      },
      course: { name: courseRows[0].name },
      contractingParty: {
        name: party.name,
        document: party.document_number,
        email: party.email,
        phone: party.phone,
        address: {
          line: party.billing_address_line,
          city: party.billing_address_city,
          state: party.billing_address_state,
          zipCode: party.billing_address_zip_code,
        },
      },
      student: {
        name: studentSnapshotRows[0]?.name,
        document: studentSnapshotRows[0]?.cpf,
      },
      firstInvoice: {
        amount: finalAmount,
        dueDate: billingData.dueDate,
        description,
      },
    });

    // Um contratante sem conta CourseHub (party.user_id nulo) não
    // consegue acessar /aluno/financeiro -- gera, ainda dentro desta
    // transação, o token do link privado de pagamento
    // (/pagamento/fatura?token=...) que a notificação abaixo vai usar
    // no lugar daquele caminho autenticado. O token bruto só existe
    // em memória aqui e no e-mail que o outbox entrega -- nunca é
    // logado nem gravado em financial_events (ver
    // invoicePaymentAccessTokens.js e
    // notificationTypeRegistry.js#sensitiveActionPath).
    let externalPaymentToken = null;

    if (!party.user_id) {
      const { rawToken } = await createInvoicePaymentAccessToken(connection, {
        invoiceId,
        recipientName: party.name,
        recipientEmail: party.email,
      });

      externalPaymentToken = rawToken;
    }

    if (ownsTransaction) {
      await connection.commit();

      await dispatchContractBillingNotification(db, {
        contractId,
        invoiceId,
        studentId,
        courseName: courseRows[0].name,
        planName: plan.name,
        amount: finalAmount,
        dueDate: billingData.dueDate,
        party,
        externalPaymentToken,
        actorUserId,
      });
    }

    return {
      contractId,
      invoiceId,
      studentId,
      contractingPartyId: resolvedContractingPartyId,
      status: "pending_payment",
      // Só preenchido quando a transação é externa (o chamador
      // precisa disso para disparar a notificação DEPOIS do próprio
      // commit dele, nunca antes) -- ver
      // dispatchContractBillingNotification (exportada) abaixo.
      pendingBillingNotification: ownsTransaction
        ? null
        : {
            contractId,
            invoiceId,
            studentId,
            courseName: courseRows[0].name,
            planName: plan.name,
            amount: finalAmount,
            dueDate: billingData.dueDate,
            party,
            externalPaymentToken,
            actorUserId,
          },
    };
  } catch (error) {
    if (ownsTransaction) {
      await connection.rollback();
    }

    throw error;
  } finally {
    if (ownsTransaction) {
      connection.release();
    }
  }
}

/**
 * Extraído do fluxo principal para poder ser chamado tanto logo após
 * o commit desta própria função (caso normal, transação própria)
 * quanto pelo chamador de uma transação externa (submitPublicCheckoutContract),
 * DEPOIS que o commit dele mesmo for bem-sucedido -- uma notificação
 * nunca pode ser agendada antes de a escrita que ela anuncia estar
 * de fato durável.
 */
async function dispatchContractBillingNotification(
  db,
  { contractId, invoiceId, studentId, courseName, planName, amount, dueDate, party, externalPaymentToken, actorUserId }
) {
  const [studentUserRows] = await db
    .promise()
    .query(`SELECT name FROM students WHERE id = ? LIMIT 1`, [studentId]);

  const studentName = studentUserRows[0]?.name || "";

  // The contracting party itself has a user_id only when it is
  // linked to a real CourseHub account (always true for 'self'
  // mode; possible but not required for 'existing'/'new' third
  // parties) -- that is what decides internal vs external delivery,
  // not the student's own account.
  const recipient = party.user_id
    ? { userId: party.user_id, email: party.email, name: party.name, role: "student" }
    : { external: true, email: party.email, name: party.name };

  try {
    await createNotificationEvent(db, {
      type: "financial.contract.billing_created",
      sourceType: "financial_contract",
      sourceId: contractId,
      actorUserId,
      context: {
        contractId,
        invoiceId,
        studentName,
        courseName,
        planName,
        amount: formatCurrency(amount),
        dueDate: formatDateBr(dueDate),
        externalPaymentPath: externalPaymentToken
          ? `/pagamento/fatura?token=${externalPaymentToken}`
          : undefined,
      },
      recipients: [recipient],
      excludeActor: false,
    });
  } catch (notificationError) {
    console.error(
      "[contractCreationService] falha ao agendar e-mail de cobrança:",
      notificationError
    );
  }
}

/**
 * Reenvia o e-mail de cobrança da fatura de ativação de um contrato
 * já existente -- mesmo tipo de notificação usado na criação, nunca
 * uma cópia separada. Só faz sentido para um contrato ainda
 * pending_payment com uma fatura de ativação em aberto.
 */
async function resendContractBilling(db, contractId, actorUserId) {
  const normalizedContractId = normalizeId(contractId, "ID do contrato inválido.");

  const [rows] = await db.promise().query(
    `
      SELECT
        fc.id AS contract_id, fc.status, fc.plan_name, fc.activation_invoice_id,
        fc.contracting_party_id,
        s.name AS student_name,
        co.name AS course_name,
        cp.user_id AS contracting_party_user_id, cp.name AS contracting_party_name,
        cp.email AS contracting_party_email,
        i.id AS invoice_id, i.amount, i.due_date
      FROM financial_contracts fc
      INNER JOIN students s ON s.id = fc.student_id
      INNER JOIN courses co ON co.id = fc.course_id
      INNER JOIN contracting_parties cp ON cp.id = fc.contracting_party_id
      LEFT JOIN invoices i ON i.id = fc.activation_invoice_id
      WHERE fc.id = ?
      LIMIT 1
    `,
    [normalizedContractId]
  );

  if (rows.length === 0) {
    throw createServiceError("Contrato não encontrado.", 404);
  }

  const contract = rows[0];

  if (contract.status !== "pending_payment") {
    throw createServiceError(
      "Só é possível reenviar a cobrança de um contrato aguardando pagamento.",
      409
    );
  }

  if (!contract.invoice_id) {
    throw createServiceError("Este contrato não possui uma fatura de ativação em aberto.", 409);
  }

  const recipient = contract.contracting_party_user_id
    ? {
        userId: contract.contracting_party_user_id,
        email: contract.contracting_party_email,
        name: contract.contracting_party_name,
        role: "student",
      }
    : { external: true, email: contract.contracting_party_email, name: contract.contracting_party_name };

  // Mesma correção de financialContractBillingCreated.js: um
  // contratante externo reenviado precisa de um link privado de
  // pagamento novo (createAccessToken já invalida qualquer token
  // anterior da mesma invoice). Roda direto no pool, não numa
  // transação, já que esta função não abre uma.
  let externalPaymentToken = null;

  if (!contract.contracting_party_user_id) {
    const { rawToken } = await createInvoicePaymentAccessToken(db.promise(), {
      invoiceId: contract.invoice_id,
      recipientName: contract.contracting_party_name,
      recipientEmail: contract.contracting_party_email,
    });

    externalPaymentToken = rawToken;
  }

  await createNotificationEvent(db, {
    type: "financial.contract.billing_created",
    sourceType: "financial_contract",
    sourceId: normalizedContractId,
    actorUserId,
    context: {
      contractId: normalizedContractId,
      invoiceId: contract.invoice_id,
      studentName: contract.student_name,
      courseName: contract.course_name,
      planName: contract.plan_name,
      amount: formatCurrency(contract.amount),
      dueDate: formatDateBr(contract.due_date),
      resendToken: crypto.randomUUID(),
      externalPaymentPath: externalPaymentToken
        ? `/pagamento/fatura?token=${externalPaymentToken}`
        : undefined,
    },
    recipients: [recipient],
    excludeActor: false,
  });

  return { message: "Cobrança reenviada com sucesso." };
}

module.exports = {
  createServiceError,
  createStudentContractWithInitialInvoice,
  resendContractBilling,
  loadValidatedPlan,
  dispatchContractBillingNotification,
};
