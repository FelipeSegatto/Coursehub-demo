const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
require("../../services/notifications/eventDefinitions"); // registers admin.user.created

const {
  createUser,
  countActiveAdmins,
} = require("../../services/admin/adminUserService");
const { createStudent } = require("../../services/admin/adminStudentService");

// Admins reais/ativos já usados como fixture em outros arquivos desta
// suíte (ver chatAdministrativeSupport.test.js) -- 42 Felipe Segatto,
// 43 Larissa Almeida.
const ADMIN_A_USER_ID = 42;
const ADMIN_B_USER_ID = 43;

async function getAdminUserCreatedNotification(userId) {
  const [rows] = await db
    .promise()
    .query(
      `SELECT id, actor_user_id, category FROM notifications WHERE source_type = 'user' AND source_id = ? AND type = 'admin.user.created' LIMIT 1`,
      [userId]
    );

  return rows[0] || null;
}

async function cleanupUserCreatedNotification(notificationId) {
  if (!notificationId) return;

  await retryOnDeadlock(() =>
    db
      .promise()
      .query(
        `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id = ?)`,
        [notificationId]
      )
  );
  await retryOnDeadlock(() =>
    db.promise().query(`DELETE FROM notification_recipients WHERE notification_id = ?`, [notificationId])
  );
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM notifications WHERE id = ?`, [notificationId]));
}

// E-mails únicos por execução (timestamp) -- cada teste que cria um
// usuário registra o user_id retornado em createdUserIds para
// limpeza garantida, independentemente de qual tabela (students/
// teachers) acabou recebendo a linha de perfil.
const RUN_ID = Date.now();
const createdUserIds = [];

function testEmail(label) {
  return `test.usercreation.${RUN_ID}.${label}@example.com`;
}

// students.cpf and teachers.cpf are both UNIQUE -- "111.111.111-11"/
// "222.222.222-22"-style placeholder CPFs turned out to already
// belong to real seeded students, so every CPF here is instead
// derived from RUN_ID to guarantee it never collides with real data
// or with another run of this file.
let cpfCounter = 0;

function testCpf() {
  cpfCounter += 1;

  return `TST${RUN_ID}${cpfCounter}`.slice(0, 20);
}

async function cleanupUser(userId) {
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM students WHERE user_id = ?`, [userId]));
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM teachers WHERE user_id = ?`, [userId]));
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM users WHERE id = ?`, [userId]));
}

const createdNotificationIds = [];

after(async () => {
  for (const notificationId of createdNotificationIds) {
    await cleanupUserCreatedNotification(notificationId);
  }

  for (const userId of createdUserIds) {
    await cleanupUser(userId);
  }

  // Backstop -- qualquer e-mail deste run que não tenha sido
  // registrado em createdUserIds (ex.: um teste que falhou antes de
  // conseguir dar push no array) ainda é limpo por padrão de e-mail.
  const [leftoverRows] = await db
    .promise()
    .query(`SELECT id FROM users WHERE email LIKE ?`, [`test.usercreation.${RUN_ID}.%`]);

  for (const row of leftoverRows) {
    await cleanupUser(row.id);
  }

  await db.promise().end();
});

test("creates an admin user (users only, no linked entity)", async () => {
  const user = await createUser(db, {
    role: "admin",
    name: "Test Admin User",
    email: testEmail("admin"),
    password: "senha123",
    status: "active",
  });

  createdUserIds.push(user.id);

  assert.equal(user.role, "admin");
  assert.equal(user.linkedEntity, null);
});

