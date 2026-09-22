/**
 * Identidade e prevenção de duplicidade/apropriação de conta no
 * checkout público -- ver seção de segurança do plano desta missão.
 * Um visitante anônimo NUNCA pode criar um segundo cadastro para um
 * CPF/e-mail que já pertence a uma conta existente, nem descobrir
 * (por diferença de mensagem de erro) QUAL desses dois campos já
 * existe -- ambos os casos retornam exatamente o mesmo erro genérico.
 */
const { createStudent } = require("../admin/adminStudentService");
const { MIN_SELF_CONTRACTING_AGE } = require("../../config/checkoutConfig");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

const DUPLICATE_IDENTITY_MESSAGE =
  "Não foi possível concluir o cadastro com os dados informados. Se você já possui uma conta, faça login para continuar ou procure a instituição.";

function normalizeCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

/**
 * Cria um novo aluno para o checkout público, ou lança o erro
 * genérico de duplicidade se o e-mail OU o CPF já pertencer a uma
 * conta/aluno existente -- checado explicitamente ANTES de chamar
 * createStudent (que tem sua própria checagem de e-mail único, mas
 * com uma mensagem específica demais para ser exposta aqui: "este
 * e-mail já está cadastrado" revelaria exatamente qual campo bateu).
 * Um catch de defesa em profundidade garante que, mesmo numa corrida
 * rara entre a checagem e o INSERT, nenhuma mensagem específica do
 * createStudent escape para o chamador público.
 */
async function resolveOrCreateCheckoutStudent(db, connection, studentCandidate) {
  const { name, email, birthDate, cpf, phone, address, gender } = studentCandidate || {};

  if (!name?.trim() || !email?.trim() || !birthDate || !cpf?.trim()) {
    throw createServiceError("Nome, e-mail, data de nascimento e CPF são obrigatórios.", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCpf = normalizeCpf(cpf);

  const [emailMatchRows] = await connection.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [
    normalizedEmail,
  ]);

  const [cpfMatchRows] = await connection.query(`SELECT id FROM students WHERE cpf = ? LIMIT 1`, [
    normalizedCpf,
  ]);

  if (emailMatchRows.length > 0 || cpfMatchRows.length > 0) {
    throw createServiceError(DUPLICATE_IDENTITY_MESSAGE, 409);
  }

  try {
    const created = await createStudent(
      db,
      {
        name,
        email: normalizedEmail,
        gender,
        birth_date: birthDate,
        cpf: normalizedCpf,
        phone,
        address,
      },
      { connection, allowNullPassword: true }
    );

    return { studentId: created.id, isNewStudent: true };
  } catch (error) {
    if (error.statusCode === 409) {
      throw createServiceError(DUPLICATE_IDENTITY_MESSAGE, 409);
    }

    throw error;
  }
}

function calculateAge(birthDateValue) {
  const birthDate = new Date(birthDateValue);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

/**
 * Bloqueia contractingPartyMode 'self' para um aluno menor que
 * MIN_SELF_CONTRACTING_AGE -- validação sempre no backend, nunca só
 * no frontend. Um terceiro contratando em nome do menor
 * ('existing'/'new') nunca é bloqueado por esta checagem.
 */
function assertContractingPartyAllowedForAge(birthDate, contractingPartyMode) {
  if (contractingPartyMode !== "self") {
    return;
  }

  const age = calculateAge(birthDate);

  if (age < MIN_SELF_CONTRACTING_AGE) {
    throw createServiceError(
      `Alunos menores de ${MIN_SELF_CONTRACTING_AGE} anos precisam de um responsável como contratante.`,
      422
    );
  }
}

module.exports = {
  createServiceError,
  resolveOrCreateCheckoutStudent,
  assertContractingPartyAllowedForAge,
};
