/**
 * Origens manuais de matrícula geridas pelo admin, além do fluxo
 * comercial padrão (wizard -> contrato -> fatura, ver
 * contractCreationService.js):
 *   - "Pagamento externo já realizado": cria contrato + fatura pelo
 *     MESMO serviço central do fluxo comercial, e imediatamente
 *     registra o pagamento manual sobre essa fatura -- nunca pula o
 *     registro financeiro só porque o pagamento aconteceu fora do
 *     CourseHub.
 *   - "Bolsa/cortesia integral": cria matrícula ativa diretamente,
 *     sem fatura artificial de R$ 0. Bolsa PARCIAL não tem função
 *     própria aqui -- é o fluxo comercial padrão com desconto (já
 *     suportado por createStudentContractWithInitialInvoice).
 *   - "Matrícula por migração": importa uma matrícula pré-existente
 *     de fora do CourseHub, com ou sem um contrato legado associado
 *     -- nunca fabrica pagamentos passados nem gera fatura de entrada
 *     como se fosse uma venda nova.
 */
const { createStudent } = require("./adminStudentService");
const {
  findOrCreateSelfContractingPartyForStudent,
  linkStudentToContractingParty,
  createContractingPartyWithConnection,
} = require("../financial/contractingPartyService");
const {
  createStudentContractWithInitialInvoice,
} = require("../financial/contractCreationService");
const { registerManualPayment } = require("../financial/paymentService");
const { createFinancialEvent } = require("../financial/financialEventService");
const { dispatchActivationInvitationEmail } = require("../auth/accountActivationService");
const { dispatchAdminEnrollmentNotification } = require("../financial/activateContractService");

const ALLOWED_CONTRACTING_PARTY_MODES = ["self", "existing", "new"];
const ALLOWED_SCHOLARSHIP_TYPES = ["scholarship", "courtesy"];

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

/**
 * Só cobre o caso de seguraça: se a matrícula (bolsa/cortesia ou
 * migração) foi criada para um aluno NOVO (pending_activation), o
 * convite de ativação precisa ser despachado -- nunca deixar uma
 * conta pending_activation sem um caminho para definir senha. Um
 * aluno já ativo recebendo uma nova matrícula por bolsa/migração não
 * gera notificação especial aqui (não houve pagamento a confirmar,
 * "Pagamento confirmado" não se aplica). Nunca chamado dentro da
 * transação que criou a matrícula.
 */
async function dispatchEnrollmentActivationIfNeeded(db, { studentId, courseId, enrollmentId }) {
  const [studentRows] = await db
    .promise()
    .query(`SELECT user_id, name FROM students WHERE id = ? LIMIT 1`, [studentId]);

  if (studentRows.length === 0) return;

  const { user_id: userId, name: studentName } = studentRows[0];

  const [userRows] = await db.promise().query(`SELECT status, email FROM users WHERE id = ? LIMIT 1`, [
    userId,
  ]);

  if (userRows.length === 0 || userRows[0].status !== "pending_activation") return;

  try {
    await dispatchActivationInvitationEmail(db, {
      userId,
      email: userRows[0].email,
      studentName,
      courseId,
      enrollmentId,
    });
  } catch (notificationError) {
    console.error(
      "[adminManualEnrollmentService] falha ao agendar convite de ativação:",
      notificationError
    );
  }
}

/**
 * "Pagamento externo já realizado" -- cria contrato+fatura via
 * createStudentContractWithInitialInvoice e registra o pagamento
 * manual em seguida (o que já ativa o contrato e cria a matrícula
 * pela mesma regra central usada em qualquer outro pagamento).
 */