test("creates a teacher user with users + teachers rows in the same transaction", async () => {
  const user = await createUser(db, {
    role: "teacher",
    name: "Test Teacher User",
    email: testEmail("teacher"),
    password: "senha123",
    gender: "Feminino",
    specialty: "Testes automatizados",
    cpf: testCpf(),
    phone: "(11) 91111-1111",
    // "inactive" de propósito: um teacher/student real e "active",
    // mesmo que temporário, entra na contagem system-wide que
    // notificações de escopo institucional usam (ver
    // financialAndCalendar.test.js) -- rodando em paralelo, isso
    // criava uma disputa genuína e intermitente com aquele teste. O
    // status não importa para nada que este teste verifica.
    status: "inactive",
  });

  createdUserIds.push(user.id);

  assert.equal(user.role, "teacher");
  assert.equal(user.linkedEntity?.type, "teacher");

  const [[teacherRow]] = await db
    .promise()
    .query(`SELECT user_id, specialty FROM teachers WHERE user_id = ?`, [user.id]);

  assert.ok(teacherRow);
  assert.equal(teacherRow.specialty, "Testes automatizados");
});

test("creates a student user with users + students rows in the same transaction", async () => {
  const cpf = testCpf();

  const user = await createUser(db, {
    role: "student",
    name: "Test Student User",
    email: testEmail("student"),
    password: "senha123",
    gender: "Outro",
    birth_date: "2000-01-01",
    cpf,
    phone: "(11) 92222-2222",
    address: "Rua de Teste, 123",
    // Ver comentário equivalente no teste de professor acima.
    status: "inactive",
  });

  createdUserIds.push(user.id);

  assert.equal(user.role, "student");
  assert.equal(user.linkedEntity?.type, "student");

  const [[studentRow]] = await db
    .promise()
    .query(`SELECT user_id, cpf, birth_date FROM students WHERE user_id = ?`, [user.id]);

  assert.ok(studentRow);
  assert.equal(studentRow.cpf, cpf);
});

test("rolls back completely when profile creation fails mid-transaction (no orphan user)", async () => {
  const email = testEmail("rollback");

  // birth_date passa na checagem de "obrigatório" do JS (é uma
  // string não vazia), mas não é uma data válida -- o MySQL em modo
  // estrito rejeita o INSERT em `students`, DEPOIS que o INSERT em
  // `users` já rodou dentro da mesma transação. Se o rollback não
  // funcionasse, sobraria um usuário "student" órfão sem linha em
  // students.
  await assert.rejects(() =>
    createUser(db, {
      role: "student",
      name: "Test Rollback User",
      email,
      password: "senha123",
      birth_date: "not-a-valid-date",
      cpf: testCpf(),
      phone: "(11) 93333-3333",
    })
  );

  const [rows] = await db.promise().query(`SELECT id FROM users WHERE email = ?`, [email]);

  assert.equal(rows.length, 0, "no orphan users row should exist after a failed profile creation");
});

