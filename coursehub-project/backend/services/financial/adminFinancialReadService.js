/**
 * Cria um erro de negócio com status HTTP.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Converte um valor em número inteiro positivo.
 */
function normalizePositiveInteger(value, fallback = null) {
  const normalizedValue = Number(value);

  if (
    !Number.isInteger(normalizedValue) ||
    normalizedValue <= 0
  ) {
    return fallback;
  }

  return normalizedValue;
}

/**
 * Normaliza valores monetários retornados pelo MySQL.
 */
function normalizeMoney(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

/**
 * Converte JSON retornado pelo banco.
 */
function parseJsonValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}



/**
 * Lista contratos financeiros com filtros,
 * resumo financeiro e paginação.
 */
async function listFinancialContracts(
  db,
  {
    page = 1,
    limit = 20,
    status,
    billingType,
    enrollmentId,
    search,
  } = {}
) {
  if (!db) {
    throw createServiceError(
      "A conexão com o banco de dados não foi fornecida.",
      500
    );
  }

  const normalizedPage =
    normalizePositiveInteger(page, 1);

  const normalizedLimit = Math.min(
    normalizePositiveInteger(limit, 20),
    100
  );

  const offset =
    (normalizedPage - 1) * normalizedLimit;

  const allowedStatuses = [
    "pending_payment",
    "active",
    "completed",
    "cancelled",
    "overdue",
  ];

  const allowedBillingTypes = [
    "one_time",
    "installments",
    "monthly_plan",
  ];

  if (
    status &&
    !allowedStatuses.includes(status)
  ) {
    throw createServiceError(
      "O status informado para o contrato financeiro é inválido.",
      400
    );
  }

  if (
    billingType &&
    !allowedBillingTypes.includes(billingType)
  ) {
    throw createServiceError(
      "O tipo de cobrança informado é inválido.",
      400
    );
  }

  const normalizedEnrollmentId = enrollmentId
    ? normalizePositiveInteger(enrollmentId)
    : null;

  if (
    enrollmentId &&
    !normalizedEnrollmentId
  ) {
    throw createServiceError(
      "O identificador da matrícula deve ser válido.",
      400
    );
  }

  const whereConditions = [];
  const queryParameters = [];

  if (status) {
    whereConditions.push("fc.status = ?");
    queryParameters.push(status);
  }

  if (billingType) {
    whereConditions.push(
      "fc.billing_type = ?"
    );
    queryParameters.push(billingType);
  }

  if (normalizedEnrollmentId) {
    whereConditions.push(
      "fc.enrollment_id = ?"
    );
    queryParameters.push(
      normalizedEnrollmentId
    );
  }

  const normalizedSearch =
    typeof search === "string"
      ? search.trim()
      : "";

  if (normalizedSearch) {
    const searchPattern =
      `%${normalizedSearch}%`;

    whereConditions.push(`
      (
        fc.plan_name LIKE ?
        OR CAST(fc.id AS CHAR) LIKE ?
        OR CAST(fc.enrollment_id AS CHAR) LIKE ?
        OR s.name LIKE ?
        OR s.cpf LIKE ?
        OR cp.name LIKE ?
        OR cp.document_number LIKE ?
      )
    `);

    queryParameters.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern
    );
  }

  const whereClause =
    whereConditions.length > 0
      ? `WHERE ${whereConditions.join(
          " AND "
        )}`
      : "";

  const connection =
    await db.promise().getConnection();

  try {
    const [countRows] =
      await connection.execute(
        `
          SELECT
            COUNT(*) AS total
          FROM financial_contracts fc
          LEFT JOIN students s ON s.id = fc.student_id
          LEFT JOIN contracting_parties cp ON cp.id = fc.contracting_party_id
          ${whereClause}
        `,
        queryParameters
      );

    const total = Number(
      countRows[0]?.total || 0
    );

    const [contracts] =
      await connection.execute(
        `
          SELECT
            fc.id,
            fc.enrollment_id,
            fc.student_id,
            fc.course_id,
            fc.contracting_party_id,
            fc.origin,
            s.name AS student_name,
            co.name AS course_name,
            cp.name AS contracting_party_name,
            fc.pricing_plan_id,
            fc.billing_type,
            fc.plan_name,
            fc.total_amount,
            fc.monthly_payment_count,
            fc.monthly_payment_amount,
            fc.status,
            fc.start_date,
            fc.completed_at,
            fc.cancelled_at,
            fc.created_at,
            fc.updated_at,

            COUNT(i.id) AS invoice_count,

            COALESCE(
              SUM(
                CASE
                  WHEN i.status = 'paid'
                  THEN i.amount
                  ELSE 0
                END
              ),
              0
            ) AS paid_amount,

            COALESCE(
              SUM(
                CASE
                  WHEN i.status IN (
                    'pending',
                    'processing'
                  )
                  THEN i.amount
                  ELSE 0
                END
              ),
              0
            ) AS pending_amount,

            COALESCE(
              SUM(
                CASE
                  WHEN i.status = 'overdue'
                  THEN i.amount
                  ELSE 0
                END
              ),
              0
            ) AS overdue_amount,

            COALESCE(
              SUM(
                CASE
                  WHEN i.status = 'refunded'
                  THEN i.amount
                  ELSE 0
                END
              ),
              0
            ) AS refunded_amount,

            COALESCE(
              SUM(
                CASE
                  WHEN i.status = 'overdue'
                  THEN 1
                  ELSE 0
                END
              ),
              0
            ) AS overdue_invoice_count,

            MIN(
              CASE
                WHEN i.status IN (
                  'pending',
                  'processing',
                  'overdue'
                )
                THEN i.due_date
                ELSE NULL
              END
            ) AS next_due_date

          FROM financial_contracts fc

          LEFT JOIN invoices i
            ON i.financial_contract_id = fc.id
          LEFT JOIN students s ON s.id = fc.student_id
          LEFT JOIN courses co ON co.id = fc.course_id
          LEFT JOIN contracting_parties cp ON cp.id = fc.contracting_party_id

          ${whereClause}

          GROUP BY
            fc.id,
            fc.enrollment_id,
            fc.student_id,
            fc.course_id,
            fc.contracting_party_id,
            fc.origin,
            s.name,
            co.name,
            cp.name,
            fc.pricing_plan_id,
            fc.billing_type,
            fc.plan_name,
            fc.total_amount,
            fc.monthly_payment_count,
            fc.monthly_payment_amount,
            fc.status,
            fc.start_date,
            fc.completed_at,
            fc.cancelled_at,
            fc.created_at,
            fc.updated_at

          ORDER BY
            CASE
              WHEN fc.status = 'overdue'
              THEN 0
              ELSE 1
            END,
            fc.updated_at DESC,
            fc.id DESC

          LIMIT ${normalizedLimit}
          OFFSET ${offset}
        `,
        queryParameters
      );

    return {
      contracts: contracts.map(
        (contract) => ({
          id: contract.id,

          enrollmentId:
            contract.enrollment_id,

          student: contract.student_id
            ? { id: contract.student_id, name: contract.student_name }
            : null,

          course: contract.course_id
            ? { id: contract.course_id, name: contract.course_name }
            : null,

          contractingParty: contract.contracting_party_id
            ? { id: contract.contracting_party_id, name: contract.contracting_party_name }
            : null,

          origin: contract.origin,

          pricingPlanId:
            contract.pricing_plan_id,

          billingType:
            contract.billing_type,

          planName:
            contract.plan_name,

          totalAmount: normalizeMoney(
            contract.total_amount
          ),

          monthlyPaymentCount:
            contract.monthly_payment_count,

          monthlyPaymentAmount:
            contract.monthly_payment_amount ===
            null
              ? null
              : normalizeMoney(
                  contract.monthly_payment_amount
                ),

          status:
            contract.status,

          startDate:
            contract.start_date,

          completedAt:
            contract.completed_at,

          cancelledAt:
            contract.cancelled_at,

          invoiceCount: Number(
            contract.invoice_count || 0
          ),

          paidAmount: normalizeMoney(
            contract.paid_amount
          ),

          pendingAmount: normalizeMoney(
            contract.pending_amount
          ),

          overdueAmount: normalizeMoney(
            contract.overdue_amount
          ),

          refundedAmount: normalizeMoney(
            contract.refunded_amount
          ),

          overdueInvoiceCount: Number(
            contract.overdue_invoice_count ||
              0
          ),

          nextDueDate:
            contract.next_due_date,

          createdAt:
            contract.created_at,

          updatedAt:
            contract.updated_at,
        })
      ),

      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,

        totalPages:
          total === 0
            ? 0
            : Math.ceil(
                total / normalizedLimit
              ),
      },

      filters: {
        status:
          status || null,

        billingType:
          billingType || null,

        enrollmentId:
          normalizedEnrollmentId,

        search:
          normalizedSearch || null,
      },
    };
  } finally {
    connection.release();
  }
}

