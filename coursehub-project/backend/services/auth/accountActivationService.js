/**
 * Ativação de conta -- fluxo semanticamente distinto de recuperação
 * de senha (reaproveita generateOpaqueToken/hashToken por baixo, mas
 * com tabela/regras próprias, ver repositories/accountActivationTokens.js).
 * Um usuário só chega a este fluxo depois que o pagamento da fatura
 * de ativação do seu contrato foi confirmado (ver
 * activateContractService.js) -- nunca antes disso.
 */
const bcrypt = require("bcryptjs");

const {
  getTtlMinutes,
  invalidateActiveTokensForUser,
  createActivationToken,
  findValidActivationToken,
  markActivationTokenUsed,
} = require("../../repositories/accountActivationTokens");
const { createFinancialEvent } = require("../financial/financialEventService");
const { createNotificationEvent } = require("../notifications/notificationService");

const MIN_PASSWORD_LENGTH = 6;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * GET /api/auth/account-activation/validate?token=...
 * Nunca revela qual usuário o token pertence -- só se é utilizável.
 */
async function validateActivationToken(db, rawToken) {
  if (!rawToken) {
    return { valid: false };
  }

  const token = await findValidActivationToken(db.promise(), rawToken);

  return { valid: Boolean(token) };
}

/**
 * POST /api/auth/account-activation
 * Define a primeira senha e ativa a conta. Transacional: valida
 * token -> valida usuário -> valida senha -> grava hash -> marca
 * token usado -> ativa usuário -> registra evento -- tudo ou nada.
 */