test("rejects an invalid role", async () => {
  await assert.rejects(
    () =>
      createUser(db, {
        role: "not_a_real_role",
        name: "Test Invalid Role",
        email: testEmail("invalidrole"),
        password: "senha123",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("manager and staff are not available roles, even though they exist in the DB enum", async () => {
  await assert.rejects(
    () => createUser(db, { role: "manager", name: "Test Manager", email: testEmail("manager"), password: "senha123" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  await assert.rejects(
    () => createUser(db, { role: "staff", name: "Test Staff", email: testEmail("staff"), password: "senha123" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

// Section 6 also requires preserving the existing "last active admin"
// protection. Forcing the real zero-admin scenario would require
// deactivating the two genuinely active admin accounts in this shared
// dev database, which this suite will not do (see
// real_data_mutation_incident in project memory). Instead, this
// verifies the counting mechanism itself -- the part a regression
// could realistically break (an off-by-one in the exclusion clause)
// -- against known, disposable test admins.
// -----------------------------------------------------------------
// admin.user.created (evolução do sistema de notificações, seção 4/20.A)
// -----------------------------------------------------------------

test("admin.user.created: cadastro pelo admin A notifica admin B, mas não o próprio admin A (actor excluído)", async () => {
  const teacher = await createUser(
    db,
    {
      role: "teacher",
      name: "Test Teacher Notif Actor",
      email: testEmail("teachernotifactor"),
      password: "senha123",
      cpf: testCpf(),
      status: "inactive",
    },
    { actorUserId: ADMIN_A_USER_ID }
  );

  createdUserIds.push(teacher.id);

  const notification = await getAdminUserCreatedNotification(teacher.id);

  assert.ok(notification, "admin.user.created deveria ter sido criada");
  createdNotificationIds.push(notification.id);

  assert.equal(notification.category, "registration");
  assert.equal(notification.actor_user_id, ADMIN_A_USER_ID);

  const [recipientRows] = await db
    .promise()
    .query(`SELECT user_id FROM notification_recipients WHERE notification_id = ?`, [notification.id]);

  const recipientIds = recipientRows.map((row) => row.user_id);

  assert.ok(recipientIds.includes(ADMIN_B_USER_ID), "admin B deveria receber");
  assert.equal(recipientIds.includes(ADMIN_A_USER_ID), false, "admin A (o autor) não deveria se notificar");
});

test("admin.user.created: dedup por userId -- uma segunda chamada com o mesmo dedup key não duplica", async () => {
  const teacher = await createUser(
    db,
    {
      role: "teacher",
      name: "Test Teacher Notif Dedup",
      email: testEmail("teachernotifdedup"),
      password: "senha123",
      cpf: testCpf(),
      status: "inactive",
    },
    { actorUserId: ADMIN_A_USER_ID }
  );

  createdUserIds.push(teacher.id);

  const notification = await getAdminUserCreatedNotification(teacher.id);
  assert.ok(notification);
  createdNotificationIds.push(notification.id);

  // Reprocessar manualmente o mesmo evento (mesmo userId -> mesmo
  // deduplicationKey) precisa ser um no-op, não uma segunda
  // notificação -- é a garantia central de createNotificationEvent
  // (UNIQUE KEY em deduplication_key), exercida aqui diretamente.
  const { notifyAdminUserCreated } = require("../../services/notifications/adminUserNotificationService");

  await notifyAdminUserCreated(db, {
    userId: teacher.id,
    userName: "Test Teacher Notif Dedup",
    userRole: "teacher",
    origin: "admin",
    actorUserId: ADMIN_A_USER_ID,
  });

  const [countRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM notifications WHERE source_type = 'user' AND source_id = ? AND type = 'admin.user.created'`, [
      teacher.id,
    ]);

  assert.equal(Number(countRows[0].total), 1);
});

test("admin.user.created NÃO dispara para o stub de checkout (allowNullPassword, sem senha)", async () => {
  const cpf = testCpf();

  const student = await createStudent(
    db,
    {
      name: "Test Checkout Stub No Notification",
      email: testEmail("checkoutstubnonotif"),
      birth_date: "2000-01-01",
      cpf,
      phone: "(11) 90000-0000",
    },
    { allowNullPassword: true }
  );

  createdUserIds.push(student.user_id);

  const notification = await getAdminUserCreatedNotification(student.user_id);

  assert.equal(notification, null, "o stub de checkout não deveria gerar admin.user.created");
});

test("countActiveAdmins correctly excludes the given user id from the count", async () => {
  const adminA = await createUser(db, {
    role: "admin",
    name: "Test Admin Count A",
    email: testEmail("countA"),
    password: "senha123",
  });

  const adminB = await createUser(db, {
    role: "admin",
    name: "Test Admin Count B",
    email: testEmail("countB"),
    password: "senha123",
  });

  createdUserIds.push(adminA.id, adminB.id);

  const totalActiveAdmins = await countActiveAdmins(db.promise());
  const excludingA = await countActiveAdmins(db.promise(), adminA.id);

  // Excluir um admin específico deve baixar a contagem em exatamente
  // 1 -- é exatamente esse cálculo que updateUserStatus usa para
  // decidir se a mudança deixaria zero admins ativos.
  assert.equal(excludingA, totalActiveAdmins - 1);

  // As duas contas de teste criadas acima precisam estar incluídas na
  // contagem total (senão o cálculo de "último admin" ignoraria
  // admins reais que existem de fato).
  assert.ok(totalActiveAdmins >= 2);
});
