const {
  findOrCreateSelfContractingPartyForStudent,
} = require("../financial/contractingPartyService");
const { dispatchAdminEnrollmentNotification } = require("../financial/activateContractService");

// 'withdrawn' permanece na lista de filtros/leitura, mas PATCH genérico
// recusa essa transição: o caminho correto é
// contractWithdrawalService.js#registerContractWithdrawal, que também
// encerra o contrato financeiro na mesma transação.
const ALLOWED_ENROLLMENT_STATUSES = ["active", "inactive", "completed", "cancelled", "withdrawn"];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizePagination(page, limit) {
  const normalizedPage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : DEFAULT_PAGE;

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    offset: (normalizedPage - 1) * normalizedLimit,
  };
}

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
}

function mapEnrollmentRow(row) {
  return {
    id: row.id,
    student: {
      id: row.student_id,
      name: row.student_name,
      registrationNumber: row.registration_number,
    },
    course: { id: row.course_id, name: row.course_name },
    class: row.class_id ? { id: row.class_id, name: row.class_name } : null,
    status: row.status,
    enrolledAt: row.enrolled_at,
    financialContract: row.contract_id
      ? {
          id: row.contract_id,
          status: row.contract_status,
          activationInvoice: row.activation_invoice_id
            ? {
                id: row.activation_invoice_id,
                status: row.activation_invoice_status,
                amount: row.activation_invoice_amount,
                paidAt: row.activation_invoice_paid_at,
              }
            : null,
        }
      : null,
  };
}

const BASE_JOIN = `
  FROM enrollments e
  INNER JOIN students s ON s.id = e.student_id
  INNER JOIN courses co ON co.id = e.course_id
  LEFT JOIN classes cl ON cl.id = e.class_id
  LEFT JOIN financial_contracts fc ON fc.enrollment_id = e.id
  LEFT JOIN invoices ai ON ai.id = fc.activation_invoice_id
`;

const SELECT_COLUMNS = `
  e.id, e.status, e.enrolled_at,
  s.id AS student_id, s.name AS student_name, s.registration_number,
  co.id AS course_id, co.name AS course_name,
  cl.id AS class_id, cl.name AS class_name,
  fc.id AS contract_id, fc.status AS contract_status,
  ai.id AS activation_invoice_id, ai.status AS activation_invoice_status,
  ai.amount AS activation_invoice_amount, ai.paid_at AS activation_invoice_paid_at
`;