async function registerExternalPayment(db, payload, actorUserId) {
  const {
    paidAmount,
    paymentDate,
    paymentMethod,
    paymentReference,
    justification,
    ...contractPayload
  } = payload || {};

  if (!paidAmount || Number(paidAmount) <= 0) {
    throw createServiceError("O valor pago é obrigatório e deve ser maior que zero.", 400);
  }

  if (!paymentDate) {
    throw createServiceError("A data real do pagamento é obrigatória.", 400);
  }

  if (!justification?.trim()) {
    throw createServiceError("A justificativa é obrigatória.", 400);
  }

  const contractResult = await createStudentContractWithInitialInvoice(
    db,
    {
      ...contractPayload,
      billingData: {
        ...(contractPayload.billingData || {}),
        dueDate: contractPayload.billingData?.dueDate || paymentDate,
      },
      origin: "admin",
    },
    actorUserId
  );

  const paymentResult = await registerManualPayment(db, {
    invoiceId: contractResult.invoiceId,
    amount: Number(paidAmount),
    paymentMethod,
    paymentDate,
    reason: `Pagamento externo já realizado. Referência: ${
      paymentReference?.trim() || "não informada"
    }. Justificativa: ${justification.trim()}`,
    actorUserId,
  });

  return {
    contractId: contractResult.contractId,
    invoiceId: contractResult.invoiceId,
    studentId: contractResult.studentId,
    activationResult: paymentResult.activationResult,
  };
}

async function resolveStudentForManualEnrollment(connection, db, { existingStudentId, newStudentData }) {
  if (existingStudentId) {
    const studentId = normalizeId(existingStudentId, "Aluno inválido.");

    const [rows] = await connection.query(
      `SELECT id, status FROM students WHERE id = ? LIMIT 1 FOR UPDATE`,
      [studentId]
    );

    if (rows.length === 0) {
      throw createServiceError("Aluno não encontrado.", 404);
    }

    return studentId;
  }

  if (!newStudentData) {
    throw createServiceError("Informe um aluno existente ou os dados de um novo aluno.", 400);
  }

  const created = await createStudent(db, newStudentData, {
    connection,
    allowNullPassword: true,
  });

  return created.id;
}

async function resolveContractingPartyForManualEnrollment(
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

    await linkStudentToContractingParty(connection, {
      studentId,
      contractingPartyId: partyId,
      relationshipType: contractingPartyData?.relationshipType || "other",
      isPrimary: true,
    });

    return partyId;
  }

  const partyId = await createContractingPartyWithConnection(connection, contractingPartyData);

  await linkStudentToContractingParty(connection, {
    studentId,
    contractingPartyId: partyId,
    relationshipType: contractingPartyData?.relationshipType || "other",
    isPrimary: true,
  });

  return partyId;
}

/**
 * "Bolsa ou cortesia integral" -- matrícula ativa direta, sem
 * contrato/fatura nenhum (não existe cobrança). Nunca cria um
 * financial_contract "para constar" nem uma invoice de R$ 0.
 */
