const bcrypt = require("bcryptjs");

const { requestPasswordReset } = require("../auth/authService");
const { createStudent } = require("./adminStudentService");
const { createTeacher } = require("./adminTeacherService");
const { notifyAdminUserCreated } = require("../notifications/adminUserNotificationService");

const ALLOWED_ROLES = ["admin", "teacher", "student"];
// Nunca setável diretamente por criação/atualização administrativa
// (só o fluxo de contratação/ativação entra e sai desse status) --
// mas precisa aparecer como filtro de listagem, daí o vocabulário
// separado abaixo.
const ALLOWED_STATUSES = ["active", "inactive", "blocked"];
const ALLOWED_STATUS_FILTERS = [...ALLOWED_STATUSES, "pending_activation"];
const ALLOWED_LINKED_ENTITY_TYPES = ["student", "teacher", "none"];

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

function mapUserRow(row) {
  let linkedEntity = null;

  if (row.student_id) {
    linkedEntity = { type: "student", id: row.student_id, displayName: row.student_name };
  } else if (row.teacher_id) {
    linkedEntity = { type: "teacher", id: row.teacher_id, displayName: row.teacher_name };
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    linkedEntity,
    createdAt: row.created_at,
  };
}

function buildListFilters(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(u.name LIKE ? OR u.email LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.role) {
    if (!ALLOWED_ROLES.includes(filters.role)) {
      throw createServiceError("Papel (role) inválido.", 400);
    }

    conditions.push("u.role = ?");
    params.push(filters.role);
  }

  if (filters.status) {
    if (!ALLOWED_STATUS_FILTERS.includes(filters.status)) {
      throw createServiceError("Status inválido.", 400);
    }

    conditions.push("u.status = ?");
    params.push(filters.status);
  }

  if (filters.linkedEntityType) {
    if (!ALLOWED_LINKED_ENTITY_TYPES.includes(filters.linkedEntityType)) {
      throw createServiceError("Tipo de vínculo inválido.", 400);
    }

    if (filters.linkedEntityType === "student") {
      conditions.push("s.id IS NOT NULL");
    } else if (filters.linkedEntityType === "teacher") {
      conditions.push("t.id IS NOT NULL");
    } else {
      conditions.push("s.id IS NULL AND t.id IS NULL");
    }
  }

  return { whereClause: conditions.join(" AND "), params };
}

const BASE_JOIN = `
  FROM users u
  LEFT JOIN students s ON s.user_id = u.id
  LEFT JOIN teachers t ON t.user_id = u.id
`;

const SELECT_COLUMNS = `
  u.id, u.name, u.email, u.role, u.status, u.created_at,
  s.id AS student_id, s.name AS student_name,
  t.id AS teacher_id, t.name AS teacher_name
`;

/**
 * Números globais para os cards — independentes de filtro/paginação.
 */
async function getUsersSummary(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status IN ('inactive', 'blocked') THEN 1 ELSE 0 END) AS inactive_or_blocked,
        SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
        SUM(CASE WHEN role = 'teacher' THEN 1 ELSE 0 END) AS teachers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins
      FROM users
    `
  );

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    active: Number(row.active || 0),
    inactiveOrBlocked: Number(row.inactive_or_blocked || 0),
    students: Number(row.students || 0),
    teachers: Number(row.teachers || 0),
    admins: Number(row.admins || 0),
  };
}

/**
 * Lista usuários com filtros e paginação. linkedEntity vem de um
 * único JOIN em lote (students/teachers), nunca uma query por
 * usuário.
 */
async function listUsers(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [summary, [countRows], [rows]] = await Promise.all([
    getUsersSummary(db),
    db.promise().query(
      `SELECT COUNT(*) AS total ${BASE_JOIN} WHERE ${whereClause}`,
      params
    ),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        WHERE ${whereClause}
        ORDER BY u.name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapUserRow),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getUserById(db, id) {
  const userId = normalizeId(id, "ID do usuário inválido.");

  const [rows] = await db.promise().query(
    `SELECT ${SELECT_COLUMNS} ${BASE_JOIN} WHERE u.id = ? LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    throw createServiceError("Usuário não encontrado.", 404);
  }

  return mapUserRow(rows[0]);
}

async function countActiveAdmins(runner, excludingUserId = null) {
  const params = [];
  let query = `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'`;

  if (excludingUserId) {
    query += ` AND id <> ?`;
    params.push(excludingUserId);
  }

  const [rows] = await runner.query(query, params);

  return Number(rows[0]?.count || 0);
}

/**
 * Cria uma conta de administrador. Contas de aluno/professor têm
 * fluxo próprio já existente (adminStudentService/adminTeacherService,
 * que criam users+entidade juntos numa transação) — este endpoint
 * não duplica isso, serve só para administradores.
 */
