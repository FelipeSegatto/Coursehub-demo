const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const authorizeRoles = require("../../middlewares/authorizeRoles");

const {
  listContractingParties,
  getContractingPartyById,
  createContractingParty,
  updateContractingPartyContact,
} = require("../../services/financial/contractingPartyService");

const {
  createStudentContractWithInitialInvoice,
} = require("../../services/financial/contractCreationService");

const COURSE_NAME = "TEST CONTRACTING PARTY CONTACT COURSE";
const RUN_ID = Date.now();

let courseId;
let planId;
let adminUserId;

const createdPartyIds = [];

// contracting_parties.document_number passa por isValidCpf (dígito
// verificador real) -- diferente de students.cpf (sem validação de
// checksum), então precisamos gerar um CPF com dígitos verificadores
// corretos, não só 11 dígitos quaisquer.
function calculateCpfCheckDigit(digits, length) {
  let sum = 0;

  for (let i = 0; i < length; i += 1) {
    sum += digits[i] * (length + 1 - i);
  }

  const remainder = (sum * 10) % 11;

  return remainder === 10 ? 0 : remainder;
}

function testCpf(sequence) {
  const raw = (String(RUN_ID).slice(-5) + String(sequence).padStart(4, "0")).slice(0, 9);
  const baseDigits = raw.split("").map(Number);

  const d1 = calculateCpfCheckDigit(baseDigits, 9);
  const withD1 = [...baseDigits, d1];
  const d2 = calculateCpfCheckDigit(withD1, 10);

  return [...withD1, d2].join("");
}

function testEmail(label) {
  return `contracting.contact.${RUN_ID}.${label}@example.com`;
}

async function purgeCourseData(targetCourseId) {
  const [contracts] = await db
    .promise()
    .query(`SELECT id, enrollment_id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const contract of contracts) {
    // Fecha o status ANTES de tocar em qualquer FK -- enquanto a
    // fatura estiver pending/processing/overdue, o worker de
    // lembretes (rodando concorrentemente em outro processo de
    // teste) pode reinserir uma invoice_collection_actions entre o
    // DELETE abaixo e o DELETE FROM invoices final, recriando o
    // bloqueio de FK. 'cancelled' é permanentemente inelegível para
    // aquele scan.
    await db
      .promise()
      .query(
        `UPDATE invoices i INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id SET i.status = 'cancelled' WHERE fc.id = ?`,
        [contract.id]
      );

    await db
      .promise()
      .query(
        `DELETE ica FROM invoice_collection_actions ica INNER JOIN invoices i ON i.id = ica.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );

    await db
      .promise()
      .query(
        `DELETE t FROM invoice_payment_access_tokens t INNER JOIN invoices i ON i.id = t.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );

    await db
      .promise()
      .query(
        `DELETE s FROM invoice_payment_sessions s INNER JOIN invoices i ON i.id = s.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );

    // account_activation_invitation_created (disparado após a
    // ativação do contrato) é ancorado só em enrollment_id, com
    // financial_contract_id NULL.
    await db
      .promise()
      .query(`DELETE FROM financial_events WHERE financial_contract_id = ? OR enrollment_id = ?`, [
        contract.id,
        contract.enrollment_id,
      ]);

    await db
      .promise()
      .query(
        `DELETE pe FROM payment_events pe INNER JOIN payments p ON p.id = pe.payment_id INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );

    await db
      .promise()
      .query(
        `DELETE p FROM payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );
    await db
      .promise()
      .query(`UPDATE financial_contracts SET activation_invoice_id = NULL, enrollment_id = NULL WHERE id = ?`, [
        contract.id,
      ]);
    await db.promise().query(`DELETE FROM invoices WHERE financial_contract_id = ?`, [contract.id]);
  }

  const [studentsFromContracts] = await db
    .promise()
    .query(`SELECT DISTINCT student_id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const row of studentsFromContracts) {
    const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [row.student_id]);

    if (studentRows.length === 0) continue;

    const userId = studentRows[0].user_id;

    await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [row.student_id]);
    await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [userId]);
    await db.promise().query(`DELETE FROM students WHERE id = ?`, [row.student_id]);
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [userId]);
  }

  await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM courses WHERE id = ?`, [targetCourseId]);
}