/**
 * Retorna os detalhes completos de um contrato,
 * suas faturas, pagamentos e eventos.
 */
async function getFinancialContractDetails(
  db,
  contractId
) {
  if (!db) {
    throw createServiceError(
      "A conexão com o banco de dados não foi fornecida.",
      500
    );
  }

  const normalizedContractId =
    normalizePositiveInteger(contractId);

  if (!normalizedContractId) {
    throw createServiceError(
      "O identificador do contrato financeiro é obrigatório e deve ser válido.",
      400
    );
  }

  const connection =
    await db.promise().getConnection();

  try {
    const [contracts] =
      await connection.execute(
        `
          SELECT
            fc.id,
            fc.enrollment_id,
            fc.student_id,
            fc.course_id,
            fc.contracting_party_id,
            fc.created_by_user_id,
            fc.origin,
            fc.activation_invoice_id,
            fc.activated_at,
            fc.contracting_party_name,
            fc.contracting_party_document,
            fc.contracting_party_email,
            fc.contracting_party_phone,
            fc.contracting_party_address,
            fc.pricing_plan_id,
            fc.billing_type,
            fc.plan_name,
            fc.total_amount,
            fc.monthly_payment_count,
            fc.monthly_payment_amount,
            fc.status,
            fc.start_date,
            fc.completed_at,
            fc.cancelled_at,
            fc.cancellation_reason,
            fc.created_at,
            fc.updated_at,
            s.name AS student_name,
            s.registration_number AS student_registration_number,
            s.user_id AS student_user_id,
            u.status AS student_account_status,
            co.name AS course_name,
            cp.name AS contracting_party_current_name,
            cp.email AS contracting_party_current_email
          FROM financial_contracts fc
          LEFT JOIN students s ON s.id = fc.student_id
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN courses co ON co.id = fc.course_id
          LEFT JOIN contracting_parties cp ON cp.id = fc.contracting_party_id
          WHERE fc.id = ?
          LIMIT 1
        `,
        [normalizedContractId]
      );

    if (contracts.length === 0) {
      throw createServiceError(
        "Contrato financeiro não encontrado.",
        404
      );
    }

    const contract = contracts[0];

    const [invoices] =
      await connection.execute(
        `
          SELECT
            id,
            financial_contract_id,
            invoice_type,
            installment_number,
            installment_count,
            description,
            original_amount,
            amount,
            discount_amount,
            discount_reason,
            discount_applied_at,
            discount_applied_by_user_id,
            due_date,
            status,
            paid_at,
            cancelled_at,
            created_at,
            updated_at
          FROM invoices
          WHERE financial_contract_id = ?
          ORDER BY
            due_date ASC,
            installment_number ASC,
            id ASC
        `,
        [normalizedContractId]
      );

    const [payments] =
      await connection.execute(
        `
          SELECT
            p.id,
            p.invoice_id,
            p.gateway,
            p.gateway_payment_id,
            p.source,
            p.recorded_by_user_id,
            p.admin_note,
            p.payment_method,
            p.amount,
            p.status,
            p.paid_at,
            p.refunded_at,
            p.refund_reason,
            p.refunded_by_user_id,
            p.created_at,
            p.updated_at
          FROM payments p
          INNER JOIN invoices i
            ON i.id = p.invoice_id
          WHERE i.financial_contract_id = ?
          ORDER BY
            p.created_at DESC,
            p.id DESC
        `,
        [normalizedContractId]
      );

    const [events] =
      await connection.execute(
        `
          SELECT
            id,
            financial_contract_id,
            invoice_id,
            payment_id,
            enrollment_id,
            event_type,
            source,
            actor_user_id,
            previous_value,
            new_value,
            reason,
            created_at
          FROM financial_events
          WHERE financial_contract_id = ?
          ORDER BY
            created_at DESC,
            id DESC
        `,
        [normalizedContractId]
      );

    const summary = invoices.reduce(
      (accumulator, invoice) => {
        const amount = normalizeMoney(
          invoice.amount
        );

        accumulator.invoiceCount += 1;

        if (invoice.status === "paid") {
          accumulator.paidAmount += amount;
        }

        if (
          invoice.status === "pending" ||
          invoice.status === "processing"
        ) {
          accumulator.pendingAmount +=
            amount;
        }

        if (
          invoice.status === "overdue"
        ) {
          accumulator.overdueAmount +=
            amount;
          accumulator.overdueInvoiceCount += 1;
        }

        if (
          invoice.status === "refunded"
        ) {
          accumulator.refundedAmount +=
            amount;
        }

        if (
          invoice.status === "cancelled"
        ) {
          accumulator.cancelledAmount +=
            amount;
        }

        return accumulator;
      },
      {
        contractTotalAmount:
          normalizeMoney(
            contract.total_amount
          ),
        invoiceCount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0,
        refundedAmount: 0,
        cancelledAmount: 0,
        overdueInvoiceCount: 0,
      }
    );

    summary.openAmount =
      summary.pendingAmount +
      summary.overdueAmount;

    return {
      contract: {
        id: contract.id,
        enrollmentId:
          contract.enrollment_id,
        student: contract.student_id
          ? {
              id: contract.student_id,
              name: contract.student_name,
              registrationNumber: contract.student_registration_number,
              userId: contract.student_user_id,
              accountStatus: contract.student_account_status,
            }
          : null,
        course: contract.course_id
          ? { id: contract.course_id, name: contract.course_name }
          : null,
        contractingParty: contract.contracting_party_id
          ? {
              id: contract.contracting_party_id,
              currentName: contract.contracting_party_current_name,
              currentEmail: contract.contracting_party_current_email,
            }
          : null,
        contractingPartySnapshot: {
          name: contract.contracting_party_name,
          document: contract.contracting_party_document,
          email: contract.contracting_party_email,
          phone: contract.contracting_party_phone,
          address: parseJsonValue(contract.contracting_party_address),
        },
        createdByUserId: contract.created_by_user_id,
        origin: contract.origin,
        activationInvoiceId: contract.activation_invoice_id,
        activatedAt: contract.activated_at,
        pricingPlanId:
          contract.pricing_plan_id,
        billingType:
          contract.billing_type,
        planName: contract.plan_name,
        totalAmount: normalizeMoney(
          contract.total_amount
        ),
        monthlyPaymentCount:
          contract.monthly_payment_count,
        monthlyPaymentAmount:
          contract.monthly_payment_amount ===
          null
            ? null
            : normalizeMoney(
                contract.monthly_payment_amount
              ),
        status: contract.status,
        startDate: contract.start_date,
        completedAt:
          contract.completed_at,
        cancelledAt:
          contract.cancelled_at,
        cancellationReason:
          contract.cancellation_reason,
        createdAt: contract.created_at,
        updatedAt: contract.updated_at,
      },

      summary,

      invoices: invoices.map(
        (invoice) => ({
          id: invoice.id,
          financialContractId:
            invoice.financial_contract_id,
          invoiceType:
            invoice.invoice_type,
          installmentNumber:
            invoice.installment_number,
          installmentCount:
            invoice.installment_count,
          description:
            invoice.description,
          originalAmount:
            invoice.original_amount === null
              ? null
              : normalizeMoney(
                  invoice.original_amount
                ),
          amount: normalizeMoney(
            invoice.amount
          ),
          discountAmount:
            normalizeMoney(
              invoice.discount_amount
            ),
          discountReason:
            invoice.discount_reason,
          discountAppliedAt:
            invoice.discount_applied_at,
          discountAppliedByUserId:
            invoice.discount_applied_by_user_id,
          dueDate: invoice.due_date,
          status: invoice.status,
          paidAt: invoice.paid_at,
          cancelledAt:
            invoice.cancelled_at,
          createdAt: invoice.created_at,
          updatedAt: invoice.updated_at,
        })
      ),

      payments: payments.map(
        (payment) => ({
          id: payment.id,
          invoiceId:
            payment.invoice_id,
          gateway: payment.gateway,
          gatewayPaymentId:
            payment.gateway_payment_id,
          source: payment.source,
          recordedByUserId:
            payment.recorded_by_user_id,
          adminNote:
            payment.admin_note,
          paymentMethod:
            payment.payment_method,
          amount: normalizeMoney(
            payment.amount
          ),
          status: payment.status,
          paidAt: payment.paid_at,
          refundedAt:
            payment.refunded_at,
          refundReason:
            payment.refund_reason,
          refundedByUserId:
            payment.refunded_by_user_id,
          createdAt:
            payment.created_at,
          updatedAt:
            payment.updated_at,
        })
      ),

      events: events.map((event) => ({
        id: event.id,
        financialContractId:
          event.financial_contract_id,
        invoiceId: event.invoice_id,
        paymentId: event.payment_id,
        enrollmentId:
          event.enrollment_id,
        eventType: event.event_type,
        source: event.source,
        actorUserId:
          event.actor_user_id,
        previousValue: parseJsonValue(
          event.previous_value
        ),
        newValue: parseJsonValue(
          event.new_value
        ),
        reason: event.reason,
        createdAt: event.created_at,
      })),
    };
  } finally {
    connection.release();
  }
}


