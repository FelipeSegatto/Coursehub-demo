/**
 * Recorta a escola fictícia para a jornada demo:
 *   admin2, Marcelo (Node Turma A), Junior (Node B + React B e as Turmas C),
 *   Marina (só Node), Pedro (Node + React).
 *
 * Idempotente. Uso (backend):
 *   $env:MYSQL_ROOT_PASSWORD="..."; node scripts/demo/shapeEscolaDemo.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { enrichEscolaDemoJourney } = require("./enrichEscolaDemoJourney");

const DEMO_PASSWORD = "CourseHub.Demo.2026";
const NODE_COURSE_ID = 5;
const REACT_COURSE_ID = 1;
const NODE_CLASS_ID = 12;
const REACT_CLASS_ID = 8;
const NODE_PLAN_ID = 13;
const REACT_PLAN_ID = 2;
const ADMIN_EMAIL = "admin2@coursehub.com";
const TEACHER_EMAIL = "marcelo.torres@email.com";
const GALDINO_EMAIL = "junior.galdino@email.com";
const MARINA_EMAIL = "marina.alves@email.com";
const PEDRO_EMAIL = "pedro.nogueira@email.com";

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

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function ensureUser(conn, { name, email, passwordHash, gender, role, avatarKey }) {
  const existing = await one(conn, "SELECT id FROM users WHERE email = ? LIMIT 1", [email]);

  if (existing) {
    await conn.query(
      `UPDATE users
       SET name = ?, password_hash = ?, gender = ?, avatar_key = ?, role = ?, status = 'active', updated_at = NOW()
       WHERE id = ?`,
      [name, passwordHash, gender, avatarKey, role, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.query(
    `INSERT INTO users (name, email, password_hash, gender, avatar_key, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
    [name, email, passwordHash, gender, avatarKey, role]
  );

  return result.insertId;
}

async function ensureStudent(conn, { userId, name, email, gender, birthDate, cpf, phone, address }) {
  const existing = await one(conn, "SELECT id FROM students WHERE user_id = ? LIMIT 1", [userId]);

  if (existing) {
    await conn.query(
      `UPDATE students
       SET name = ?, email = ?, gender = ?, phone = ?, address = ?, status = 'active', updated_at = NOW()
       WHERE id = ?`,
      [name, email, gender, phone, address, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.query(
    `INSERT INTO students
      (user_id, name, email, gender, registration_number, birth_date, cpf, phone, address, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
    [userId, name, email, gender, `STU${String(userId).padStart(5, "0")}`, birthDate, cpf, phone, address]
  );

  return result.insertId;
}

async function ensureEnrollment(conn, { studentId, courseId, classId, adminUserId, enrolledAt }) {
  const existing = await one(
    conn,
    `SELECT id FROM enrollments
     WHERE student_id = ? AND course_id = ? AND status IN ('active','inactive','locked','completed')
     LIMIT 1`,
    [studentId, courseId]
  );

  if (existing) {
    await conn.query(
      `UPDATE enrollments
       SET class_id = ?, status = 'active', origin = 'administrative',
           created_by_user_id = COALESCE(created_by_user_id, ?),
           activated_at = COALESCE(activated_at, ?),
           enrolled_at = COALESCE(enrolled_at, ?),
           updated_at = NOW()
       WHERE id = ?`,
      [classId, adminUserId, enrolledAt, enrolledAt, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.query(
    `INSERT INTO enrollments
      (student_id, course_id, class_id, status, enrolled_at, origin, created_by_user_id, activated_at, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, 'administrative', ?, ?, NOW(), NOW())`,
    [studentId, courseId, classId, enrolledAt, adminUserId, enrolledAt]
  );

  return result.insertId;
}

async function ensurePaidContract(conn, {
  enrollmentId,
  studentId,
  courseId,
  userId,
  adminUserId,
  name,
  email,
  cpf,
  phone,
  planId,
  planName,
  amount,
  address,
}) {
  const existing = await one(
    conn,
    `SELECT id FROM financial_contracts WHERE enrollment_id = ? LIMIT 1`,
    [enrollmentId]
  );

  if (existing) return existing.id;

  let party = await one(
    conn,
    `SELECT id FROM contracting_parties WHERE document_type = 'cpf' AND document_number = ? LIMIT 1`,
    [cpf]
  );

  if (!party) {
    const [partyResult] = await conn.query(
      `INSERT INTO contracting_parties
        (user_id, party_type, name, document_type, document_number, email, phone,
         billing_address_line, billing_address_city, billing_address_state, billing_address_zip_code,
         status, created_at, updated_at)
       VALUES (?, 'individual', ?, 'cpf', ?, ?, ?, ?, 'São Paulo', 'SP', '01304-001', 'active', NOW(), NOW())`,
      [userId, name, cpf, email, phone, address]
    );
    party = { id: partyResult.insertId };
  }

  const [contractResult] = await conn.query(
    `INSERT INTO financial_contracts
      (enrollment_id, student_id, course_id, contracting_party_id, created_by_user_id, origin,
       pricing_plan_id, billing_type, plan_name, total_amount, monthly_payment_count,
       monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
       accepts_credit_card, status, start_date, activated_at, contracting_party_name,
       contracting_party_document, contracting_party_email, contracting_party_phone,
       contracting_party_address, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'admin', ?, 'one_time', ?, ?, NULL, NULL,
             10, 1, 1, 1, 'active', '2026-08-20', '2026-08-18 14:00:00', ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      enrollmentId,
      studentId,
      courseId,
      party.id,
      adminUserId,
      planId,
      planName,
      amount,
      name,
      cpf,
      email,
      phone,
      JSON.stringify({ line: address, city: "São Paulo", state: "SP", zipCode: "01304-001" }),
    ]
  );

  const [invoiceResult] = await conn.query(
    `INSERT INTO invoices
      (financial_contract_id, invoice_type, installment_number, installment_count,
       description, original_amount, amount, discount_amount, due_date, status, paid_at, created_at, updated_at)
     VALUES (?, 'full_payment', NULL, NULL, ?, ?, ?, 0, '2026-08-18', 'paid', '2026-08-18 14:10:00', NOW(), NOW())`,
    [contractResult.insertId, `Pagamento — ${planName}`, amount, amount]
  );

  await conn.query(`UPDATE financial_contracts SET activation_invoice_id = ? WHERE id = ?`, [
    invoiceResult.insertId,
    contractResult.insertId,
  ]);

  await conn.query(
    `INSERT INTO payments
      (invoice_id, gateway, gateway_payment_id, source, recorded_by_user_id, admin_note,
       payment_method, amount, currency, status, paid_at, created_at, updated_at)
     VALUES (?, 'manual', ?, 'admin_manual', ?, 'Pagamento da jornada demo',
             'pix', ?, 'BRL', 'approved', '2026-08-18 14:10:00', NOW(), NOW())`,
    [invoiceResult.insertId, `demo_${courseId}_${studentId}`, adminUserId, amount]
  );

  return contractResult.insertId;
}

async function ensureProgress(conn, { studentId, courseId, contentId, status, percent, startedAgoDays, completedAgoDays }) {
  const existing = await one(
    conn,
    `SELECT id FROM student_content_progress WHERE student_id = ? AND content_id = ? LIMIT 1`,
    [studentId, contentId]
  );

  const completedAt = status === "completed" ? `NOW() - INTERVAL ${completedAgoDays} DAY` : "NULL";
  const startedAt = `NOW() - INTERVAL ${startedAgoDays} DAY`;

  if (existing) {
    await conn.query(
      `UPDATE student_content_progress
       SET status = ?, progress_percentage = ?, started_at = ${startedAt},
           completed_at = ${completedAt}, last_accessed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [status, percent, existing.id]
    );
    return;
  }

  await conn.query(
    `INSERT INTO student_content_progress
      (student_id, course_id, content_id, status, progress_percentage, last_position_seconds,
       started_at, completed_at, last_accessed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ${startedAt}, ${completedAt}, NOW(), NOW(), NOW())`,
    [studentId, courseId, contentId, status, percent]
  );
}

async function main() {
  if (!process.env.MYSQL_ROOT_PASSWORD) {
    throw new Error("Defina MYSQL_ROOT_PASSWORD para rodar este script.");
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: "root",
    password: process.env.MYSQL_ROOT_PASSWORD,
    database: "coursehub_escola",
    multipleStatements: true,
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await conn.beginTransaction();

  try {
    const adminUserId = await ensureUser(conn, {
      name: "Larissa Almeida",
      email: ADMIN_EMAIL,
      passwordHash,
      gender: "female",
      role: "admin",
      avatarKey: "feminine-01",
    });

    await conn.query(
      `UPDATE users SET password_hash = ?, status = 'active', updated_at = NOW() WHERE email = ?`,
      [passwordHash, TEACHER_EMAIL]
    );

    await conn.query(
      `UPDATE users SET password_hash = ?, status = 'active', updated_at = NOW() WHERE email = ?`,
      [passwordHash, GALDINO_EMAIL]
    );

    const teacher = await one(conn, "SELECT id, user_id FROM teachers WHERE email = ? LIMIT 1", [TEACHER_EMAIL]);
    const galdino = await one(conn, "SELECT id, user_id FROM teachers WHERE email = ? LIMIT 1", [GALDINO_EMAIL]);

    if (!teacher) throw new Error("Professor Marcelo Torres não encontrado.");
    if (!galdino) throw new Error("Professor Junior Galdino não encontrado.");

    await conn.query(
      `UPDATE classes SET teacher_id = ?, updated_at = NOW() WHERE id IN (?, ?)`,
      [galdino.id, NODE_CLASS_ID, REACT_CLASS_ID]
    );

    for (const courseId of [NODE_COURSE_ID, REACT_COURSE_ID]) {
      const existingLink = await one(
        conn,
        `SELECT id FROM course_teachers WHERE course_id = ? AND teacher_id = ? LIMIT 1`,
        [courseId, galdino.id]
      );
      if (existingLink) {
        await conn.query(
          `UPDATE course_teachers SET status = 'active', updated_at = NOW() WHERE id = ?`,
          [existingLink.id]
        );
      } else {
        await conn.query(
          `INSERT INTO course_teachers (course_id, teacher_id, status, created_at, updated_at)
           VALUES (?, ?, 'active', NOW(), NOW())`,
          [courseId, galdino.id]
        );
      }
    }

    const marinaUserId = await ensureUser(conn, {
      name: "Marina Alves",
      email: MARINA_EMAIL,
      passwordHash,
      gender: "female",
      role: "student",
      avatarKey: "feminine-02",
    });

    const pedroUserId = await ensureUser(conn, {
      name: "Pedro Nogueira",
      email: PEDRO_EMAIL,
      passwordHash,
      gender: "male",
      role: "student",
      avatarKey: "masculine-01",
    });

    const marinaStudentId = await ensureStudent(conn, {
      userId: marinaUserId,
      name: "Marina Alves",
      email: MARINA_EMAIL,
      gender: "female",
      birthDate: "1998-04-12",
      cpf: checkDigitsCpf("390533447"),
      phone: "11977771001",
      address: "Rua Augusta, 1492, São Paulo, SP",
    });

    const pedroStudentId = await ensureStudent(conn, {
      userId: pedroUserId,
      name: "Pedro Nogueira",
      email: PEDRO_EMAIL,
      gender: "male",
      birthDate: "1997-11-03",
      cpf: checkDigitsCpf("529982247"),
      phone: "11977771002",
      address: "Av. Paulista, 900, São Paulo, SP",
    });

    const marinaNodeEnrollmentId = await ensureEnrollment(conn, {
      studentId: marinaStudentId,
      courseId: NODE_COURSE_ID,
      classId: NODE_CLASS_ID,
      adminUserId,
      enrolledAt: "2026-08-18 10:00:00",
    });

    const pedroNodeEnrollmentId = await ensureEnrollment(conn, {
      studentId: pedroStudentId,
      courseId: NODE_COURSE_ID,
      classId: NODE_CLASS_ID,
      adminUserId,
      enrolledAt: "2026-08-18 11:00:00",
    });

    const pedroReactEnrollmentId = await ensureEnrollment(conn, {
      studentId: pedroStudentId,
      courseId: REACT_COURSE_ID,
      classId: REACT_CLASS_ID,
      adminUserId,
      enrolledAt: "2026-08-19 09:00:00",
    });

    await ensurePaidContract(conn, {
      enrollmentId: marinaNodeEnrollmentId,
      studentId: marinaStudentId,
      courseId: NODE_COURSE_ID,
      userId: marinaUserId,
      adminUserId,
      name: "Marina Alves",
      email: MARINA_EMAIL,
      cpf: checkDigitsCpf("390533447"),
      phone: "11977771001",
      planId: NODE_PLAN_ID,
      planName: "Pagamento à vista",
      amount: 1290,
      address: "Rua Augusta, 1492",
    });

    await ensurePaidContract(conn, {
      enrollmentId: pedroNodeEnrollmentId,
      studentId: pedroStudentId,
      courseId: NODE_COURSE_ID,
      userId: pedroUserId,
      adminUserId,
      name: "Pedro Nogueira",
      email: PEDRO_EMAIL,
      cpf: checkDigitsCpf("529982247"),
      phone: "11977771002",
      planId: NODE_PLAN_ID,
      planName: "Pagamento à vista",
      amount: 1290,
      address: "Av. Paulista, 900",
    });

    await ensurePaidContract(conn, {
      enrollmentId: pedroReactEnrollmentId,
      studentId: pedroStudentId,
      courseId: REACT_COURSE_ID,
      userId: pedroUserId,
      adminUserId,
      name: "Pedro Nogueira",
      email: PEDRO_EMAIL,
      cpf: checkDigitsCpf("529982247"),
      phone: "11977771002",
      planId: REACT_PLAN_ID,
      planName: "Plano Integral",
      amount: 1490,
      address: "Av. Paulista, 900",
    });

    await conn.query(
      `UPDATE course_contents SET content_url = '/api/files/2', title = 'Apostila: APIs REST com Node e Express', order_index = 2
       WHERE id = 26`
    );
    await conn.query(`UPDATE course_contents SET order_index = 1 WHERE id = 25`);
    await conn.query(`UPDATE course_contents SET order_index = 3, title = 'Texto: rotas, métodos HTTP e o ciclo de uma request' WHERE id = 27`);
    await conn.query(`UPDATE course_contents SET order_index = 4 WHERE id = 28`);
    await conn.query(`UPDATE course_contents SET order_index = 5 WHERE id = 65`);
    await conn.query(`UPDATE course_contents SET order_index = 6 WHERE id = 66`);
    await conn.query(`UPDATE course_contents SET order_index = 7 WHERE id = 67`);
    await conn.query(`UPDATE course_contents SET order_index = 8 WHERE id = 68`);

    const welcome = await one(
      conn,
      `SELECT id FROM course_contents WHERE course_id = ? AND class_id = ? AND title LIKE 'Orientações%' LIMIT 1`,
      [NODE_COURSE_ID, NODE_CLASS_ID]
    );

    if (welcome) {
      await conn.query(
        `UPDATE course_contents
         SET order_index = 9, title = 'Cronograma do semestre — Turma B 2026',
             content_text = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          "Semestre 2026.2 (20/08 a 19/11). Até a semana de 20/09: fundamentos, apostila e as primeiras práticas. Em outubro entra o projeto da API. A avaliação final é em novembro, ainda dentro do período da turma.",
          welcome.id,
        ]
      );
    }

    await conn.query(`UPDATE activities SET status = 'archived' WHERE id = 4978`);
    await conn.query(`UPDATE activities SET status = 'archived' WHERE title LIKE 'TEST ETAPA5D%'`);

    await enrichEscolaDemoJourney(conn, {
      adminUserId,
      teacherId: galdino.id,
      marinaStudentId,
      pedroStudentId,
      pedroNodeEnrollmentId,
    });

    const nodeContentIds = [25, 26, 27, 28, 65, 66, 67, 68];
    const marinaProgress = [
      ["completed", 100, 30, 28],
      ["completed", 100, 28, 25],
      ["completed", 100, 24, 20],
      ["completed", 100, 18, 14],
      ["in_progress", 45, 5, null],
      ["not_started", 0, 0, null],
      ["not_started", 0, 0, null],
      ["not_started", 0, 0, null],
    ];
    const pedroProgress = [
      ["completed", 100, 29, 27],
      ["completed", 100, 26, 22],
      ["completed", 100, 20, 16],
      ["in_progress", 30, 6, null],
      ["not_started", 0, 0, null],
      ["not_started", 0, 0, null],
      ["not_started", 0, 0, null],
      ["not_started", 0, 0, null],
    ];

    for (const [index, contentId] of nodeContentIds.entries()) {
      const [status, percent, started, completed] = marinaProgress[index];
      if (status === "not_started") continue;
      await ensureProgress(conn, {
        studentId: marinaStudentId,
        courseId: NODE_COURSE_ID,
        contentId,
        status,
        percent,
        startedAgoDays: started,
        completedAgoDays: completed || 0,
      });
    }

    for (const [index, contentId] of nodeContentIds.entries()) {
      const [status, percent, started, completed] = pedroProgress[index];
      if (status === "not_started") continue;
      await ensureProgress(conn, {
        studentId: pedroStudentId,
        courseId: NODE_COURSE_ID,
        contentId,
        status,
        percent,
        startedAgoDays: started,
        completedAgoDays: completed || 0,
      });
    }

    await ensureProgress(conn, {
      studentId: pedroStudentId,
      courseId: REACT_COURSE_ID,
      contentId: 1,
      status: "completed",
      percent: 100,
      startedAgoDays: 25,
      completedAgoDays: 22,
    });
    await ensureProgress(conn, {
      studentId: pedroStudentId,
      courseId: REACT_COURSE_ID,
      contentId: 2,
      status: "in_progress",
      percent: 40,
      startedAgoDays: 8,
      completedAgoDays: 0,
    });

    const existingSessions = await one(
      conn,
      `SELECT id FROM class_sessions WHERE class_id = ? LIMIT 1`,
      [NODE_CLASS_ID]
    );

    if (!existingSessions) {
      const sessionSpecs = [
        ["2026-08-20", "completed", "Encontro 1 — Node e o ambiente"],
        ["2026-08-27", "completed", "Encontro 2 — Express na prática"],
        ["2026-09-03", "completed", "Encontro 3 — Rotas e métodos HTTP"],
        ["2026-09-10", "completed", "Encontro 4 — Middlewares"],
        ["2026-09-17", "completed", "Encontro 5 — MySQL e o primeiro CRUD"],
        ["2026-09-24", "scheduled", "Encontro 6 — Autenticação na API"],
        ["2026-10-01", "scheduled", "Encontro 7 — Organização de pastas"],
        ["2026-10-08", "scheduled", "Encontro 8 — Início do projeto"],
        ["2026-10-15", "scheduled", "Encontro 9 — Revisão do CRUD"],
        ["2026-10-22", "scheduled", "Encontro 10 — Testes manuais da API"],
        ["2026-10-29", "scheduled", "Encontro 11 — Ajustes do projeto"],
        ["2026-11-05", "scheduled", "Encontro 12 — Entrega parcial"],
        ["2026-11-12", "scheduled", "Encontro 13 — Avaliação parcial"],
        ["2026-11-19", "scheduled", "Encontro 14 — Encerramento do semestre"],
      ];

      const sessionIds = [];

      for (const [index, spec] of sessionSpecs.entries()) {
        const [result] = await conn.query(
          `INSERT INTO class_sessions
            (class_id, session_number, title, session_date, start_time, end_time, session_type, description, status)
           VALUES (?, ?, ?, ?, '19:00:00', '21:00:00', 'class', 'Semestre 2026.2 da Turma B', ?)`,
          [NODE_CLASS_ID, index + 1, spec[2], spec[0], spec[1]]
        );
        sessionIds.push({ id: result.insertId, status: spec[1], index });
      }

      const completed = sessionIds.filter((item) => item.status === "completed");

      for (const session of completed) {
        const pedroStatus = session.index === 2 ? "absent" : "present";
        await conn.query(
          `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at)
           VALUES (?, ?, 'present', NOW(), NOW()), (?, ?, ?, NOW(), NOW())`,
          [session.id, marinaStudentId, session.id, pedroStudentId, pedroStatus]
        );
      }
    }

    const existingTicket = await one(
      conn,
      `SELECT id FROM chat_conversations
       WHERE type = 'teacher_support' AND created_by_user_id = ? AND course_id = ? LIMIT 1`,
      [marinaUserId, NODE_COURSE_ID]
    );

    if (existingTicket) {
      await conn.query(
        `UPDATE chat_conversations
         SET assigned_user_id = ?, class_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [galdino.user_id, NODE_CLASS_ID, existingTicket.id]
      );
      await conn.query(
        `UPDATE chat_participants
         SET user_id = ?, updated_at = NOW()
         WHERE conversation_id = ? AND participant_role = 'teacher'`,
        [galdino.user_id, existingTicket.id]
      );
    } else {
      const [conversationResult] = await conn.query(
        `INSERT INTO chat_conversations
          (type, channel_kind, title, category, course_id, class_id, created_by_user_id,
           initiator_role, assigned_user_id, status, created_at, updated_at)
         VALUES ('teacher_support', 'ticket', 'Dúvida sobre middleware', 'content',
                 ?, ?, ?, 'student', ?, 'waiting_staff', NOW() - INTERVAL 5 HOUR, NOW())`,
        [NODE_COURSE_ID, NODE_CLASS_ID, marinaUserId, galdino.user_id]
      );

      await conn.query(
        `INSERT INTO chat_participants (conversation_id, user_id, participant_role, can_post, joined_at, created_at, updated_at)
         VALUES (?, ?, 'student', 1, NOW(), NOW(), NOW()), (?, ?, 'teacher', 1, NOW(), NOW(), NOW())`,
        [conversationResult.insertId, marinaUserId, conversationResult.insertId, galdino.user_id]
      );

      const [messageResult] = await conn.query(
        `INSERT INTO chat_messages (conversation_id, sender_user_id, message_type, body, created_at)
         VALUES (?, ?, 'text', 'Oi, professor. Enviei o exercício de middleware e fiquei na dúvida se o express.json() conta como middleware de autenticação ou só de parsing.', NOW() - INTERVAL 5 HOUR)`,
        [conversationResult.insertId, marinaUserId]
      );

      await conn.query(
        `UPDATE chat_conversations SET last_message_id = ?, last_message_at = NOW() - INTERVAL 5 HOUR WHERE id = ?`,
        [messageResult.insertId, conversationResult.insertId]
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
        `INSERT IGNORE INTO admin_permissions (user_id, permission_key, granted_by_user_id, granted_at)
         VALUES (?, ?, ?, NOW())`,
        [adminUserId, permissionKey, adminUserId]
      );
    }

    await conn.commit();

    console.log(`
============================================================
Jornada demo recortada em coursehub_escola
============================================================

Senha das cinco contas: ${DEMO_PASSWORD}

  Admin       ${ADMIN_EMAIL}         (Larissa Almeida)
  Professor   ${TEACHER_EMAIL}  (Marcelo Torres — Node Turma A)
  Professor   ${GALDINO_EMAIL}   (Junior Galdino — Node B/C + React B/C)
  Aluna A     ${MARINA_EMAIL}        (Marina Alves — só Node, Turma B)
  Aluno B     ${PEDRO_EMAIL}       (Pedro Nogueira — Node Turma B + React Turma B)

Marina: 3 atividades e 1 avaliação já corrigidas; a 4ª é o quiz rápido da semana.
Pedro: o mesmo no Node + React; mensalidade 2/4 atrasada — pagar com Pix.
Marcelo: fila da 4ª atividade do Node e chamada da Turma A.
Junior: professor da Marina e do Pedro (Turmas B) + Turmas C; gráfico, Materiais e o chat.
`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