async function registerScholarshipEnrollment(db, payload, actorUserId) {
  const {
    existingStudentId,
    newStudentData,
    contractingPartyMode = "self",
    contractingPartyId,
    contractingPartyData,
    courseId,
    classId,
    scholarshipType,
    justification,
    authorizedByUserId,
    validUntil,
  } = payload || {};

  if (!ALLOWED_SCHOLARSHIP_TYPES.includes(scholarshipType)) {
    throw createServiceError(
      "Tipo de bolsa inválido. Utilize scholarship ou courtesy.",
      400
    );
  }

  if (!justification?.trim()) {
    throw createServiceError("A justificativa da bolsa/cortesia é obrigatória.", 400);
  }

  const normalizedCourseId = normalizeId(courseId, "Curso é obrigatório e deve ser válido.");
  const normalizedClassId = classId ? normalizeId(classId, "ID da turma inválido.") : null;

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const studentId = await resolveStudentForManualEnrollment(connection, db, {
      existingStudentId,
      newStudentData,
    });

    await resolveContractingPartyForManualEnrollment(connection, {
      studentId,
      contractingPartyMode,
      contractingPartyId,
      contractingPartyData,
    });

    const [courseRows] = await connection.query(`SELECT id FROM courses WHERE id = ? LIMIT 1`, [
      normalizedCourseId,
    ]);

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    const [duplicateRows] = await connection.query(
      `
        SELECT id, status
        FROM enrollments
        WHERE student_id = ? AND course_id = ?
          AND status NOT IN ('cancelled', 'withdrawn')
        LIMIT 1
      `,
      [studentId, normalizedCourseId]
    );

    if (duplicateRows.length > 0) {
      throw createServiceError(
        duplicateRows[0].status === "completed"
          ? "Este aluno já concluiu este curso e não pode se rematricular."
          : "Este aluno já está matriculado neste curso.",
        409
      );
    }

    const [enrollmentResult] = await connection.query(
      `
        INSERT INTO enrollments
          (student_id, course_id, class_id, status, enrolled_at, origin, created_by_user_id,
           activated_at, created_at, updated_at)
        VALUES (?, ?, ?, 'active', NOW(), ?, ?, NOW(), NOW(), NOW())
      `,
      [studentId, normalizedCourseId, normalizedClassId, scholarshipType, actorUserId]
    );

    const enrollmentId = enrollmentResult.insertId;

    await createFinancialEvent(connection, {
      enrollmentId,
      eventType: "enrollment_created",
      source: "admin",
      actorUserId,
      newValue: {
        scholarshipType,
        justification: justification.trim(),
        authorizedByUserId: authorizedByUserId || actorUserId,
        validUntil: validUntil || null,
      },
      reason: justification.trim(),
    });

    await connection.commit();

    await dispatchEnrollmentActivationIfNeeded(db, {
      studentId,
      courseId: normalizedCourseId,
      enrollmentId,
    });

    // Bolsa/cortesia sempre nasce 'active' (sem fatura/pagamento) --
    // nunca passa por activateContractFromPaidInvoice, então precisa
    // da própria notificação administrativa.
    await dispatchAdminEnrollmentNotification(db, {
      enrollmentId,
      studentId,
      courseId: normalizedCourseId,
      origin: scholarshipType,
    });

    return { studentId, courseId: normalizedCourseId, enrollmentId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * "Matrícula por migração" -- importa uma matrícula que já existia
 * fora do CourseHub. `mode: 'enrollment_only'` cria só a matrícula.
 * `mode: 'with_legacy_contract'` também cria um financial_contract de
 * origem 'migration', SEM fatura de entrada (o histórico financeiro
 * anterior fica descrito em texto em enrollment_migration_details,
 * nunca fabricado como payments/invoices reais).
 */
async function registerMigratedEnrollment(db, payload, actorUserId) {
  const {
    existingStudentId,
    newStudentData,
    contractingPartyMode = "self",
    contractingPartyId,
    contractingPartyData,
    courseId,
    classId,
    pricingPlanId,
    mode,
    originalEnrollmentDate,
    migrationSource,
    legacyEnrollmentId,
    currentAcademicStatus,
    financialSituation,
    migrationNotes,
  } = payload || {};

  if (!["enrollment_only", "with_legacy_contract"].includes(mode)) {
    throw createServiceError(
      "Modo de migração inválido. Utilize enrollment_only ou with_legacy_contract.",
      400
    );
  }

  if (!originalEnrollmentDate) {
    throw createServiceError("A data original da matrícula é obrigatória.", 400);
  }

  if (!migrationSource?.trim()) {
    throw createServiceError("A origem/sistema de migração é obrigatória.", 400);
  }

  const normalizedCourseId = normalizeId(courseId, "Curso é obrigatório e deve ser válido.");
  const normalizedClassId = classId ? normalizeId(classId, "ID da turma inválido.") : null;
  const normalizedAcademicStatus = ["active", "inactive", "completed", "cancelled"].includes(
    currentAcademicStatus
  )
    ? currentAcademicStatus
    : "active";

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const studentId = await resolveStudentForManualEnrollment(connection, db, {
      existingStudentId,
      newStudentData,
    });

    const contractingPartyIdResolved = await resolveContractingPartyForManualEnrollment(connection, {
      studentId,
      contractingPartyMode,
      contractingPartyId,
      contractingPartyData,
    });

    const [courseRows] = await connection.query(`SELECT id FROM courses WHERE id = ? LIMIT 1`, [
      normalizedCourseId,
    ]);

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    if (["active", "inactive", "locked", "completed"].includes(normalizedAcademicStatus)) {
      const [aliveRows] = await connection.query(
        `
          SELECT id, status
          FROM enrollments
          WHERE student_id = ? AND course_id = ?
            AND status NOT IN ('cancelled', 'withdrawn')
          LIMIT 1
        `,
        [studentId, normalizedCourseId]
      );

      if (aliveRows.length > 0) {
        throw createServiceError(
          aliveRows[0].status === "completed"
            ? "Este aluno já concluiu este curso e não pode se rematricular."
            : "Este aluno já está matriculado neste curso.",
          409
        );
      }
    }

    const [enrollmentResult] = await connection.query(
      `
        INSERT INTO enrollments
          (student_id, course_id, class_id, status, enrolled_at, origin, created_by_user_id,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'migration', ?, NOW(), NOW())
      `,
      [studentId, normalizedCourseId, normalizedClassId, normalizedAcademicStatus, originalEnrollmentDate, actorUserId]
    );

    const enrollmentId = enrollmentResult.insertId;

    await connection.query(
      `
        INSERT INTO enrollment_migration_details
          (enrollment_id, migration_source, legacy_enrollment_id, original_enrollment_date,
           legacy_financial_status, notes, migrated_by_user_id, migrated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        enrollmentId,
        migrationSource.trim(),
        legacyEnrollmentId?.trim() || null,
        originalEnrollmentDate,
        financialSituation?.trim() || null,
        migrationNotes?.trim() || null,
        actorUserId,
      ]
    );

    let contractId = null;

    if (mode === "with_legacy_contract") {
      const normalizedPricingPlanId = normalizeId(
        pricingPlanId,
        "Plano de preço é obrigatório para registrar o contrato legado."
      );

      const [planRows] = await connection.query(
        `
          SELECT id, course_id, billing_type, name, total_amount, monthly_payment_count,
                 monthly_payment_amount, max_card_installments, accepts_pix,
                 accepts_boleto, accepts_credit_card
          FROM course_pricing_plans WHERE id = ? LIMIT 1
        `,
        [normalizedPricingPlanId]
      );

      if (planRows.length === 0) {
        throw createServiceError("Plano de preço não encontrado.", 404);
      }

      const plan = planRows[0];

      if (Number(plan.course_id) !== normalizedCourseId) {
        throw createServiceError(
          "O plano de preço selecionado não pertence ao curso informado.",
          409
        );
      }

      const [partyRows] = await connection.query(
        `SELECT name, document_number, email, phone FROM contracting_parties WHERE id = ? LIMIT 1`,
        [contractingPartyIdResolved]
      );

      const party = partyRows[0];

      const contractStatus = normalizedAcademicStatus === "cancelled" ? "cancelled" : "active";

      const [contractResult] = await connection.query(
        `
          INSERT INTO financial_contracts
            (enrollment_id, student_id, course_id, contracting_party_id, created_by_user_id,
             origin, pricing_plan_id, billing_type, plan_name, total_amount,
             monthly_payment_count, monthly_payment_amount, max_card_installments,
             accepts_pix, accepts_boleto, accepts_credit_card, status, start_date,
             activated_at, contracting_party_name, contracting_party_document,
             contracting_party_email, contracting_party_phone, created_at, updated_at)
          VALUES
            (?, ?, ?, ?, ?, 'migration', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          enrollmentId,
          studentId,
          normalizedCourseId,
          contractingPartyIdResolved,
          actorUserId,
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
          contractStatus,
          originalEnrollmentDate,
          contractStatus === "active" ? originalEnrollmentDate : null,
          party.name,
          party.document_number,
          party.email,
          party.phone,
        ]
      );

      contractId = contractResult.insertId;

      await createFinancialEvent(connection, {
        financialContractId: contractId,
        enrollmentId,
        eventType: "contract_created",
        source: "admin",
        actorUserId,
        reason: `Contrato legado importado (${migrationSource.trim()}).`,
      });
    }

    await createFinancialEvent(connection, {
      enrollmentId,
      eventType: "enrollment_created",
      source: "admin",
      actorUserId,
      reason: `Matrícula importada (${migrationSource.trim()}).`,
    });

    await connection.commit();

    await dispatchEnrollmentActivationIfNeeded(db, {
      studentId,
      courseId: normalizedCourseId,
      enrollmentId,
    });

    // Só notifica quando a matrícula importada nasce genuinamente
    // 'active' -- um registro histórico marcado inactive/completed/
    // cancelled não é "uma nova matrícula" no sentido operacional que
    // os admins precisam ver no inbox.
    if (normalizedAcademicStatus === "active") {
      await dispatchAdminEnrollmentNotification(db, {
        enrollmentId,
        contractId,
        studentId,
        courseId: normalizedCourseId,
        origin: "migration",
      });
    }

    return { studentId, courseId: normalizedCourseId, enrollmentId, contractId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createServiceError,
  registerExternalPayment,
  registerScholarshipEnrollment,
  registerMigratedEnrollment,
};