/**
 * Lista faturas financeiras com filtros e paginação.
 */
async function listFinancialInvoices(
  db,
  {
    page = 1,
    limit = 20,
    status,
    contractId,
    dueFrom,
    dueTo,
    search,
  } = {}
) {
  if (!db) {
    throw createServiceError(
      "A conexão com o banco de dados não foi fornecida.",
      500
    );
  }

  const normalizedPage =
    normalizePositiveInteger(page, 1);

  const normalizedLimit = Math.min(
    normalizePositiveInteger(limit, 20),
    100
  );

  const offset =
    (normalizedPage - 1) * normalizedLimit;

  const allowedStatuses = [
    "pending",
    "processing",
    "paid",
    "overdue",
    "cancelled",
    "refunded",
  ];

  if (
    status &&
    !allowedStatuses.includes(status)
  ) {
    throw createServiceError(
      "O status informado para a fatura é inválido.",
      400
    );
  }

  const normalizedContractId = contractId
    ? normalizePositiveInteger(contractId)
    : null;

  if (
    contractId &&
    !normalizedContractId
  ) {
    throw createServiceError(
      "O identificador do contrato financeiro deve ser válido.",
      400
    );
  }

  const datePattern =
    /^\d{4}-\d{2}-\d{2}$/;

  if (
    dueFrom &&
    !datePattern.test(dueFrom)
  ) {
    throw createServiceError(
      "A data inicial deve estar no formato YYYY-MM-DD.",
      400
    );
  }

  if (
    dueTo &&
    !datePattern.test(dueTo)
  ) {
    throw createServiceError(
      "A data final deve estar no formato YYYY-MM-DD.",
      400
    );
  }

  if (
    dueFrom &&
    dueTo &&
    dueFrom > dueTo
  ) {
    throw createServiceError(
      "A data inicial não pode ser posterior à data final.",
      400
    );
  }

  const whereConditions = [];
  const queryParameters = [];

  if (status) {
    whereConditions.push(
      "i.status = ?"
    );
    queryParameters.push(status);
  }

  if (normalizedContractId) {
    whereConditions.push(
      "i.financial_contract_id = ?"
    );
    queryParameters.push(
      normalizedContractId
    );
  }

  if (dueFrom) {
    whereConditions.push(
      "DATE(i.due_date) >= ?"
    );
    queryParameters.push(dueFrom);
  }

  if (dueTo) {
    whereConditions.push(
      "DATE(i.due_date) <= ?"
    );
    queryParameters.push(dueTo);
  }

  const normalizedSearch =
    typeof search === "string"
      ? search.trim()
      : "";

  if (normalizedSearch) {
    const searchPattern =
      `%${normalizedSearch}%`;

    whereConditions.push(`
      (
        i.description LIKE ?
        OR fc.plan_name LIKE ?
        OR CAST(i.id AS CHAR) LIKE ?
        OR CAST(i.financial_contract_id AS CHAR) LIKE ?
        OR CAST(fc.enrollment_id AS CHAR) LIKE ?
      )
    `);

    queryParameters.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern
    );
  }

  const whereClause =
    whereConditions.length > 0
      ? `WHERE ${whereConditions.join(
          " AND "
        )}`
      : "";

  const connection =
    await db.promise().getConnection();

  try {
    const [countRows] =
      await connection.execute(
        `
          SELECT
            COUNT(*) AS total
          FROM invoices i

          INNER JOIN financial_contracts fc
            ON fc.id = i.financial_contract_id

          ${whereClause}
        `,
        queryParameters
      );

    const total = Number(
      countRows[0]?.total || 0
    );

    const [invoices] =
      await connection.execute(
        `
          SELECT
            i.id,
            i.financial_contract_id,
            i.invoice_type,
            i.installment_number,
            i.installment_count,
            i.description,
            i.original_amount,
            i.amount,
            i.discount_amount,
            i.discount_reason,
            i.due_date,
            i.status,
            i.paid_at,
            i.cancelled_at,
            i.created_at,
            i.updated_at,

            fc.enrollment_id,
            fc.billing_type,
            fc.plan_name,
            fc.status AS contract_status,
            s.name AS student_name,

            COUNT(p.id) AS payment_count,

            COALESCE(
              SUM(
                CASE
                  WHEN p.status = 'approved'
                  THEN p.amount
                  ELSE 0
                END
              ),
              0
            ) AS approved_payment_amount

          FROM invoices i

          INNER JOIN financial_contracts fc
            ON fc.id = i.financial_contract_id

          LEFT JOIN students s
            ON s.id = fc.student_id

          LEFT JOIN payments p
            ON p.invoice_id = i.id

          ${whereClause}

          GROUP BY
            i.id,
            i.financial_contract_id,
            i.invoice_type,
            i.installment_number,
            i.installment_count,
            i.description,
            i.original_amount,
            i.amount,
            i.discount_amount,
            i.discount_reason,
            i.due_date,
            i.status,
            i.paid_at,
            i.cancelled_at,
            i.created_at,
            i.updated_at,
            fc.enrollment_id,
            fc.billing_type,
            fc.plan_name,
            fc.status,
            s.name

          ORDER BY
            CASE
              WHEN i.status = 'overdue'
              THEN 0

              WHEN i.status = 'pending'
              THEN 1

              WHEN i.status = 'processing'
              THEN 2

              ELSE 3
            END,
            i.due_date ASC,
            i.id DESC

          LIMIT ${normalizedLimit}
          OFFSET ${offset}
        `,
        queryParameters
      );

    return {
      invoices: invoices.map(
        (invoice) => ({
          id:
            invoice.id,

          financialContractId:
            invoice.financial_contract_id,

          enrollmentId:
            invoice.enrollment_id,

          invoiceType:
            invoice.invoice_type,

          installmentNumber:
            invoice.installment_number,

          installmentCount:
            invoice.installment_count,

          description:
            invoice.description,

          originalAmount:
            invoice.original_amount === null
              ? null
              : normalizeMoney(
                  invoice.original_amount
                ),

          amount:
            normalizeMoney(
              invoice.amount
            ),

          discountAmount:
            normalizeMoney(
              invoice.discount_amount
            ),

          discountReason:
            invoice.discount_reason,

          dueDate:
            invoice.due_date,

          status:
            invoice.status,

          paidAt:
            invoice.paid_at,

          cancelledAt:
            invoice.cancelled_at,

          billingType:
            invoice.billing_type,

          planName:
            invoice.plan_name,

          contractStatus:
            invoice.contract_status,

          studentName:
            invoice.student_name,

          paymentCount:
            Number(
              invoice.payment_count || 0
            ),

          paidAmount:
            normalizeMoney(
              invoice.approved_payment_amount
            ),

          createdAt:
            invoice.created_at,

          updatedAt:
            invoice.updated_at,
        })
      ),

      pagination: {
        page:
          normalizedPage,

        limit:
          normalizedLimit,

        total,

        totalPages:
          total === 0
            ? 0
            : Math.ceil(
                total / normalizedLimit
              ),
      },

      filters: {
        status:
          status || null,

        contractId:
          normalizedContractId,

        dueFrom:
          dueFrom || null,

        dueTo:
          dueTo || null,

        search:
          normalizedSearch || null,
      },
    };
  } finally {
    connection.release();
  }
}

