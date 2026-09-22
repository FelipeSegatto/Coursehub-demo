const bcrypt = require("bcryptjs");

const {
  revokeAllUserRefreshTokens,
} = require("../../repositories/authTokens");

/**
 * Cria um erro de negócio com status HTTP associado.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Monta o perfil completo de um usuário (dados de `users` +
 * dados específicos de `students`/`teachers`, conforme o role).
 *
 * Usado tanto por GET /api/profile/me quanto por PATCH /api/profile/me,
 * para nunca duplicar essa lógica. Retorna null se o usuário não existir.
 */
async function getFullProfile(db, userId) {
  const [userRows] = await db.promise().query(
    `
    SELECT id, name, email, gender, role, status, avatar_key, avatar_file_id
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (userRows.length === 0) {
    return null;
  }

  const user = userRows[0];

  const profile = {
    id: user.id,
    name: user.name,
    email: user.email,
    gender: user.gender,
    role: user.role,
    status: user.status,
    avatarKey: user.avatar_key || null,
    avatarFileId: user.avatar_file_id || null,

    phone: null,
    address: null,
    specialty: null,
    cpf: null,
    registrationNumber: null,
    birthDate: null,
    institutionalStatus: null,
  };

  if (user.role === "student") {
    const [studentRows] = await db.promise().query(
      `
      SELECT phone, address, cpf, registration_number, birth_date, status
      FROM students
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (studentRows.length > 0) {
      const student = studentRows[0];

      profile.phone = student.phone || null;
      profile.address = student.address || null;
      profile.cpf = student.cpf || null;
      profile.registrationNumber = student.registration_number || null;
      profile.birthDate = student.birth_date || null;
      profile.institutionalStatus = student.status || null;
    }
  }

  if (user.role === "teacher") {
    const [teacherRows] = await db.promise().query(
      `
      SELECT phone, specialty, cpf, registration_number, status
      FROM teachers
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (teacherRows.length > 0) {
      const teacher = teacherRows[0];

      profile.phone = teacher.phone || null;
      profile.specialty = teacher.specialty || null;
      profile.cpf = teacher.cpf || null;
      profile.registrationNumber = teacher.registration_number || null;
      profile.institutionalStatus = teacher.status || null;
    }
  }

  return profile;
}

/**
 * Atualiza os dados de perfil do usuário autenticado (users +
 * a tabela específica do seu role) em uma única transação.
 */
async function updateProfile(db, { userId, role, payload }) {
  const { name, email, gender, phone, address, specialty } = payload;

  const normalizedName = name?.trim();
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedGender = gender?.trim() || null;

  if (!normalizedName || !normalizedEmail) {
    throw createServiceError("Nome e e-mail são obrigatórios.", 400);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalizedEmail)) {
    throw createServiceError("Informe um e-mail válido.", 400);
  }

  const [emailOwnerRows] = await db.promise().query(
    `
    SELECT id
    FROM users
    WHERE email = ? AND id <> ?
    LIMIT 1
    `,
    [normalizedEmail, userId]
  );

  if (emailOwnerRows.length > 0) {
    throw createServiceError(
      "Este e-mail já está em uso por outra conta.",
      409
    );
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
      UPDATE users
      SET name = ?, email = ?, gender = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [normalizedName, normalizedEmail, normalizedGender, userId]
    );

    if (role === "student") {
      await connection.query(
        `
        UPDATE students
        SET name = ?, email = ?, phone = ?, address = ?, updated_at = NOW()
        WHERE user_id = ?
        `,
        [
          normalizedName,
          normalizedEmail,
          phone?.trim() || null,
          address?.trim() || null,
          userId,
        ]
      );
    }

    if (role === "teacher") {
      await connection.query(
        `
        UPDATE teachers
        SET name = ?, email = ?, phone = ?, specialty = ?, updated_at = NOW()
        WHERE user_id = ?
        `,
        [
          normalizedName,
          normalizedEmail,
          phone?.trim() || null,
          specialty?.trim() || null,
          userId,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError(
        "Este e-mail já está em uso por outra conta.",
        409
      );
    }

    throw error;
  } finally {
    connection.release();
  }

  return getFullProfile(db, userId);
}

/**
 * Atualiza a senha do usuário autenticado e revoga todos os
 * refresh tokens — qualquer outra sessão aberta precisa fazer
 * login de novo, o comportamento esperado numa troca de senha
 * por segurança.
 */
async function updatePassword(db, { userId, currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    throw createServiceError(
      "Senha atual e nova senha são obrigatórias.",
      400
    );
  }

  if (newPassword.length < 6) {
    throw createServiceError(
      "A nova senha deve possuir pelo menos 6 caracteres.",
      400
    );
  }

  const [userRows] = await db.promise().query(
    `
    SELECT password_hash
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (userRows.length === 0) {
    throw createServiceError("Usuário não encontrado.", 404);
  }

  const currentPasswordMatches = await bcrypt.compare(
    currentPassword,
    userRows[0].password_hash
  );

  if (!currentPasswordMatches) {
    throw createServiceError("Senha atual incorreta.", 401);
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await db.promise().query(
    `
    UPDATE users
    SET password_hash = ?, updated_at = NOW()
    WHERE id = ?
    `,
    [newPasswordHash, userId]
  );

  await revokeAllUserRefreshTokens(userId);
}

async function updateAvatar(db, { userId, avatarKey = null, avatarFileId = null }) {
  const { isCatalogAvatarKey } = require("./avatarCatalog");
  const { assertOwnedFile } = require("../files/uploadedFileService");

  let nextKey = null;
  let nextFileId = null;

  if (avatarFileId) {
    await assertOwnedFile(db, {
      fileId: avatarFileId,
      ownerUserId: userId,
      purpose: "avatar",
    });
    nextFileId = Number(avatarFileId);
  } else if (avatarKey) {
    if (!isCatalogAvatarKey(avatarKey)) {
      throw createServiceError("Avatar de catálogo inválido.", 400);
    }

    nextKey = avatarKey;
  } else {
    throw createServiceError("Informe um avatar do catálogo ou o arquivo enviado.", 400);
  }

  await db.promise().query(
    `UPDATE users SET avatar_key = ?, avatar_file_id = ?, updated_at = NOW() WHERE id = ?`,
    [nextKey, nextFileId, userId]
  );

  return getFullProfile(db, userId);
}

module.exports = {
  createServiceError,
  getFullProfile,
  updateProfile,
  updatePassword,
  updateAvatar,
};
