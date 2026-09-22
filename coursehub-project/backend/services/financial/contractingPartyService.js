/**
 * CRUD e resolução de "contratantes" (responsáveis financeiros).
 * Um contracting_party pode ou não ter login no CourseHub (user_id
 * opcional) -- cobre tanto "o próprio aluno paga" (self, sempre
 * vinculado ao user_id do aluno) quanto terceiros (pais, responsáveis,
 * empresas) sem conta nenhuma.
 *
 * Este service nunca escreve em financial_contracts -- quem contrata
 * um contracting_party a um contrato copia um snapshot próprio (ver
 * createStudentContractWithInitialInvoice), então editar um
 * contracting_party aqui nunca altera contratos já criados.
 */
const {
  normalizeDocumentNumber,
  isValidCpf,
  isValidCnpj,
} = require("../../utils/documentValidation");

const ALLOWED_PARTY_TYPES = ["individual", "company"];
const ALLOWED_DOCUMENT_TYPES = ["cpf", "cnpj", "other"];
const ALLOWED_STATUSES = ["active", "inactive"];
const ALLOWED_RELATIONSHIP_TYPES = ["self", "parent", "guardian", "company", "other"];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

function mapContractingPartyRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    partyType: row.party_type,
    name: row.name,
    documentType: row.document_type,
    documentNumber: row.document_number,
    email: row.email,
    phone: row.phone,
    billingAddress: {
      line: row.billing_address_line,
      city: row.billing_address_city,
      state: row.billing_address_state,
      zipCode: row.billing_address_zip_code,
    },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id, user_id, party_type, name, document_type, document_number, email, phone,
  billing_address_line, billing_address_city, billing_address_state, billing_address_zip_code,
  status, created_at, updated_at