/**
 * Retorna os indicadores principais do dashboard.
 */
async function getFinancialDashboardSummary(db) {
  

  if (!db) {
   

    throw createServiceError(
      "A conexão com o banco de dados não foi fornecida.",
      500
    );
  }

  

  const [invoiceSummaryRows] =
    await db.promise().query(`
      SELECT
        COUNT(*) AS total_invoice_count,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'paid'
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS total_received,

        COALESCE(
          SUM(
            CASE
              WHEN status IN (
                'pending',
                'processing'
              )
              AND due_date >= CURDATE()
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS total_pending,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'overdue'
                OR (
                  status IN (
                    'pending',
                    'processing'
                  )
                  AND due_date < CURDATE()
                )
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS total_overdue,

        SUM(
          CASE
            WHEN status IN (
              'pending',
              'processing'
            )
            AND due_date >= CURDATE()
            THEN 1
            ELSE 0
          END
        ) AS pending_invoice_count,

        SUM(
          CASE
            WHEN status = 'overdue'
              OR (
                status IN (
                  'pending',
                  'processing'
                )
                AND due_date < CURDATE()
              )
            THEN 1
            ELSE 0
          END
        ) AS overdue_invoice_count,

        SUM(
          CASE
            WHEN status = 'paid'
            THEN 1
            ELSE 0
          END
        ) AS paid_invoice_count,

        COUNT(
          DISTINCT CASE
            WHEN status = 'overdue'
              OR (
                status IN (
                  'pending',
                  'processing'
                )
                AND due_date < CURDATE()
              )
            THEN financial_contract_id
          END
        ) AS overdue_contract_count

      FROM invoices

      WHERE status NOT IN (
        'cancelled',
        'refunded'
      )
    `);

  

  

  const [contractSummaryRows] =
    await db.promise().query(`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN status <> 'cancelled'
              THEN total_amount
              ELSE 0
            END
          ),
          0
        ) AS total_contracted,

        SUM(
          CASE
            WHEN status IN (
              'active',
              'overdue'
            )
            THEN 1
            ELSE 0
          END
        ) AS active_contract_count

      FROM financial_contracts
    `);

  

  const invoiceSummary =
    invoiceSummaryRows[0] ?? {};

  const contractSummary =
    contractSummaryRows[0] ?? {};

  const result = {
    totalContracted: normalizeMoney(
      contractSummary.total_contracted
    ),

    totalReceived: normalizeMoney(
      invoiceSummary.total_received
    ),

    totalPending: normalizeMoney(
      invoiceSummary.total_pending
    ),

    totalOverdue: normalizeMoney(
      invoiceSummary.total_overdue
    ),

    activeContracts: Number(
      contractSummary.active_contract_count ?? 0
    ),

    overdueContracts: Number(
      invoiceSummary.overdue_contract_count ?? 0
    ),

    pendingInvoices: Number(
      invoiceSummary.pending_invoice_count ?? 0
    ),

    overdueInvoices: Number(
      invoiceSummary.overdue_invoice_count ?? 0
    ),

    paidInvoices: Number(
      invoiceSummary.paid_invoice_count ?? 0
    ),

    recentInvoices: [],
  };

  

  return result;
}

module.exports = {
  listFinancialContracts,
  getFinancialContractDetails,
  listFinancialInvoices,
  getFinancialDashboardSummary,
};