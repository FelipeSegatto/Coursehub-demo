/**
 * Monta o banco isolado `coursehub_demo` (schema copiado, dados novos).
 *
 * Recusa coursehub_escola e coursehub_test. Não copia linhas da escola —
 * só o DDL. Exige DEMO_SETUP=1.
 *
 * Uso (a partir de coursehub-project/backend):
 *   DEMO_SETUP=1 node scripts/demo/setupDemo.js
 *   DEMO_SETUP=1 node scripts/demo/setupDemo.js --reset
 *
 * No PowerShell:
 *   $env:DEMO_SETUP="1"; node scripts/demo/setupDemo.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const FORBIDDEN_NAMES = new Set([
  "coursehub_escola",
  "coursehub_test",
  "mysql",
  "information_schema",
  "performance_schema",
  "sys",
]);

const DEMO_DB_NAME = process.env.DEMO_DB_NAME || "coursehub_demo";
const SCHEMA_SOURCE = process.env.DEMO_SCHEMA_SOURCE || process.env.DB_NAME;
const DEMO_PASSWORD = "CourseHub.Demo.2026";

const ACCOUNTS = {
  admin: { email: "admin@coursehub.demo", name: "Ana Ribeiro", role: "admin" },
  teacher: { email: "professor@coursehub.demo", name: "Rafael Moura", role: "teacher" },
  student: { email: "aluno@coursehub.demo", name: "Marina Alves", role: "student" },
};

function assertSafeName(name, label) {
  const normalized = String(name || "").trim();

  if (!normalized) {
    throw new Error(`${label} não informado.`);
  }

  if (FORBIDDEN_NAMES.has(normalized)) {
    throw new Error(`${label} "${normalized}" é proibido neste script.`);
  }

  if (!/^[a-zA-Z0-9_]+$/.test(normalized)) {
    throw new Error(`${label} inválido.`);
  }

  return normalized;
}

function checkDigitsCpf(base9) {
  const numbers = String(base9).padStart(9, "0").slice(-9).split("").map(Number);
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += numbers[i] * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  numbers.push(digit(9));
  numbers.push(digit(10));

  return numbers.join("");
}

async function cloneSchema(conn, sourceDb, destDb) {
  const [tables] = await conn.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
    [sourceDb]
  );

  if (tables.length === 0) {
    throw new Error(`O schema de origem ${sourceDb} não tem tabelas. Não dá para clonar.`);
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const table of tables) {
    const tableName = table.TABLE_NAME;
    const [createRows] = await conn.query(`SHOW CREATE TABLE \`${sourceDb}\`.\`${tableName}\``);
    const ddl = createRows[0]["Create Table"].replace(
      /^CREATE TABLE `([^`]+)`/,
      `CREATE TABLE \`${destDb}\`.\`$1\``
    );
    await conn.query(ddl);
    process.stdout.write(`  tabela ${tableName}\n`);
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function seed(conn) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const studentCpf = checkDigitsCpf("390533447");
  const teacherCpf = checkDigitsCpf("529982247");

  const adminUserId = (
    await conn.query(
      `INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'female', 'admin', 'active', NOW(), NOW())`,
      [ACCOUNTS.admin.name, ACCOUNTS.admin.email, passwordHash]
    )
  )[0].insertId;

  const teacherUserId = (
    await conn.query(
      `INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'male', 'teacher', 'active', NOW(), NOW())`,
      [ACCOUNTS.teacher.name, ACCOUNTS.teacher.email, passwordHash]
    )
  )[0].insertId;

  const studentUserId = (
    await conn.query(
      `INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'female', 'student', 'active', NOW(), NOW())`,
      [ACCOUNTS.student.name, ACCOUNTS.student.email, passwordHash]
    )
  )[0].insertId;

  await conn.query(
    `UPDATE users SET avatar_key = CASE id
       WHEN ? THEN 'feminine-01'
       WHEN ? THEN 'masculine-01'
       WHEN ? THEN 'feminine-02'
     END
     WHERE id IN (?, ?, ?)`,
    [adminUserId, teacherUserId, studentUserId, adminUserId, teacherUserId, studentUserId]
  );

  const teacherId = (
    await conn.query(
      `INSERT INTO teachers
        (user_id, name, email, gender, registration_number, cpf, phone, specialty, status, created_at, updated_at)
       VALUES (?, ?, ?, 'male', ?, ?, '11988887777', 'Front-end', 'active', NOW(), NOW())`,
      [teacherUserId, ACCOUNTS.teacher.name, ACCOUNTS.teacher.email, `PROF${String(teacherUserId).padStart(5, "0")}`, teacherCpf]
    )
  )[0].insertId;

  const studentId = (
    await conn.query(
      `INSERT INTO students
        (user_id, name, email, gender, registration_number, birth_date, cpf, phone, address, status, created_at, updated_at)
       VALUES (?, ?, ?, 'female', ?, '1996-04-12', ?, '11977776666', 'Rua Augusta, 1492, São Paulo, SP', 'active', NOW(), NOW())`,
      [studentUserId, ACCOUNTS.student.name, ACCOUNTS.student.email, `STU${String(studentUserId).padStart(5, "0")}`, studentCpf]
    )
  )[0].insertId;

  const courseId = (
    await conn.query(
      `INSERT INTO courses
        (name, description, workload_hours, price, status, teacher_id, image_url, nivel,
         expanded_description, syllabus, category, created_at, updated_at)
       VALUES (?, ?, 40, 497, 'active', ?, NULL, 'Iniciante', ?, ?, 'Tecnologia', NOW(), NOW())`,
      [
        "Desenvolvimento Front-end com React",
        "Do componente ao produto: uma formação compacta para apresentar o CourseHub.",
        teacherId,
        "Fundamentos de React, composição de interfaces e o fluxo acadêmico completo na plataforma.",
        "1. Fundamentos\n2. Componentes\n3. Estado e progresso",
      ]
    )
  )[0].insertId;

  await conn.query(
    `INSERT INTO course_teachers (course_id, teacher_id, status, created_at, updated_at)
     VALUES (?, ?, 'active', NOW(), NOW())`,
    [courseId, teacherId]
  );

  const planId = (
    await conn.query(
      `INSERT INTO course_pricing_plans
        (course_id, name, description, billing_type, total_amount, monthly_payment_count,
         monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
         accepts_credit_card, status, created_at, updated_at)
       VALUES (?, 'Turma demonstração', 'Pagamento único da formação demo', 'one_time', 497.00,
               NULL, NULL, 1, 1, 1, 1, 'active', NOW(), NOW())`,
      [courseId]
    )
  )[0].insertId;

  const classId = (
    await conn.query(
      `INSERT INTO classes
        (course_id, teacher_id, name, shift, start_date, end_date, status, created_at, updated_at)
       VALUES (?, ?, 'Turma Demo 2026', 'online', '2026-03-01', '2026-07-31', 'active', NOW(), NOW())`,
      [courseId, teacherId]
    )
  )[0].insertId;

  const contentSpecs = [
    ["Boas-vindas à formação", "text", "O CourseHub reúne conteúdo, atividades e documentos no mesmo lugar. Este é o primeiro material da jornada demo."],
    ["Componentes e composição", "text", "Nesta aula a aluna acompanha a ideia de componentes e marca o conteúdo como concluído."],
    ["Encerramento do módulo", "text", "Último material do recorte demo — o progresso da aluna já aparece no dashboard."],
  ];

  const contentIds = [];

  for (const [index, spec] of contentSpecs.entries()) {
    const contentId = (
      await conn.query(
        `INSERT INTO course_contents
          (course_id, class_id, title, description, type, content_url, content_text,
           order_index, is_required, status, due_date, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, 1, 'active', NULL, NOW(), NOW())`,
        [courseId, classId, spec[0], spec[1], spec[2], index + 1]
      )
    )[0].insertId;
    contentIds.push(contentId);
  }

  await conn.query(
    `INSERT INTO student_content_progress
      (student_id, course_id, content_id, status, progress_percentage, last_position_seconds, started_at, completed_at,
       last_accessed_at, created_at, updated_at)
     VALUES
      (?, ?, ?, 'completed', 100, 0, NOW() - INTERVAL 10 DAY, NOW() - INTERVAL 10 DAY, NOW(), NOW(), NOW()),
      (?, ?, ?, 'completed', 100, 0, NOW() - INTERVAL 8 DAY, NOW() - INTERVAL 8 DAY, NOW(), NOW(), NOW()),
      (?, ?, ?, 'in_progress', 40, 0, NOW() - INTERVAL 2 DAY, NULL, NOW(), NOW(), NOW())`,
    [
      studentId, courseId, contentIds[0],
      studentId, courseId, contentIds[1],
      studentId, courseId, contentIds[2],
    ]
  );

  const sessionId = (
    await conn.query(
      `INSERT INTO class_sessions
        (class_id, session_number, title, session_date, start_time, end_time,
         session_type, description, status)
       VALUES (?, 1, 'Encontro 1 — fundamentos', '2026-03-10', '19:00:00', '21:00:00',
               'class', 'Aula inaugural da turma demo', 'completed')`,
      [classId]
    )
  )[0].insertId;

  const secondSessionId = (
    await conn.query(
      `INSERT INTO class_sessions
        (class_id, session_number, title, session_date, start_time, end_time,
         session_type, description, status)
       VALUES (?, 2, 'Encontro 2 — componentes', '2026-03-17', '19:00:00', '21:00:00',
               'class', 'Segundo encontro da turma demo', 'completed')`,
      [classId]
    )
  )[0].insertId;

  await conn.query(
    `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at)
     VALUES (?, ?, 'present', NOW(), NOW()), (?, ?, 'present', NOW(), NOW())`,
    [sessionId, studentId, secondSessionId, studentId]
  );

  const activityId = (
    await conn.query(
      `INSERT INTO activities
        (course_id, class_id, activity_kind, title, description, type, due_date,
         max_score, status, created_at, updated_at)
       VALUES (?, ?, 'activity', 'Exercício: o que é um componente?',
               'Resposta curta para o professor revisar na demo.', 'text',
               '2026-04-01', 10, 'active', NOW(), NOW())`,
      [courseId, classId]
    )
  )[0].insertId;

  const questionId = (
    await conn.query(
      `INSERT INTO activity_questions
        (activity_id, question_text, question_type, points, order_index)
       VALUES (?, 'Em uma frase, o que é um componente em React?', 'text', 10, 1)`,
      [activityId]
    )
  )[0].insertId;

  const submissionId = (
    await conn.query(
      `INSERT INTO submissions (activity_id, student_id, status, submitted_at, created_at, updated_at)
       VALUES (?, ?, 'pending_review', NOW() - INTERVAL 1 DAY, NOW(), NOW())`,
      [activityId, studentId]
    )
  )[0].insertId;

  await conn.query(
    `INSERT INTO submission_answers (submission_id, question_id, option_id, answer_text, file_url)
     VALUES (?, ?, NULL, 'Um componente é um bloco reutilizável de interface, com estrutura e comportamento próprios.', NULL)`,
    [submissionId, questionId]
  );

  const partyId = (
    await conn.query(
      `INSERT INTO contracting_parties
        (user_id, party_type, name, document_type, document_number, email, phone,
         billing_address_line, billing_address_city, billing_address_state, billing_address_zip_code,
         status, created_at, updated_at)
       VALUES (?, 'individual', ?, 'cpf', ?, ?, '11977776666',
               'Rua Augusta, 1492', 'São Paulo', 'SP', '01304-001', 'active', NOW(), NOW())`,
      [studentUserId, ACCOUNTS.student.name, studentCpf, ACCOUNTS.student.email]
    )
  )[0].insertId;

  const enrollmentId = (
    await conn.query(
      `INSERT INTO enrollments
        (student_id, course_id, class_id, status, enrolled_at, origin, created_by_user_id,
         activated_at, created_at, updated_at)
       VALUES (?, ?, ?, 'active', NOW() - INTERVAL 20 DAY, 'commercial', ?, NOW() - INTERVAL 20 DAY, NOW(), NOW())`,
      [studentId, courseId, classId, adminUserId]
    )
  )[0].insertId;

  const contractId = (
    await conn.query(
      `INSERT INTO financial_contracts
        (enrollment_id, student_id, course_id, contracting_party_id, created_by_user_id, origin,
         pricing_plan_id, billing_type, plan_name, total_amount, monthly_payment_count,
         monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
         accepts_credit_card, status, start_date, activated_at, contracting_party_name,
         contracting_party_document, contracting_party_email, contracting_party_phone,
         contracting_party_address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'admin', ?, 'one_time', 'Turma demonstração', 497.00, NULL, NULL,
               1, 1, 1, 1, 'active', CURDATE(), NOW() - INTERVAL 20 DAY, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        enrollmentId,
        studentId,
        courseId,
        partyId,
        adminUserId,
        planId,
        ACCOUNTS.student.name,
        studentCpf,
        ACCOUNTS.student.email,
        "11977776666",
        JSON.stringify({
          line: "Rua Augusta, 1492",
          city: "São Paulo",
          state: "SP",
          zipCode: "01304-001",
        }),
      ]
    )
  )[0].insertId;

  const invoiceId = (
    await conn.query(
      `INSERT INTO invoices
        (financial_contract_id, invoice_type, installment_number, installment_count,
         description, original_amount, amount, due_date, status, paid_at, created_at, updated_at)
       VALUES (?, 'full_payment', NULL, NULL, 'Pagamento da formação demo', 497.00, 497.00,
               DATE_SUB(CURDATE(), INTERVAL 15 DAY), 'paid', NOW() - INTERVAL 15 DAY, NOW(), NOW())`,
      [contractId]
    )
  )[0].insertId;

  await conn.query(
    `INSERT INTO payments
      (invoice_id, gateway, gateway_payment_id, source, recorded_by_user_id, admin_note,
       payment_method, amount, currency, status, paid_at, created_at, updated_at)
     VALUES (?, 'manual', ?, 'admin_manual', ?, 'Pagamento de demonstração',
             'pix', 497.00, 'BRL', 'approved', NOW() - INTERVAL 15 DAY, NOW(), NOW())`,
    [invoiceId, `demo_${Date.now()}`, adminUserId]
  );

  const conversationId = (
    await conn.query(
      `INSERT INTO chat_conversations
        (type, channel_kind, title, category, course_id, class_id, created_by_user_id,
         initiator_role, assigned_user_id, status, created_at, updated_at)
       VALUES ('teacher_support', 'ticket', 'Dúvida sobre o primeiro conteúdo', 'content',
               ?, ?, ?, 'student', ?, 'waiting_staff', NOW(), NOW())`,
      [courseId, classId, studentUserId, teacherUserId]
    )
  )[0].insertId;

  await conn.query(
    `INSERT INTO chat_participants (conversation_id, user_id, participant_role, can_post, joined_at, created_at, updated_at)
     VALUES (?, ?, 'student', 1, NOW(), NOW(), NOW()), (?, ?, 'teacher', 1, NOW(), NOW(), NOW())`,
    [conversationId, studentUserId, conversationId, teacherUserId]
  );

  const messageId = (
    await conn.query(
      `INSERT INTO chat_messages (conversation_id, sender_user_id, message_type, body, created_at)
       VALUES (?, ?, 'text', 'Oi, professor. Consegui concluir o primeiro conteúdo e já enviei o exercício.', NOW() - INTERVAL 2 HOUR)`,
      [conversationId, studentUserId]
    )
  )[0].insertId;

  await conn.query(
    `UPDATE chat_conversations SET last_message_id = ?, last_message_at = NOW() - INTERVAL 2 HOUR, updated_at = NOW() WHERE id = ?`,
    [messageId, conversationId]
  );

  const templates = [
    ["financial_contract", "Contrato de prestação de serviços educacionais", "1.0.0", "financial/financialContractDocumentTemplate"],
    ["invoice_copy", "2ª via de fatura", "1.0.0", "financial/invoiceCopyDocumentTemplate"],
    ["payment_receipt", "Recibo de pagamento", "1.0.0", "financial/paymentReceiptDocumentTemplate"],
    ["enrollment_declaration", "Declaração de matrícula", "1.0.0", "academic/enrollmentDeclarationTemplate"],
    ["attendance_declaration", "Declaração de frequência", "1.0.0", "academic/attendanceDeclarationTemplate"],
    ["completion_declaration", "Declaração de conclusão", "1.0.0", "academic/completionDeclarationTemplate"],
    ["certificate", "Certificado de conclusão", "1.0.0", "academic/certificateTemplate"],
  ];

  for (const template of templates) {
    await conn.query(
      `INSERT IGNORE INTO document_templates
        (document_type, name, version, template_path, status, created_by_user_id)
       VALUES (?, ?, ?, ?, 'active', NULL)`,
      template
    );
  }

  const permissionKeys = [
    "chat.supervise_teacher_support",
    "chat.supervise_administrative_support",
    "chat.supervise_staff_support",
    "chat.audit_access",
  ];

  for (const permissionKey of permissionKeys) {
    await conn.query(
      `INSERT INTO admin_permissions (user_id, permission_key, granted_by_user_id, granted_at)
       VALUES (?, ?, ?, NOW())`,
      [adminUserId, permissionKey, adminUserId]
    );
  }

  return { courseId, classId, enrollmentId };
}

function printWalkthrough() {
  console.log(`
============================================================
CourseHub demo pronto  (${DEMO_DB_NAME})
============================================================

1. No backend/.env, aponte o app para o demo (não use a escola):
     DB_NAME=${DEMO_DB_NAME}

2. Suba nesta ordem, na porta 5173:
     npm run dev                  (backend)
     npm run worker:documents
     npm run dev                  (frontend Vite 5173)

Contas (senha igual nas três):
  Admin      ${ACCOUNTS.admin.email}       ${DEMO_PASSWORD}
  Professor  ${ACCOUNTS.teacher.email}  ${DEMO_PASSWORD}
  Aluna      ${ACCOUNTS.student.email}       ${DEMO_PASSWORD}

Roteiro (~12 min)
  Público     Home → Cursos → Sobre → Fale conosco → Termos → Privacidade
  Checkout    Abrir o curso demo no catálogo (não precisa concluir o pagamento)
  Aluna       Home, curso/player, atividade enviada, documentos, chat
  Professor   Home, turma, correção da atividade, frequência, chat
  Admin       Home, financeiro do contrato pago, emitir declaração de matrícula
              e de frequência (01/03/2026 a 31/03/2026), verificar o PDF público

A escola (coursehub_escola) não foi alterada.
`);
}

async function main() {
  if (process.env.DEMO_SETUP !== "1") {
    throw new Error("Recusado. Rode com DEMO_SETUP=1 para criar o banco isolado.");
  }

  const destDb = assertSafeName(DEMO_DB_NAME, "DEMO_DB_NAME");
  const sourceDb = String(SCHEMA_SOURCE || "").trim();

  if (!sourceDb) {
    throw new Error("Informe DB_NAME ou DEMO_SCHEMA_SOURCE com o schema de origem (só estrutura).");
  }

  if (sourceDb === destDb) {
    throw new Error("Origem e destino não podem ser o mesmo schema.");
  }

  const reset = process.argv.includes("--reset");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: false,
  });

  try {
    const [[sourceExists]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [sourceDb]
    );

    if (!Number(sourceExists.n)) {
      throw new Error(`Schema de origem "${sourceDb}" não existe.`);
    }

    const [[destExists]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [destDb]
    );

    if (Number(destExists.n) && reset) {
      console.log(`Recriando ${destDb}...`);
      await conn.query(`DROP DATABASE \`${destDb}\``);
    }

    const [[destAfter]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [destDb]
    );

    if (!Number(destAfter.n)) {
      console.log(`Criando ${destDb} e clonando o schema de ${sourceDb} (sem dados)...`);
      try {
        await conn.query(
          `CREATE DATABASE \`${destDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
        );
      } catch (error) {
        throw new Error(
          `O usuário "${process.env.DB_USER}" não pode criar o schema ${destDb}. ` +
            `Com um usuário privilegiado, rode:\n\n` +
            `  CREATE DATABASE ${destDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\n` +
            `  GRANT ALL PRIVILEGES ON ${destDb}.* TO '${process.env.DB_USER}'@'localhost';\n` +
            `  FLUSH PRIVILEGES;\n\n` +
            `Depois execute este script de novo (DEMO_SETUP=1). ` +
            `A escola não é alterada.\n(${error.message})`
        );
      }
      await cloneSchema(conn, sourceDb, destDb);
    } else {
      console.log(`Schema ${destDb} já existe. Mantendo tabelas.`);
    }

    await conn.query(`USE \`${destDb}\``);

    const [existing] = await conn.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [ACCOUNTS.admin.email]
    );

    if (existing.length > 0) {
      console.log("Dados demo já estavam no banco. Nada foi inserido de novo.");
      printWalkthrough();
      return;
    }

    console.log("Inserindo contas, curso, turma, contrato e chat...");
    await seed(conn);
    printWalkthrough();
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