`;

function buildListFilters(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(name LIKE ? OR document_number LIKE ? OR email LIKE ?)");
    const normalizedSearchDocument = normalizeDocumentNumber(search);
    params.push(`%${search}%`, `%${normalizedSearchDocument || search}%`, `%${search}%`);
  }

  if (filters.status) {
    if (!ALLOWED_STATUSES.includes(filters.status)) {
      throw createServiceError("Status inválido.", 400);
    }

    conditions.push("status = ?");
    params.push(filters.status);
  }

  return { whereClause: conditions.join(" AND "), params };
}

async function listContractingParties(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [[countRows], [rows]] = await Promise.all([
    db.promise().query(
      `SELECT COUNT(*) AS total FROM contracting_parties WHERE ${whereClause}`,
      params
    ),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        FROM contracting_parties
        WHERE ${whereClause}
        ORDER BY name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapContractingPartyRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getContractingPartyById(db, id) {
  const normalizedId = normalizeId(id, "ID do contratante inválido.");

  const [rows] = await db
    .promise()
    .query(`SELECT ${SELECT_COLUMNS} FROM contracting_parties WHERE id = ? LIMIT 1`, [
      normalizedId,
    ]);

  if (rows.length === 0) {
    throw createServiceError("Contratante não encontrado.", 404);
  }

  return mapContractingPartyRow(rows[0]);
}

/**
 * Valida e normaliza o payload de criação/edição. document_number é
 * sempre normalizado para dígitos puros antes de validar/gravar --
 * nunca guardamos a máscara (000.000.000-00) no banco.
 */
function normalizeAndValidatePayload(payload) {
  const {
    party_type,
    name,
    document_type,
    document_number,
    email,
    phone,
    billing_address_line,
    billing_address_city,
    billing_address_state,
    billing_address_zip_code,
    status,
  } = payload || {};

  if (!ALLOWED_PARTY_TYPES.includes(party_type)) {
    throw createServiceError(
      "Tipo de contratante inválido. Utilize individual ou company.",
      400
    );
  }

  const trimmedName = name?.trim();

  if (!trimmedName) {
    throw createServiceError("O nome do contratante é obrigatório.", 400);
  }

  if (!ALLOWED_DOCUMENT_TYPES.includes(document_type)) {
    throw createServiceError("Tipo de documento inválido.", 400);
  }

  const normalizedDocumentNumber = normalizeDocumentNumber(document_number);

  if (!normalizedDocumentNumber) {
    throw createServiceError("O documento do contratante é obrigatório.", 400);
  }

  if (document_type === "cpf" && !isValidCpf(normalizedDocumentNumber)) {
    throw createServiceError("CPF inválido.", 400);
  }

  if (document_type === "cnpj" && !isValidCnpj(normalizedDocumentNumber)) {
    throw createServiceError("CNPJ inválido.", 400);
  }

  const trimmedEmail = email?.trim();

  if (!trimmedEmail) {
    throw createServiceError("O e-mail de cobrança é obrigatório.", 400);
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status inválido.", 400);
  }

  return {
    partyType: party_type,
    name: trimmedName,
    documentType: document_type,
    documentNumber: normalizedDocumentNumber,
    email: trimmedEmail,
    phone: phone?.trim() || null,
    billingAddressLine: billing_address_line?.trim() || null,
    billingAddressCity: billing_address_city?.trim() || null,
    billingAddressState: billing_address_state?.trim().toUpperCase().slice(0, 2) || null,
    billingAddressZipCode: billing_address_zip_code?.trim() || null,
    status: normalizedStatus,
  };
}

async function assertDocumentNotDuplicated(
  connection,
  { documentType, documentNumber, excludingPartyId = null }
) {
  const params = [documentType, documentNumber];
  let query = `SELECT id FROM contracting_parties WHERE document_type = ? AND document_number = ?`;

  if (excludingPartyId) {
    query += ` AND id <> ?`;
    params.push(excludingPartyId);
  }

  const [rows] = await connection.query(`${query} LIMIT 1`, params);

  if (rows.length > 0) {
    throw createServiceError(
      "Já existe um contratante cadastrado com este documento.",
      409
    );
  }
}

async function assertUserNotAlreadyLinked(connection, { userId, excludingPartyId = null }) {
  if (!userId) return;

  const params = [userId];
  let query = `SELECT id FROM contracting_parties WHERE user_id = ?`;

  if (excludingPartyId) {
    query += ` AND id <> ?`;
    params.push(excludingPartyId);
  }

  const [rows] = await connection.query(`${query} LIMIT 1`, params);

  if (rows.length > 0) {
    throw createServiceError("Este usuário já possui um cadastro de contratante.", 409);
  }
}

/**
 * Criação via CRUD administrativo (contratante avulso, cadastrado
 * fora do wizard de contrato). user_id nunca é aceito do payload --
 * um contratante criado por aqui nasce sem login (vínculo com
 * usuário só acontece pelo fluxo "o aluno é o próprio responsável",
 * ver findOrCreateSelfContractingPartyForStudent).
 */
async function createContractingParty(db, payload) {
  const normalized = normalizeAndValidatePayload(payload);

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    await assertDocumentNotDuplicated(connection, {
      documentType: normalized.documentType,
      documentNumber: normalized.documentNumber,
    });

    const [result] = await connection.query(
      `
        INSERT INTO contracting_parties
          (user_id, party_type, name, document_type, document_number, email, phone,
           billing_address_line, billing_address_city, billing_address_state,
           billing_address_zip_code, status, created_at, updated_at)
        VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        normalized.partyType,
        normalized.name,
        normalized.documentType,
        normalized.documentNumber,
        normalized.email,
        normalized.phone,
        normalized.billingAddressLine,
        normalized.billingAddressCity,
        normalized.billingAddressState,
        normalized.billingAddressZipCode,
        normalized.status,
      ]
    );

    await connection.commit();

    return getContractingPartyById(db, result.insertId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError(
        "Já existe um contratante cadastrado com este documento.",
        409
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function updateContractingParty(db, id, payload) {
  const normalizedId = normalizeId(id, "ID do contratante inválido.");
  const normalized = normalizeAndValidatePayload(payload);

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT id FROM contracting_parties WHERE id = ? LIMIT 1 FOR UPDATE`,
      [normalizedId]
    );

    if (existingRows.length === 0) {
      throw createServiceError("Contratante não encontrado.", 404);
    }

    await assertDocumentNotDuplicated(connection, {
      documentType: normalized.documentType,
      documentNumber: normalized.documentNumber,
      excludingPartyId: normalizedId,
    });

    await connection.query(
      `
        UPDATE contracting_parties
        SET
          party_type = ?, name = ?, document_type = ?, document_number = ?, email = ?,
          phone = ?, billing_address_line = ?, billing_address_city = ?,
          billing_address_state = ?, billing_address_zip_code = ?, status = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
        normalized.partyType,
        normalized.name,
        normalized.documentType,
        normalized.documentNumber,
        normalized.email,
        normalized.phone,
        normalized.billingAddressLine,
        normalized.billingAddressCity,
        normalized.billingAddressState,
        normalized.billingAddressZipCode,
        normalized.status,
        normalizedId,
      ]
    );

    await connection.commit();

    return getContractingPartyById(db, normalizedId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError(
        "Já existe um contratante cadastrado com este documento.",
        409
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Qualquer um destes campos presentes no payload é rejeitado com 400
// -- nunca silenciosamente ignorado -- para deixar claro que este
// endpoint de contato nunca é uma porta alternativa para editar
// dados jurídicos do contratante.
const FORBIDDEN_CONTACT_FIELDS = [
  "partyType",
  "party_type",
  "name",
  "documentType",
  "document_type",
  "documentNumber",
  "document_number",
  "status",
  "userId",
  "user_id",
];

/**
 * Atualiza SOMENTE e-mail e telefone do cadastro mestre de um
 * contratante -- nunca nome, documento, tipo, status ou vínculo com
 * usuário. Diferente de updateContractingParty (PUT completo), esta
 * função não aceita nenhum campo jurídico, então não existe payload
 * capaz de acidentalmente reescrever CPF/CNPJ por aqui. Nunca toca em
 * financial_contracts -- contratos já criados guardam seu próprio
 * snapshot (contracting_party_name/document/email/phone/address) e
 * esse snapshot é imutável por design (ver createStudentContractWithInitialInvoice),
 * então editar o cadastro atual do contratante nunca reescreve
 * retroativamente um contrato já existente.
 */
async function updateContractingPartyContact(db, id, payload) {
  const normalizedId = normalizeId(id, "ID do contratante inválido.");

  const forbiddenFieldPresent = FORBIDDEN_CONTACT_FIELDS.find(
    (field) => payload && Object.prototype.hasOwnProperty.call(payload, field)
  );

  if (forbiddenFieldPresent) {
    throw createServiceError(
      "Este endpoint só permite alterar e-mail e telefone. Nome, documento, tipo e status não podem ser alterados por aqui.",
      400
    );
  }

  const rawEmail = payload?.email;
  const rawPhone = payload?.phone;

  const trimmedEmail = typeof rawEmail === "string" ? rawEmail.trim() : "";

  if (!trimmedEmail) {
    throw createServiceError("O e-mail é obrigatório.", 400);
  }

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    throw createServiceError("Informe um e-mail válido.", 400);
  }

  const trimmedPhone = typeof rawPhone === "string" ? rawPhone.trim() : "";
  const normalizedPhone = trimmedPhone || null;

  const [result] = await db
    .promise()
    .query(
      `UPDATE contracting_parties SET email = ?, phone = ?, updated_at = NOW() WHERE id = ?`,
      [trimmedEmail, normalizedPhone, normalizedId]
    );

  if (result.affectedRows === 0) {
    throw createServiceError("Contratante não encontrado.", 404);
  }

  return getContractingPartyById(db, normalizedId);
}

async function updateContractingPartyStatus(db, id, status) {
  const normalizedId = normalizeId(id, "ID do contratante inválido.");

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createServiceError("Status inválido.", 400);
  }

  const [result] = await db
    .promise()
    .query(`UPDATE contracting_parties SET status = ?, updated_at = NOW() WHERE id = ?`, [
      status,
      normalizedId,
    ]);

  if (result.affectedRows === 0) {
    throw createServiceError("Contratante não encontrado.", 404);
  }

  return getContractingPartyById(db, normalizedId);
}

/**
 * Busca (por nome/documento/e-mail) usada pelo passo 2 do wizard de
 * contrato para localizar um contratante terceiro já existente.
 * Só retorna contratantes ativos -- um contratante inativo não deve
 * aparecer como opção para um novo contrato.
 */
async function searchActiveContractingParties(db, term) {
  const trimmedTerm = term?.trim();

  if (!trimmedTerm) {
    return [];
  }

  const normalizedDocument = normalizeDocumentNumber(trimmedTerm);

  const [rows] = await db.promise().query(
    `
      SELECT ${SELECT_COLUMNS}
      FROM contracting_parties
      WHERE status = 'active'
        AND (name LIKE ? OR document_number LIKE ? OR email LIKE ?)
      ORDER BY name ASC
      LIMIT 20
    `,
    [`%${trimmedTerm}%`, `%${normalizedDocument || trimmedTerm}%`, `%${trimmedTerm}%`]
  );

  return rows.map(mapContractingPartyRow);
}

/**
 * Encontra (ou cria) o contracting_party 'self' de um aluno -- usado
 * quando o modo do wizard é "o aluno é o próprio responsável
 * financeiro". Roda DENTRO da transação do chamador (createStudentContractWithInitialInvoice),
 * por isso recebe `connection`, nunca `db`.
 */
async function findOrCreateSelfContractingPartyForStudent(
  connection,
  { studentId }
) {
  /*
   * ==========================================================
   * 1. O ALUNO JÁ POSSUI UM CONTRATANTE "SELF"?
   * ==========================================================
   */
  const [existingLinkRows] =
    await connection.query(
      `
        SELECT
          cp.id

        FROM student_contracting_parties scp

        INNER JOIN contracting_parties cp
          ON cp.id = scp.contracting_party_id

        WHERE scp.student_id = ?
          AND scp.relationship_type = 'self'

        LIMIT 1
      `,
      [studentId]
    );


  if (existingLinkRows.length > 0) {
    return existingLinkRows[0].id;
  }


  /*
   * ==========================================================
   * 2. CARREGA O ALUNO
   * ==========================================================
   */
  const [studentRows] =
    await connection.query(
      `
        SELECT
          id,
          user_id,
          name,
          email,
          phone,
          cpf,
          address

        FROM students

        WHERE id = ?

        LIMIT 1
      `,
      [studentId]
    );


  if (studentRows.length === 0) {
    throw createServiceError(
      "Aluno não encontrado.",
      404
    );
  }


  const student =
    studentRows[0];


  const normalizedCpf =
    normalizeDocumentNumber(
      student.cpf
    );


  /*
   * ==========================================================
   * 3. PROCURA PELO USER_ID
   * ==========================================================
   *
   * Caso normal:
   *
   * esse usuário já possui seu registro em
   * contracting_parties.
   */
  const [existingPartyByUserRows] =
    await connection.query(
      `
        SELECT
          id

        FROM contracting_parties

        WHERE user_id = ?

        LIMIT 1
      `,
      [student.user_id]
    );


  let contractingPartyId;


  if (
    existingPartyByUserRows.length > 0
  ) {
    contractingPartyId =
      existingPartyByUserRows[0].id;

  } else {

    /*
     * ========================================================
     * 4. PROCURA PELO CPF
     * ========================================================
     *
     * IMPORTANTE:
     *
     * Pode existir um contracting_party antigo com o mesmo CPF
     * mas ainda sem vínculo com o usuário recém-criado.
     *
     * Antes, o código tentava INSERT direto.
     *
     * Como existe:
     *
     * UNIQUE(document_type, document_number)
     *
     * isso causava:
     *
     * ER_DUP_ENTRY
     */
    const [existingPartyByDocumentRows] =
      await connection.query(
        `
          SELECT
            id,
            user_id

          FROM contracting_parties

          WHERE document_type = 'cpf'
            AND document_number = ?

          LIMIT 1
        `,
        [normalizedCpf]
      );


    /*
     * ========================================================
     * 5. CPF JÁ EXISTE
     * ========================================================
     */
    if (
      existingPartyByDocumentRows.length >
      0
    ) {
      const existingParty =
        existingPartyByDocumentRows[0];


      contractingPartyId =
        existingParty.id;


      /*
       * Se esse contracting_party ainda não possui user_id,
       * podemos vinculá-lo ao usuário atual.
       *
       * NÃO sobrescrevemos um user_id diferente, pois isso
       * poderia tomar a identidade financeira de outra conta.
       */
      if (
        existingParty.user_id === null
      ) {
        await connection.query(
          `
            UPDATE contracting_parties

            SET
              user_id = ?,
              name = ?,
              email = ?,
              phone = ?,
              billing_address_line =
                COALESCE(?, billing_address_line),
              status = 'active',
              updated_at = NOW()

            WHERE id = ?
          `,
          [
            student.user_id,
            student.name,
            student.email,
            student.phone,
            student.address,
            existingParty.id,
          ]
        );

      } else if (
        Number(existingParty.user_id) !==
        Number(student.user_id)
      ) {

        /*
         * O CPF pertence a outro usuário.
         *
         * Não criamos duplicata e não roubamos o registro.
         */
        throw createServiceError(
          "Já existe um responsável financeiro vinculado a este CPF. Utilize os dados da conta existente ou procure a instituição.",
          409
        );
      }

    } else {

      /*
       * ======================================================
       * 6. NÃO EXISTE NADA: CRIA
       * ======================================================
       */
      const [result] =
        await connection.query(
          `
            INSERT INTO contracting_parties
            (
              user_id,
              party_type,
              name,
              document_type,
              document_number,
              email,
              phone,
              billing_address_line,
              status,
              created_at,
              updated_at
            )

            VALUES
            (
              ?,
              'individual',
              ?,
              'cpf',
              ?,
              ?,
              ?,
              ?,
              'active',
              NOW(),
              NOW()
            )
          `,
          [
            student.user_id,
            student.name,
            normalizedCpf,
            student.email,
            student.phone,
            student.address,
          ]
        );


      contractingPartyId =
        result.insertId;
    }
  }


  /*
   * ==========================================================
   * 7. VINCULA O ALUNO AO CONTRATANTE
   * ==========================================================
   */
  await connection.query(
    `
      INSERT INTO student_contracting_parties
      (
        student_id,
        contracting_party_id,
        relationship_type,
        is_primary,
        created_at
      )

      VALUES
      (
        ?,
        ?,
        'self',
        1,
        NOW()
      )

      ON DUPLICATE KEY UPDATE

        relationship_type =
          VALUES(relationship_type),

        is_primary = 1
    `,
    [
      studentId,
      contractingPartyId,
    ]
  );


  return contractingPartyId;
}

/**
 * Vincula um contratante terceiro (já existente ou recém-criado pelo
 * wizard) a um aluno. Roda dentro da transação do chamador.
 */
async function linkStudentToContractingParty(
  connection,
  { studentId, contractingPartyId, relationshipType, isPrimary = false }
) {
  if (!ALLOWED_RELATIONSHIP_TYPES.includes(relationshipType)) {
    throw createServiceError("Tipo de relação com o contratante inválido.", 400);
  }

  if (isPrimary) {
    await connection.query(
      `UPDATE student_contracting_parties SET is_primary = 0 WHERE student_id = ?`,
      [studentId]
    );
  }

  await connection.query(
    `
      INSERT INTO student_contracting_parties
        (student_id, contracting_party_id, relationship_type, is_primary, created_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE relationship_type = VALUES(relationship_type), is_primary = VALUES(is_primary)
    `,
    [studentId, contractingPartyId, relationshipType, isPrimary ? 1 : 0]
  );
}

/**
 * Cria um contratante terceiro DENTRO da transação do chamador (passo
 * "novo contratante" do wizard) -- mesma validação da criação
 * administrativa, mas sem abrir sua própria transação/conexão.
 */
async function createContractingPartyWithConnection(connection, payload) {
  const normalized = normalizeAndValidatePayload(payload);

  await assertDocumentNotDuplicated(connection, {
    documentType: normalized.documentType,
    documentNumber: normalized.documentNumber,
  });

  const [result] = await connection.query(
    `
      INSERT INTO contracting_parties
        (user_id, party_type, name, document_type, document_number, email, phone,
         billing_address_line, billing_address_city, billing_address_state,
         billing_address_zip_code, status, created_at, updated_at)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      normalized.partyType,
      normalized.name,
      normalized.documentType,
      normalized.documentNumber,
      normalized.email,
      normalized.phone,
      normalized.billingAddressLine,
      normalized.billingAddressCity,
      normalized.billingAddressState,
      normalized.billingAddressZipCode,
      normalized.status,
    ]
  );

  return result.insertId;
}

module.exports = {
  createServiceError,
  ALLOWED_PARTY_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_STATUSES,
  ALLOWED_RELATIONSHIP_TYPES,
  listContractingParties,
  getContractingPartyById,
  createContractingParty,
  updateContractingParty,
  updateContractingPartyContact,
  updateContractingPartyStatus,
  searchActiveContractingParties,
  findOrCreateSelfContractingPartyForStudent,
  linkStudentToContractingParty,
  createContractingPartyWithConnection,
};