function buildListFilters(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(s.name LIKE ? OR s.registration_number LIKE ? OR co.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (filters.studentId) {
    conditions.push("e.student_id = ?");
    params.push(normalizeId(filters.studentId, "ID do aluno inválido."));
  }

  if (filters.courseId) {
    conditions.push("e.course_id = ?");
    params.push(normalizeId(filters.courseId, "ID do curso inválido."));
  }

  if (filters.classId) {
    conditions.push("e.class_id = ?");
    params.push(normalizeId(filters.classId, "ID da turma inválido."));
  }

  // "Alunos sem turma" (card do dashboard) -- matrícula acadêmica
  // ativa sem turma vinculada, não usuário student sem turma.
  if (filters.classStatus === "unassigned") {
    conditions.push("e.status = 'active' AND e.class_id IS NULL");
  }

  if (filters.status === "pending_activation") {
    // LIMITAÇÃO CONHECIDA: esta listagem é sempre enraizada em
    // `enrollments` (BASE_JOIN abaixo), então um contrato cuja
    // enrollment ainda nem existe (fc.enrollment_id IS NULL --
    // "matrícula ainda não criada", a metade mais rara da definição
    // de pendência) não tem linha nenhuma pra aparecer aqui, mesmo
    // contando no card do dashboard. Reestruturar esta consulta para
    // também enraizar em financial_contracts está fora do escopo
    // desta mudança (ver diagnóstico) -- na prática esse estado é
    // quase inatingível hoje (activateContractFromPaidInvoice sempre
    // cria a enrollment e ativa o contrato na MESMA transação).
    //
    // "Matrículas pendentes" (card do dashboard) -- NÃO é um valor
    // real de enrollments.status, é uma pseudo-condição: a fatura de
    // ativação do contrato já está paga, mas a matrícula ainda não
    // está active (mesma regra usada por
    // adminDashboardService.getOperationsSummary#pendingEnrollments).
    // Nunca inclui contrato ainda genuinamente aguardando pagamento
    // (aí a fatura de ativação também não está paga).
    conditions.push("fc.id IS NOT NULL AND fc.status <> 'cancelled' AND e.status <> 'active' AND ai.status = 'paid'");
  } else if (filters.status) {
    if (!ALLOWED_ENROLLMENT_STATUSES.includes(filters.status)) {
      throw createServiceError("Status de matrícula inválido.", 400);
    }

    conditions.push("e.status = ?");
    params.push(filters.status);
  }

  if (filters.from) {
    conditions.push("e.enrolled_at >= ?");
    params.push(`${filters.from} 00:00:00`);
  }

  if (filters.to) {
    conditions.push("e.enrolled_at <= ?");
    params.push(`${filters.to} 23:59:59`);
  }

  return { whereClause: conditions.join(" AND "), params };
}

/**
 * Números globais para os cards — "pendentes" não existe no enum
 * real de enrollments.status (confirmado no diagnóstico), por isso
 * não aparece aqui.
 */
async function getEnrollmentsSummary(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM enrollments
    `
  );

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    active: Number(row.active || 0),
    cancelled: Number(row.cancelled || 0),
    completed: Number(row.completed || 0),
  };
}

async function listEnrollments(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [summary, [countRows], [rows]] = await Promise.all([
    getEnrollmentsSummary(db),
    db.promise().query(
      `SELECT COUNT(*) AS total ${BASE_JOIN} WHERE ${whereClause}`,
      params
    ),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        WHERE ${whereClause}
        ORDER BY e.enrolled_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapEnrollmentRow),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getEnrollmentById(db, id) {
  const enrollmentId = normalizeId(id, "ID da matrícula inválido.");

  const [rows] = await db.promise().query(
    `SELECT ${SELECT_COLUMNS} ${BASE_JOIN} WHERE e.id = ? LIMIT 1`,
    [enrollmentId]
  );

  if (rows.length === 0) {
    throw createServiceError("Matrícula não encontrada.", 404);
  }

  return mapEnrollmentRow(rows[0]);
}

/**
 * Cria a matrícula e o contrato financeiro correspondente numa
 * única transação — nunca uma sem a outra. O plano de preço precisa
 * ser um plano ATIVO do mesmo curso; não há geração de invoices
 * nesta fase (ver limitações na documentação).
 */
async function createEnrollment(db, payload) {
  const { student_id, course_id, class_id, pricing_plan_id, enrolled_at } = payload;

  const studentId = normalizeId(student_id, "Aluno é obrigatório e deve ser válido.");
  const courseId = normalizeId(course_id, "Curso é obrigatório e deve ser válido.");
  const pricingPlanId = normalizeId(
    pricing_plan_id,
    "Selecione um plano de preço para gerar o contrato financeiro."
  );

  const classId =
    class_id !== null && class_id !== undefined && class_id !== ""
      ? normalizeId(class_id, "ID da turma inválido.")
      : null;

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query(
      `SELECT id FROM students WHERE id = ? LIMIT 1`,
      [studentId]
    );

    if (studentRows.length === 0) {
      throw createServiceError("Aluno não encontrado.", 404);
    }

    const [courseRows] = await connection.query(
      `SELECT id FROM courses WHERE id = ? LIMIT 1`,
      [courseId]
    );

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    if (classId) {
      const [classRows] = await connection.query(
        `SELECT id, course_id FROM classes WHERE id = ? LIMIT 1`,
        [classId]
      );

      if (classRows.length === 0) {
        throw createServiceError("Turma não encontrada.", 404);
      }

      if (Number(classRows[0].course_id) !== courseId) {
        throw createServiceError(
          "A turma informada não pertence ao curso selecionado.",
          409
        );
      }
    }

    const [duplicateRows] = await connection.query(
      `
        SELECT id, status
        FROM enrollments
        WHERE student_id = ? AND course_id = ?
          AND status NOT IN ('cancelled', 'withdrawn')
        LIMIT 1
      `,
      [studentId, courseId]
    );

    if (duplicateRows.length > 0) {
      throw createServiceError(
        duplicateRows[0].status === "completed"
          ? "Este aluno já concluiu este curso e não pode se rematricular."
          : "Este aluno já está matriculado neste curso.",
        409
      );
    }

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

    const enrolledAtValue = enrolled_at || null;

    const [enrollmentResult] = await connection.query(
      `
        INSERT INTO enrollments
          (student_id, course_id, class_id, status, enrolled_at, created_at, updated_at)
        VALUES (?, ?, ?, 'active', COALESCE(?, NOW()), NOW(), NOW())
      `,
      [studentId, courseId, classId, enrolledAtValue]
    );

    const enrollmentId = enrollmentResult.insertId;

    // Fluxo legado (matrícula-primeiro): mantido por compatibilidade
    // enquanto o admin ainda não migrou para o wizard de contratação
    // (ver contractCreationService.js). status = 'active' porque a
    // matrícula já nasce ativa aqui -- não existe uma fatura de
    // ativação neste caminho para justificar 'pending_payment'.
    const contractingPartyId = await findOrCreateSelfContractingPartyForStudent(connection, {
      studentId,
    });

    const [contractResult] = await connection.query(
      `
        INSERT INTO financial_contracts
          (enrollment_id, student_id, course_id, contracting_party_id, created_by_user_id, origin,
           pricing_plan_id, billing_type, plan_name, total_amount,
           monthly_payment_count, monthly_payment_amount, max_card_installments,
           accepts_pix, accepts_boleto, accepts_credit_card, status, start_date, activated_at,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', COALESCE(?, CURDATE()), NOW(), NOW(), NOW())
      `,
      [
        enrollmentId,
        studentId,
        courseId,
        contractingPartyId,
        null,
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
        enrolledAtValue ? String(enrolledAtValue).slice(0, 10) : null,
      ]
    );

    await connection.commit();

    // Caminho legado "matrícula-primeiro": nunca passa por
    // activateContractFromPaidInvoice, então precisa da própria
    // chamada de notificação -- origin='admin' garante que vira
    // admin.enrollment.created, nunca admin.checkout.completed.
    await dispatchAdminEnrollmentNotification(db, {
      enrollmentId,
      contractId: contractResult.insertId,
      studentId,
      courseId,
      origin: "admin",
      amount: Number(plan.total_amount),
    });

    return getEnrollmentById(db, enrollmentId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError("Este aluno já está matriculado neste curso.", 409);
    }

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Correção administrativa da data de matrícula. Demais campos têm
 * endpoints próprios (status, troca de turma) de propósito — evita
 * um PUT genérico silencioso sobre algo sensível.
 */
async function updateEnrollment(db, id, payload) {
  const enrollmentId = normalizeId(id, "ID da matrícula inválido.");
  const { enrolled_at } = payload;

  if (!enrolled_at) {
    throw createServiceError("Data de matrícula é obrigatória.", 400);
  }

  const [result] = await db
    .promise()
    .query(`UPDATE enrollments SET enrolled_at = ?, updated_at = NOW() WHERE id = ?`, [
      enrolled_at,
      enrollmentId,
    ]);

  if (result.affectedRows === 0) {
    throw createServiceError("Matrícula não encontrada.", 404);
  }

  return getEnrollmentById(db, enrollmentId);
}

/**
 * "Matrícula vinculada a um contrato cancelado não pode ser
 * reativada enquanto o contrato permanecer cancelado; matrícula com
 * contrato pending_payment não pode ser ativada/reativada" -- única
 * regra de negócio desta validação. Sem contrato vinculado, segue as
 * regras acadêmicas normais (matrículas de migração/operação
 * administrativa não têm contrato e não devem ser bloqueadas aqui).
 * 'overdue'/'active'/'completed' são permitidos -- 'overdue' já tem
 * sua própria política de cobrança/lock (invoiceCollectionActionService.js),
 * que esta validação não substitui nem duplica.
 */
async function assertEnrollmentCanBeActivated(db, enrollmentId) {
  const [rows] = await db.promise().query(
    `SELECT fc.status FROM financial_contracts fc WHERE fc.enrollment_id = ? LIMIT 1`,
    [enrollmentId]
  );

  const contract = rows[0];

  if (!contract) {
    return;
  }

  if (contract.status === "cancelled") {
    throw createServiceError(
      "Não é possível reativar esta matrícula porque o contrato vinculado está cancelado.",
      409
    );
  }

  if (contract.status === "pending_payment") {
    throw createServiceError(
      "Não é possível ativar esta matrícula enquanto o contrato vinculado estiver aguardando pagamento.",
      409
    );
  }
}

/**
 * Cancelamento/conclusão/reativação. Nunca apaga submissions,
 * grades, progress, attendance ou histórico financeiro — só muda o
 * status da própria matrícula. 'locked' fica fora deste endpoint
 * genérico (tem lock_reason/locked_by_user_id próprios, ligados a
 * um fluxo mais cauteloso que não foi pedido nesta fase).
 */
async function updateEnrollmentStatus(db, id, status) {
  const enrollmentId = normalizeId(id, "ID da matrícula inválido.");

  if (!ALLOWED_ENROLLMENT_STATUSES.includes(status)) {
    throw createServiceError(
      "Status inválido. Use active, inactive, completed, cancelled ou withdrawn.",
      400
    );
  }

  if (status === "withdrawn") {
    throw createServiceError(
      "Desistência deve ser registrada pelo fluxo financeiro de desistência do contrato.",
      409
    );
  }

  if (status === "active") {
    await assertEnrollmentCanBeActivated(db, enrollmentId);
  }

  const completedAtClause = status === "completed" ? ", completed_at = NOW()" : "";

  const [result] = await db
    .promise()
    .query(
      `UPDATE enrollments SET status = ? ${completedAtClause}, updated_at = NOW() WHERE id = ?`,
      [status, enrollmentId]
    );

  if (result.affectedRows === 0) {
    throw createServiceError("Matrícula não encontrada.", 404);
  }

  return getEnrollmentById(db, enrollmentId);
}

/**
 * Impacto informativo da turma ATUAL antes de trocar — nada aqui é
 * apagado pela troca em si (os registros ficam vinculados aos seus
 * próprios class_sessions/activities, não à matrícula), mas o aluno
 * passa a não pertencer mais àquela turma daqui em diante.
 */
async function getClassChangeImpact(runner, { classId, studentId }) {
  if (!classId) {
    return { oldClassActivities: 0, oldClassContents: 0, oldClassSubmissions: 0, oldClassAttendance: 0 };
  }

  const [[activityRows], [contentRows], [submissionRows], [attendanceRows]] =
    await Promise.all([
      runner.query(`SELECT COUNT(*) AS count FROM activities WHERE class_id = ?`, [
        classId,
      ]),
      runner.query(
        `SELECT COUNT(*) AS count FROM course_contents WHERE class_id = ?`,
        [classId]
      ),
      runner.query(
        `
          SELECT COUNT(*) AS count
          FROM submissions sub
          INNER JOIN activities a ON a.id = sub.activity_id
          WHERE a.class_id = ? AND sub.student_id = ?
        `,
        [classId, studentId]
      ),
      runner.query(
        `
          SELECT COUNT(*) AS count
          FROM attendance att
          INNER JOIN class_sessions cs ON cs.id = att.class_session_id
          WHERE cs.class_id = ? AND att.student_id = ?
        `,
        [classId, studentId]
      ),
    ]);

  return {
    oldClassActivities: Number(activityRows[0]?.count || 0),
    oldClassContents: Number(contentRows[0]?.count || 0),
    oldClassSubmissions: Number(submissionRows[0]?.count || 0),
    oldClassAttendance: Number(attendanceRows[0]?.count || 0),
  };
}

/**
 * Prévia do impacto da turma ATUAL, para exibir antes de confirmar
 * a troca (mesmo cálculo usado dentro de changeEnrollmentClass, só
 * que sem alterar nada).
 */
async function getClassChangeImpactPreview(db, id) {
  const enrollmentId = normalizeId(id, "ID da matrícula inválido.");

  const [enrollmentRows] = await db
    .promise()
    .query(`SELECT class_id, student_id FROM enrollments WHERE id = ? LIMIT 1`, [
      enrollmentId,
    ]);

  if (enrollmentRows.length === 0) {
    throw createServiceError("Matrícula não encontrada.", 404);
  }

  return getClassChangeImpact(db.promise(), {
    classId: enrollmentRows[0].class_id,
    studentId: enrollmentRows[0].student_id,
  });
}

/**
 * Troca de turma explícita — nunca um UPDATE silencioso de class_id
 * via PUT genérico. Só permite trocar dentro do MESMO curso; mudar
 * de curso é bloqueado (evolução futura, consequências acadêmicas e
 * financeiras maiores). Registra motivo/ator/data diretamente em
 * enrollments (colunas adicionadas pela migration
 * 20260803_001_add_class_change_audit_to_enrollments.sql) — sem
 * tabela de auditoria genérica nesta fase.
 */
async function changeEnrollmentClass(db, id, { newClassId, reason }, actingUserId) {
  const enrollmentId = normalizeId(id, "ID da matrícula inválido.");
  const normalizedNewClassId = normalizeId(newClassId, "Nova turma é obrigatória e deve ser válida.");

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [enrollmentRows] = await connection.query(
      `SELECT id, student_id, course_id, class_id, status FROM enrollments WHERE id = ? LIMIT 1`,
      [enrollmentId]
    );

    if (enrollmentRows.length === 0) {
      throw createServiceError("Matrícula não encontrada.", 404);
    }

    const enrollment = enrollmentRows[0];

    if (enrollment.status !== "active") {
      throw createServiceError(
        "Só é possível trocar a turma de uma matrícula ativa.",
        409
      );
    }

    if (Number(enrollment.class_id) === normalizedNewClassId) {
      throw createServiceError("O aluno já está matriculado nesta turma.", 400);
    }

    const [classRows] = await connection.query(
      `SELECT id, course_id FROM classes WHERE id = ? LIMIT 1`,
      [normalizedNewClassId]
    );

    if (classRows.length === 0) {
      throw createServiceError("Turma não encontrada.", 404);
    }

    if (Number(classRows[0].course_id) !== Number(enrollment.course_id)) {
      throw createServiceError(
        "A nova turma pertence a outro curso. Mudança de curso não é suportada nesta versão.",
        409
      );
    }

    const impact = await getClassChangeImpact(connection, {
      classId: enrollment.class_id,
      studentId: enrollment.student_id,
    });

    await connection.query(
      `
        UPDATE enrollments
        SET class_id = ?, class_change_reason = ?, class_changed_at = NOW(),
            class_changed_by_user_id = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [normalizedNewClassId, reason?.trim() || null, actingUserId, enrollmentId]
    );

    await connection.commit();

    const updatedEnrollment = await getEnrollmentById(db, enrollmentId);

    return { enrollment: updatedEnrollment, previousClassImpact: impact };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createServiceError,
  listEnrollments,
  getEnrollmentById,
  createEnrollment,
  updateEnrollment,
  updateEnrollmentStatus,
  getClassChangeImpactPreview,
  changeEnrollmentClass,
  ALLOWED_ENROLLMENT_STATUSES,
};
