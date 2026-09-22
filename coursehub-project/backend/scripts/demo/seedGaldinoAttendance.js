/**
 * Encontros e chamadas das turmas do Junior Galdino.
 * Idempotente. Não mexe na Node Turma B (falta do Pedro e jornada da Marina).
 *
 * Uso (backend):
 *   node scripts/demo/seedGaldinoAttendance.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");

const TEACHER_EMAIL = "junior.galdino@email.com";
const TODAY = "2026-09-21";
const TARGET_STUDENTS = 10;
const PROTECTED_CLASS_IDS = new Set([12]);

const NODE_SESSIONS = [
  { title: "Encontro 1 — Node e o ambiente", type: "class" },
  { title: "Encontro 2 — Express na prática", type: "class" },
  { title: "Encontro 3 — Rotas e métodos HTTP", type: "class" },
  { title: "Encontro 4 — Middlewares", type: "workshop" },
  { title: "Encontro 5 — MySQL e o primeiro CRUD", type: "lab" },
  { title: "Encontro 6 — Autenticação na API", type: "class" },
  { title: "Encontro 7 — Organização de pastas", type: "class" },
  { title: "Encontro 8 — Início do projeto", type: "workshop" },
  { title: "Encontro 9 — Revisão do CRUD", type: "review" },
  { title: "Encontro 10 — Testes manuais da API", type: "lab" },
  { title: "Encontro 11 — Tratamento de erros", type: "class" },
  { title: "Encontro 12 — Entrega parcial", type: "presentation" },
  { title: "Encontro 13 — Avaliação", type: "exam" },
  { title: "Encontro 14 — Ajustes finais", type: "class" },
  { title: "Encontro 15 — Encerramento da turma", type: "class" },
];

const REACT_SESSIONS = [
  { title: "Aula 1 — Introdução ao React", type: "class" },
  { title: "Aula 2 — Componentes, JSX e props", type: "class" },
  { title: "Aula 3 — Estado e eventos", type: "class" },
  { title: "Aula 4 — Listas, keys e composição", type: "class" },
  { title: "Aula 5 — Formulários controlados", type: "workshop" },
  { title: "Aula 6 — useEffect e o ciclo de vida", type: "class" },
  { title: "Aula 7 — Consumindo APIs", type: "lab" },
  { title: "Aula 8 — Loading, erro e dados vazios", type: "class" },
  { title: "Aula 9 — React Router", type: "class" },
  { title: "Aula 10 — Layouts e rotas aninhadas", type: "workshop" },
  { title: "Aula 11 — Context API", type: "class" },
  { title: "Aula 12 — Custom hooks", type: "class" },
  { title: "Aula 13 — Performance e memo", type: "review" },
  { title: "Aula 14 — Projeto: setup e telas", type: "workshop" },
  { title: "Aula 15 — Projeto: integração com API", type: "lab" },
  { title: "Aula 16 — Revisão e apresentação", type: "presentation" },
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), 1 | t);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function weeklyDates(startIso, count) {
  return Array.from({ length: count }, (_, index) => addDays(startIso, index * 7));
}

function isPastOrToday(isoDate) {
  return isoDate <= TODAY;
}

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function padClassEnrollments(conn, { courseId, classId, enrolledAt, actorUserId }) {
  const [[{ count }]] = await conn.query(
    `SELECT COUNT(*) AS count FROM enrollments WHERE class_id = ? AND status = 'active'`,
    [classId]
  );

  const needed = TARGET_STUDENTS - Number(count);
  if (needed <= 0) return Number(count);

  const [candidates] = await conn.query(
    `SELECT s.id
     FROM students s
     WHERE s.status = 'active'
       AND s.email NOT IN ('marina.alves@email.com', 'pedro.nogueira@email.com')
       AND NOT EXISTS (
         SELECT 1 FROM enrollments e
         WHERE e.student_id = s.id
           AND e.course_id = ?
           AND e.status IN ('active', 'inactive', 'locked', 'completed')
       )
     ORDER BY s.id
     LIMIT ?`,
    [courseId, needed]
  );

  for (const student of candidates) {
    await conn.query(
      `INSERT INTO enrollments
        (student_id, course_id, class_id, status, enrolled_at, origin, created_by_user_id, activated_at, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, 'administrative', ?, ?, NOW(), NOW())`,
      [student.id, courseId, classId, enrolledAt, actorUserId, enrolledAt]
    );
  }

  const [[{ count: next }]] = await conn.query(
    `SELECT COUNT(*) AS count FROM enrollments WHERE class_id = ? AND status = 'active'`,
    [classId]
  );
  return Number(next);
}

async function listStudentIds(conn, classId) {
  const [rows] = await conn.query(
    `SELECT student_id FROM enrollments WHERE class_id = ? AND status = 'active' ORDER BY student_id`,
    [classId]
  );
  return rows.map((row) => Number(row.student_id));
}

async function upsertSession(conn, { classId, sessionNumber, title, sessionDate, startTime, endTime, sessionType, status, description }) {
  const existing = await one(
    conn,
    `SELECT id FROM class_sessions WHERE class_id = ? AND session_number = ? LIMIT 1`,
    [classId, sessionNumber]
  );

  if (existing) {
    await conn.query(
      `UPDATE class_sessions
       SET title = ?, session_date = ?, start_time = ?, end_time = ?,
           session_type = ?, description = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [title, sessionDate, startTime, endTime, sessionType, description, status, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.query(
    `INSERT INTO class_sessions
      (class_id, session_number, title, session_date, start_time, end_time, session_type, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [classId, sessionNumber, title, sessionDate, startTime, endTime, sessionType, description, status]
  );
  return result.insertId;
}

function assignAttendance(studentIds, sessionIndex, rng) {
  const rate = 0.8 + rng() * 0.1;
  const presentCount = Math.min(
    studentIds.length,
    Math.max(1, Math.round(studentIds.length * rate))
  );
  const shuffled = [...studentIds].sort(() => rng() - 0.5);
  const statuses = new Map();

  shuffled.forEach((studentId, index) => {
    if (index < presentCount) {
      statuses.set(studentId, "present");
      return;
    }

    const roll = rng();
    statuses.set(studentId, roll < 0.45 ? "absent" : roll < 0.75 ? "late" : "excused");
  });

  return statuses;
}

async function fillAttendance(conn, { sessionId, studentIds, sessionIndex, rng }) {
  const statuses = assignAttendance(studentIds, sessionIndex, rng);

  for (const studentId of studentIds) {
    const existing = await one(
      conn,
      `SELECT id FROM attendance WHERE class_session_id = ? AND student_id = ? LIMIT 1`,
      [sessionId, studentId]
    );
    const status = statuses.get(studentId) || "present";

    if (existing) {
      await conn.query(
        `UPDATE attendance SET status = ?, updated_at = NOW() WHERE id = ?`,
        [status, existing.id]
      );
      continue;
    }

    await conn.query(
      `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [sessionId, studentId, status]
    );
  }
}

async function seedClass(conn, { classId, courseId, specs, startDate, startTime, endTime, description, actorUserId, rngSeed }) {
  const enrolledAt = `${startDate} 12:00:00`;
  const studentCount = await padClassEnrollments(conn, {
    courseId,
    classId,
    enrolledAt,
    actorUserId,
  });
  const studentIds = await listStudentIds(conn, classId);
  const dates = weeklyDates(startDate, specs.length);
  const rng = mulberry32(rngSeed);

  let completed = 0;
  let present = 0;
  let total = 0;

  for (const [index, spec] of specs.entries()) {
    const sessionDate = dates[index];
    const status = isPastOrToday(sessionDate) ? "completed" : "scheduled";
    const sessionId = await upsertSession(conn, {
      classId,
      sessionNumber: index + 1,
      title: spec.title,
      sessionDate,
      startTime,
      endTime,
      sessionType: spec.type,
      status,
      description,
    });

    if (status !== "completed" || studentIds.length === 0) continue;

    await fillAttendance(conn, { sessionId, studentIds, sessionIndex: index, rng });
    completed += 1;

    const [[{ present_count, total_count }]] = await conn.query(
      `SELECT
         SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
         COUNT(*) AS total_count
       FROM attendance WHERE class_session_id = ?`,
      [sessionId]
    );
    present += Number(present_count || 0);
    total += Number(total_count || 0);
  }

  return {
    classId,
    students: studentCount,
    sessions: specs.length,
    completed,
    attendanceRate: total > 0 ? Number(((present / total) * 100).toFixed(1)) : null,
  };
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const teacher = await one(
    conn,
    `SELECT t.id, t.user_id, t.name FROM teachers t WHERE t.email = ? LIMIT 1`,
    [TEACHER_EMAIL]
  );

  if (!teacher) {
    throw new Error(`Professor ${TEACHER_EMAIL} não encontrado.`);
  }

  const [owned] = await conn.query(
    `SELECT cl.id, cl.name, cl.course_id, c.name AS course_name
     FROM classes cl
     INNER JOIN courses c ON c.id = cl.course_id
     WHERE cl.teacher_id = ? AND cl.status = 'active'
     ORDER BY c.name, cl.name`,
    [teacher.id]
  );

  if (owned.length === 0) {
    throw new Error("Junior Galdino não é professor titular de nenhuma turma ativa.");
  }

  await conn.beginTransaction();

  try {
    const summaries = [];

    for (const classRow of owned) {
      const isNode = Number(classRow.course_id) === 5;
      const isReact = Number(classRow.course_id) === 1;

      if (PROTECTED_CLASS_IDS.has(Number(classRow.id))) {
        continue;
      }

      if (!isNode && !isReact) {
        continue;
      }

      const summary = await seedClass(conn, {
        classId: classRow.id,
        courseId: classRow.course_id,
        specs: isNode ? NODE_SESSIONS : REACT_SESSIONS,
        startDate: isNode ? "2026-08-26" : "2026-08-19",
        startTime: "19:00:00",
        endTime: "21:00:00",
        description: `${classRow.course_name} · ${classRow.name}`,
        actorUserId: teacher.user_id,
        rngSeed: 75000 + Number(classRow.id),
      });

      summaries.push({ ...summary, name: classRow.name, course: classRow.course_name });
    }

    await conn.commit();

    console.log(`Chamadas do ${teacher.name} gravadas em ${process.env.DB_NAME}.`);
    for (const row of summaries) {
      console.log(
        `  ${row.course} / ${row.name}: ${row.students} alunos, ${row.completed}/${row.sessions} encontros lançados, presença ${row.attendanceRate ?? "—"}%`
      );
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