before(async () => {
  const [staleCourses] = await db.promise().query(`SELECT id FROM courses WHERE name = ?`, [COURSE_NAME]);
  for (const course of staleCourses) {
    await purgeCourseData(course.id);
  }

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (contato do contratante)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
    `,
    [COURSE_NAME]
  );
  courseId = courseResult.insertId;

  const [planResult] = await db.promise().query(
    `
      INSERT INTO course_pricing_plans
        (course_id, name, description, billing_type, total_amount, monthly_payment_count,
         monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
         accepts_credit_card, status, created_at, updated_at)
      VALUES (?, 'Plano de teste', NULL, 'one_time', 300.00, NULL, NULL, 1, 1, 1, 1, 'active', NOW(), NOW())
    `,
    [courseId]
  );
  planId = planResult.insertId;
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData(courseId));

  for (const partyId of createdPartyIds) {
    await db.promise().query(`DELETE FROM contracting_parties WHERE id = ?`, [partyId]);
  }

  await db.promise().end();
});

test("listContractingParties: administrador consegue listar contratantes, com paginação e filtro de busca funcionando", async () => {
  const partyA = await createContractingParty(db, {
    party_type: "individual",
    name: `Contratante ${RUN_ID} Listagem A`,
    document_type: "cpf",
    document_number: testCpf(1),
    email: testEmail("list-a"),
  });
  createdPartyIds.push(partyA.id);

  const partyB = await createContractingParty(db, {
    party_type: "individual",
    name: `Contratante ${RUN_ID} Listagem B`,
    document_type: "cpf",
    document_number: testCpf(2),
    email: testEmail("list-b"),
  });
  createdPartyIds.push(partyB.id);

  const filteredResult = await listContractingParties(db, {
    search: `Contratante ${RUN_ID} Listagem A`,
  });

  assert.equal(filteredResult.data.length, 1);
  assert.equal(filteredResult.data[0].id, partyA.id);

  const paginatedResult = await listContractingParties(db, {
    search: `Contratante ${RUN_ID} Listagem`,
    page: 1,
    limit: 1,
  });

  assert.equal(paginatedResult.data.length, 1);
  assert.equal(paginatedResult.pagination.total, 2);
  assert.equal(paginatedResult.pagination.totalPages, 2);

  const secondPageResult = await listContractingParties(db, {
    search: `Contratante ${RUN_ID} Listagem`,
    page: 2,
    limit: 1,
  });

  assert.equal(secondPageResult.data.length, 1);
  assert.notEqual(secondPageResult.data[0].id, paginatedResult.data[0].id);
});

test("autorização: authorizeRoles(admin) recusa quem não é admin e quem não está autenticado", () => {
  const middleware = authorizeRoles("admin");

  let statusCode = null;
  let jsonBody = null;
  let nextCalled = false;

  function buildRes() {
    return {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };
  }

  middleware({}, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 401);
  assert.ok(jsonBody.message);
  assert.equal(nextCalled, false);

  statusCode = null;
  jsonBody = null;
  middleware({ auth: { userId: 1, role: "teacher" } }, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);

  nextCalled = false;
  middleware({ auth: { userId: adminUserId, role: "admin" } }, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("updateContractingPartyContact: administrador altera e-mail e telefone", async () => {
  const party = await createContractingParty(db, {
    party_type: "individual",
    name: `Contratante Contato ${RUN_ID}`,
    document_type: "cpf",
    document_number: testCpf(3),
    email: testEmail("before-update"),
    phone: "11900000001",
  });
  createdPartyIds.push(party.id);

  const updated = await updateContractingPartyContact(db, party.id, {
    email: `  ${testEmail("after-update")}  `,
    phone: "11988887777",
  });

  assert.equal(updated.email, testEmail("after-update"));
  assert.equal(updated.phone, "11988887777");
  assert.equal(updated.name, party.name);
  assert.equal(updated.documentNumber, party.documentNumber);
  assert.equal(updated.status, party.status);

  const reloaded = await getContractingPartyById(db, party.id);
  assert.equal(reloaded.email, testEmail("after-update"));
  assert.equal(reloaded.phone, "11988887777");
});

test("updateContractingPartyContact: telefone pode ser removido quando permitido", async () => {
  const party = await createContractingParty(db, {
    party_type: "individual",
    name: `Contratante Sem Telefone ${RUN_ID}`,
    document_type: "cpf",
    document_number: testCpf(4),
    email: testEmail("phone-removal"),
    phone: "11900000002",
  });
  createdPartyIds.push(party.id);

  const updated = await updateContractingPartyContact(db, party.id, {
    email: party.email,
    phone: "",
  });

  assert.equal(updated.phone, null);
});

test("updateContractingPartyContact: contratante inexistente retorna 404", async () => {
  await assert.rejects(
    () => updateContractingPartyContact(db, 999999999, { email: testEmail("missing"), phone: "" }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test("updateContractingPartyContact: e-mail vazio ou inválido retorna 400", async () => {
  const party = await createContractingParty(db, {
    party_type: "individual",
    name: `Contratante Validacao Email ${RUN_ID}`,
    document_type: "cpf",
    document_number: testCpf(5),
    email: testEmail("email-validation"),
  });
  createdPartyIds.push(party.id);

  await assert.rejects(
    () => updateContractingPartyContact(db, party.id, { email: "", phone: "" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  await assert.rejects(
    () => updateContractingPartyContact(db, party.id, { email: "nao-e-um-email", phone: "" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  // Nenhuma das duas tentativas inválidas alterou o cadastro.
  const reloaded = await getContractingPartyById(db, party.id);
  assert.equal(reloaded.email, party.email);
});

test("updateContractingPartyContact: CPF/CNPJ, nome e tipo não podem ser alterados por este endpoint", async () => {
  const party = await createContractingParty(db, {
    party_type: "individual",
    name: `Contratante Campos Juridicos ${RUN_ID}`,
    document_type: "cpf",
    document_number: testCpf(6),
    email: testEmail("legal-fields"),
  });
  createdPartyIds.push(party.id);

  await assert.rejects(
    () =>
      updateContractingPartyContact(db, party.id, {
        email: testEmail("legal-fields-attempt"),
        phone: "",
        name: "Nome Trocado Indevidamente",
        document_number: "99999999999",
        party_type: "company",
        status: "inactive",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  const reloaded = await getContractingPartyById(db, party.id);
  assert.equal(reloaded.name, party.name);
  assert.equal(reloaded.documentNumber, party.documentNumber);
  assert.equal(reloaded.partyType, party.partyType);
  assert.equal(reloaded.status, party.status);
  assert.equal(reloaded.email, party.email);
});

test("updateContractingPartyContact: snapshot de contrato existente permanece intacto, e nenhum documento é regenerado", async () => {
  const party = await createContractingParty(db, {
    party_type: "individual",
    name: `Contratante Snapshot ${RUN_ID}`,
    document_type: "cpf",
    document_number: testCpf(7),
    email: testEmail("snapshot-original"),
    phone: "11900000003",
  });
  createdPartyIds.push(party.id);

  const contractResult = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Snapshot",
        email: testEmail("snapshot-student"),
        birth_date: "2000-05-01",
        cpf: testCpf(8),
        phone: "11999990008",
      },
      contractingPartyMode: "existing",
      contractingPartyId: party.id,
      contractingPartyData: { relationshipType: "parent" },
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const [beforeRows] = await db
    .promise()
    .query(
      `SELECT contracting_party_name, contracting_party_document, contracting_party_email, contracting_party_phone FROM financial_contracts WHERE id = ?`,
      [contractResult.contractId]
    );

  assert.equal(beforeRows[0].contracting_party_email, party.email);

  const [documentCountBeforeRows] = await db.promise().query(`SELECT COUNT(*) AS total FROM generated_documents`);

  await updateContractingPartyContact(db, party.id, {
    email: testEmail("snapshot-after-update"),
    phone: "11977776666",
  });

  const [afterRows] = await db
    .promise()
    .query(
      `SELECT contracting_party_name, contracting_party_document, contracting_party_email, contracting_party_phone FROM financial_contracts WHERE id = ?`,
      [contractResult.contractId]
    );

  // O snapshot do contrato continua com o e-mail/telefone ORIGINAIS,
  // nunca os novos valores gravados no cadastro mestre.
  assert.deepEqual(afterRows[0], beforeRows[0]);
  assert.equal(afterRows[0].contracting_party_email, party.email);
  assert.notEqual(afterRows[0].contracting_party_email, testEmail("snapshot-after-update"));

  const [documentCountAfterRows] = await db.promise().query(`SELECT COUNT(*) AS total FROM generated_documents`);
  assert.equal(Number(documentCountAfterRows[0].total), Number(documentCountBeforeRows[0].total));

  const reloadedParty = await getContractingPartyById(db, party.id);
  assert.equal(reloadedParty.email, testEmail("snapshot-after-update"));
  assert.equal(reloadedParty.phone, "11977776666");
});