async function activateAccount(db, { token, newPassword, confirmPassword }) {
  if (!token) {
    throw createServiceError("Link de ativação inválido ou expirado.", 400);
  }

  if (!newPassword || !confirmPassword) {
    throw createServiceError("Informe a nova senha e a confirmação.", 400);
  }

  if (newPassword !== confirmPassword) {
    throw createServiceError("A confirmação da senha não confere.", 400);
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw createServiceError(
      `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      400
    );
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const activationToken = await findValidActivationToken(connection, token);

    if (!activationToken) {
      throw createServiceError("Link de ativação inválido ou expirado.", 400);
    }

    const [userRows] = await connection.query(
      `SELECT id, status FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [activationToken.user_id]
    );

    if (userRows.length === 0) {
      throw createServiceError("Usuário não encontrado.", 404);
    }

    const user = userRows[0];

    if (user.status === "blocked") {
      throw createServiceError("Esta conta está bloqueada.", 403);
    }

    if (user.status === "active") {
      throw createServiceError("Esta conta já está ativa. Faça login normalmente.", 409);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await connection.query(
      `UPDATE users SET password_hash = ?, status = 'active', updated_at = NOW() WHERE id = ?`,
      [passwordHash, user.id]
    );

    await markActivationTokenUsed(connection, activationToken.id);

    const [studentRows] = await connection.query(
      `SELECT id FROM students WHERE user_id = ? LIMIT 1`,
      [user.id]
    );

    if (studentRows.length > 0) {
      // enrollmentId is the anchor here (not financial_contract_id)
      // since the enrollment is guaranteed to exist for any account
      // that reached activation, even for contract-less origins
      // (e.g. full scholarship) -- see financialEventService.js.
      const [enrollmentRows] = await connection.query(
        `SELECT id FROM enrollments WHERE student_id = ? AND status = 'active' LIMIT 1`,
        [studentRows[0].id]
      );

      if (enrollmentRows.length > 0) {
        await createFinancialEvent(connection, {
          enrollmentId: enrollmentRows[0].id,
          eventType: "account_activated",
          source: "student",
          actorUserId: user.id,
        });
      }
    }

    await connection.commit();

    return { message: "Conta ativada com sucesso." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Confirma que um usuário é elegível para receber um convite de
 * ativação (automático ou por ação administrativa de reenvio) --
 * mesma checagem em todos os pontos de entrada, nunca duplicada.
 */
async function assertUserEligibleForActivationInvitation(runner, userId) {
  const [rows] = await runner.query(
    `
      SELECT u.id, u.status, u.role, u.email, s.id AS student_id, s.name AS student_name
      FROM users u
      INNER JOIN students s ON s.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) {
    throw createServiceError("Usuário não encontrado ou não é um aluno.", 404);
  }

  const user = rows[0];

  if (user.status === "blocked") {
    throw createServiceError("Esta conta está bloqueada.", 409);
  }

  if (user.status === "active") {
    throw createServiceError(
      "Esta conta já está ativa. Use a recuperação de senha normal.",
      409
    );
  }

  if (user.status !== "pending_activation") {
    throw createServiceError("Esta conta não está aguardando ativação.", 409);
  }

  if (!user.email) {
    throw createServiceError("Este usuário não possui e-mail cadastrado.", 409);
  }

  const [enrollmentRows] = await runner.query(
    `SELECT id, course_id FROM enrollments WHERE student_id = ? AND status = 'active' LIMIT 1`,
    [user.student_id]
  );

  if (enrollmentRows.length === 0) {
    throw createServiceError(
      "Este aluno ainda não possui matrícula ativa -- aguarde a confirmação do pagamento.",
      409
    );
  }

  return {
    userId: user.id,
    email: user.email,
    studentName: user.student_name,
    courseId: enrollmentRows[0].course_id,
    enrollmentId: enrollmentRows[0].id,
  };
}

async function loadCourseName(runner, courseId) {
  const [rows] = await runner.query(`SELECT name FROM courses WHERE id = ? LIMIT 1`, [courseId]);

  return rows[0]?.name || "";
}

/**
 * Dispara o convite de ativação por e-mail (agendado via outbox,
 * nunca enviado de forma síncrona). Usado tanto pela ativação
 * automática pós-pagamento (source='system') quanto pelo reenvio
 * administrativo (source='admin').
 */
async function dispatchActivationInvitationEmail(
  db,
  { userId, email, studentName, courseId, enrollmentId, actorUserId = null }
) {
  const courseName = await loadCourseName(db.promise(), courseId);

  const connection = await db.promise().getConnection();
  let rawToken;

  try {
    await connection.beginTransaction();

    const created = await createActivationToken(connection, userId);
    rawToken = created.rawToken;

    if (enrollmentId) {
      await createFinancialEvent(connection, {
        enrollmentId,
        eventType: "account_activation_invitation_created",
        source: "system",
        actorUserId,
      });
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await createNotificationEvent(db, {
    type: "account.activation.invitation_created",
    sourceType: "user",
    sourceId: userId,
    actorUserId,
    context: { userId, studentName, courseName, activationToken: rawToken },
    recipients: [{ userId, email, name: studentName, role: "student" }],
    excludeActor: false,
  });
}

/**
 * Notifica um aluno já ativo de que uma NOVA matrícula (segundo
 * curso, por exemplo) foi liberada -- sem token, sem link de
 * ativação, ele já tem senha.
 */
async function dispatchAlreadyActiveNotice(db, { userId, email, courseId, invoiceId }) {
  const courseName = await loadCourseName(db.promise(), courseId);

  await createNotificationEvent(db, {
    type: "account.activation.already_active_notice",
    sourceType: "user",
    sourceId: userId,
    context: { userId, courseName, invoiceId },
    recipients: [{ userId, email }],
    excludeActor: false,
  });
}

const ALLOWED_DELIVERY_METHODS = ["email", "manual_link"];

/**
 * POST /api/admin/users/:userId/account-activation-invitations
 * Endpoint único do adendo -- cobre reenvio por e-mail e geração de
 * link manual, sempre pelo MESMO mecanismo de token (nunca um
 * segundo fluxo de senha paralelo). actorUserId é sempre derivado do
 * token do admin autenticado, nunca aceito do payload.
 */
async function createAccountActivationInvitation(
  db,
  { userId, deliveryMethod, actorUserId }
) {
  if (!ALLOWED_DELIVERY_METHODS.includes(deliveryMethod)) {
    throw createServiceError(
      "Canal de entrega inválido. Utilize email ou manual_link.",
      400
    );
  }

  const normalizedUserId = Number(userId);

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw createServiceError("ID de usuário inválido.", 400);
  }

  const connection = await db.promise().getConnection();
  let eligibility;
  let rawToken;
  let expiresAt;
  let invalidatedPrevious = false;

  try {
    await connection.beginTransaction();

    const [lockRows] = await connection.query(
      `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [normalizedUserId]
    );

    if (lockRows.length === 0) {
      throw createServiceError("Usuário não encontrado.", 404);
    }

    eligibility = await assertUserEligibleForActivationInvitation(connection, normalizedUserId);

    const [previousTokenRows] = await connection.query(
      `
        SELECT COUNT(*) AS total FROM account_activation_tokens
        WHERE user_id = ? AND used_at IS NULL AND invalidated_at IS NULL AND expires_at > NOW()
      `,
      [normalizedUserId]
    );

    invalidatedPrevious = Number(previousTokenRows[0]?.total || 0) > 0;

    const created = await createActivationToken(connection, normalizedUserId);
    rawToken = created.rawToken;
    expiresAt = created.expiresAt;

    if (invalidatedPrevious) {
      await createFinancialEvent(connection, {
        enrollmentId: eligibility.enrollmentId,
        eventType: "account_activation_previous_tokens_invalidated",
        source: "admin",
        actorUserId,
      });
    }

    const eventType =
      deliveryMethod === "email"
        ? "account_activation_invitation_resent"
        : "account_activation_manual_link_generated";

    await createFinancialEvent(connection, {
      enrollmentId: eligibility.enrollmentId,
      eventType,
      source: "admin",
      actorUserId,
      newValue: { deliveryMethod, expiresAt },
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (deliveryMethod === "email") {
    const courseName = await loadCourseName(db.promise(), eligibility.courseId);

    await createNotificationEvent(db, {
      type: "account.activation.invitation_created",
      sourceType: "user",
      sourceId: eligibility.userId,
      actorUserId,
      context: {
        userId: eligibility.userId,
        studentName: eligibility.studentName,
        courseName,
        activationToken: rawToken,
      },
      recipients: [
        {
          userId: eligibility.userId,
          email: eligibility.email,
          name: eligibility.studentName,
          role: "student",
        },
      ],
      excludeActor: false,
    });

    return { message: "Convite agendado para envio.", expiresAt };
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  return {
    activationUrl: `${frontendUrl}/ativar-conta?token=${rawToken}`,
    expiresAt,
  };
}

/**
 * Alias simples de createAccountActivationInvitation com
 * deliveryMethod fixo em 'email' -- cobre o endpoint mais antigo
 * sugerido (POST /api/admin/users/:userId/resend-activation) sem
 * duplicar a lógica.
 */
async function resendActivationEmail(db, { userId, actorUserId }) {
  return createAccountActivationInvitation(db, { userId, deliveryMethod: "email", actorUserId });
}

module.exports = {
  createServiceError,
  getTtlMinutes,
  validateActivationToken,
  activateAccount,
  assertUserEligibleForActivationInvitation,
  dispatchActivationInvitationEmail,
  dispatchAlreadyActiveNotice,
  createAccountActivationInvitation,
  resendActivationEmail,
};