async function createAdminUser(db, payload, options = {}) {
  const { actorUserId = null } = options;
  const { name, email, password, status } = payload;

  if (!name?.trim() || !email?.trim() || !password) {
    throw createServiceError("Nome, e-mail e senha são obrigatórios.", 400);
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status inválido.", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [existingRows] = await db
    .promise()
    .query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);

  if (existingRows.length > 0) {
    throw createServiceError("Este e-mail já está cadastrado.", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await db.promise().query(
    `
      INSERT INTO users (name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', ?, NOW(), NOW())
    `,
    [name.trim(), normalizedEmail, passwordHash, normalizedStatus]
  );

  await notifyAdminUserCreated(db, {
    userId: result.insertId,
    userName: name.trim(),
    userRole: "admin",
    origin: "admin",
    actorUserId,
  });

  return getUserById(db, result.insertId);
}

/**
 * Ponto de entrada único do cadastro administrativo de usuários
 * (POST /api/admin/users). Nunca insere direto em `users` com
 * qualquer role -- encaminha para o fluxo transacional já existente
 * de cada papel (createStudent/createTeacher já criam users+entidade
 * na mesma transação; createAdminUser cria só users, que é o
 * suficiente para admin). Isso evita duplicar SQL/regras que já
 * existem em adminStudentService/adminTeacherService, e garante que
 * um admin nunca consiga criar um "professor" ou "aluno" sem o
 * perfil correspondente -- se qualquer etapa falhar, a transação do
 * service delegado já faz rollback completo, sem usuário órfão.
 *
 * A resposta é sempre normalizada pelo mesmo DTO da listagem/detalhe
 * (getUserById), independentemente do papel escolhido.
 */
async function createUser(db, payload, options = {}) {
  const { actorUserId = null } = options;
  const { role } = payload || {};

  if (!ALLOWED_ROLES.includes(role)) {
    throw createServiceError(
      "Papel (role) inválido. Utilize admin, teacher ou student.",
      400
    );
  }

  if (role === "admin") {
    return createAdminUser(db, payload, { actorUserId });
  }

  if (role === "teacher") {
    const teacher = await createTeacher(db, payload, { actorUserId });

    return getUserById(db, teacher.user_id);
  }

  const student = await createStudent(db, payload, { actorUserId });

  return getUserById(db, student.user_id);
}

/**
 * Atualiza nome/e-mail/gênero. Sincroniza o mesmo nome/e-mail na
 * tabela vinculada (students/teachers) na mesma transação — o
 * schema duplica esses campos lá, e deixar de sincronizar criaria
 * divergência entre as telas administrativas. Nunca mexe em senha,
 * role ou status aqui (endpoints dedicados para isso).
 */
async function updateUser(db, id, payload) {
  const userId = normalizeId(id, "ID do usuário inválido.");
  const { name, email, gender } = payload;

  if (!name?.trim() || !email?.trim()) {
    throw createServiceError("Nome e e-mail são obrigatórios.", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [userRows] = await connection.query(
      `SELECT id, role FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      throw createServiceError("Usuário não encontrado.", 404);
    }

    const [existingEmailRows] = await connection.query(
      `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`,
      [normalizedEmail, userId]
    );

    if (existingEmailRows.length > 0) {
      throw createServiceError("Este e-mail já está cadastrado.", 409);
    }

    await connection.query(
      `UPDATE users SET name = ?, email = ?, gender = ?, updated_at = NOW() WHERE id = ?`,
      [name.trim(), normalizedEmail, gender || null, userId]
    );

    await connection.query(
      `UPDATE students SET name = ?, email = ?, gender = ?, updated_at = NOW() WHERE user_id = ?`,
      [name.trim(), normalizedEmail, gender || null, userId]
    );

    await connection.query(
      `UPDATE teachers SET name = ?, email = ?, gender = ?, updated_at = NOW() WHERE user_id = ?`,
      [name.trim(), normalizedEmail, gender || null, userId]
    );

    await connection.commit();

    return getUserById(db, userId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError("Já existe um cadastro com este e-mail.", 409);
    }

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Ativa/inativa/bloqueia. Nunca apaga histórico acadêmico — só a
 * conta de autenticação (o login já rejeita status != 'active').
 * Protegido contra: auto-inativação e remoção do último admin ativo.
 */
async function updateUserStatus(db, id, status, actingUserId) {
  const userId = normalizeId(id, "ID do usuário inválido.");

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createServiceError("Status inválido.", 400);
  }

  const [userRows] = await db
    .promise()
    .query(`SELECT id, role, status FROM users WHERE id = ? LIMIT 1`, [userId]);

  if (userRows.length === 0) {
    throw createServiceError("Usuário não encontrado.", 404);
  }

  const targetUser = userRows[0];
  const isDeactivating = status !== "active";

  if (isDeactivating && Number(actingUserId) === userId) {
    throw createServiceError(
      "Você não pode inativar/bloquear a própria conta por aqui.",
      409
    );
  }

  if (isDeactivating && targetUser.role === "admin") {
    const remainingActiveAdmins = await countActiveAdmins(db.promise(), userId);

    if (remainingActiveAdmins === 0) {
      throw createServiceError(
        "Não é possível inativar o último administrador ativo.",
        409
      );
    }
  }

  await db
    .promise()
    .query(`UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?`, [
      status,
      userId,
    ]);

  return getUserById(db, userId);
}

/**
 * Soft delete = alias de inativação (nunca DELETE físico — cascatearia
 * para students/teachers inteiros, apagando histórico acadêmico).
 */
async function softDeleteUser(db, id, actingUserId) {
  return updateUserStatus(db, id, "inactive", actingUserId);
}

/**
 * Reaproveita o fluxo de recuperação de senha já existente
 * (requestPasswordReset) — nunca gera/retorna senha em texto puro.
 */
async function sendPasswordReset(db, id) {
  const userId = normalizeId(id, "ID do usuário inválido.");

  const [userRows] = await db
    .promise()
    .query(`SELECT email FROM users WHERE id = ? LIMIT 1`, [userId]);

  if (userRows.length === 0) {
    throw createServiceError("Usuário não encontrado.", 404);
  }

  await requestPasswordReset(db, { email: userRows[0].email });

  return { message: "Se a conta existir e estiver ativa, um e-mail de redefinição foi enviado." };
}

module.exports = {
  createServiceError,
  listUsers,
  getUserById,
  createAdminUser,
  createUser,
  updateUser,
  updateUserStatus,
  softDeleteUser,
  sendPasswordReset,
  countActiveAdmins,
  ALLOWED_ROLES,
  ALLOWED_STATUSES,
  ALLOWED_STATUS_FILTERS,
};
