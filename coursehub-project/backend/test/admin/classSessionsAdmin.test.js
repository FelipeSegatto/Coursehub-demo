const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const {
  listSessionsForAdmin,
  getSessionForAdmin,
  createSessionAsAdmin,
  updateSessionAsAdmin,
  cancelSessionAsAdmin,
} = require("../../services/admin/adminClassSessionService");
const { listAttendanceSessions, getAttendanceSessionDetail } = require("../../services/admin/adminAttendanceSessionService");
const { hasValidScope: gradesHasValidScope, listGrades } = require("../../services/admin/adminGradeService");

// Mesma turma/curso semeados já usados em test/notifications/learningSession.test.js
// (COURSE_ID 4, CLASS_A_ID 4) -- session_number aleatório e alto evita
// colisão real com UNIQUE(class_id, session_number), mesmo rodando em
// paralelo com aquele arquivo.
const COURSE_ID = 4;
const CLASS_A_ID = 4;
const ADMIN_ACTOR_USER_ID = 42; // admin real (Felipe Segatto), já usado em outros arquivos desta suíte

const createdSessionIds = [];

function uniqueSessionNumber() {
  return 500000 + Math.floor(Math.random() * 400000);
}

function basePayload(overrides = {}) {
  return {
    sessionNumber: uniqueSessionNumber(),
    title: `TEST ADMIN SESSIONS ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "temporary admin test session",
    sessionDate: "2026-10-01",
    startTime: "19:00",
    endTime: "21:00",
    sessionType: "class",
    status: "scheduled",
    ...overrides,
  };
}

async function countNotifications(type, sessionId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total, actor_user_id FROM notifications WHERE type = ? AND source_id = ? GROUP BY actor_user_id", [
      type,
      sessionId,
    ]);

  return rows;
}

after(async () => {
  if (createdSessionIds.length > 0) {
    const placeholders = createdSessionIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(`DELETE FROM notifications WHERE type LIKE 'learning.session.%' AND source_id IN (${placeholders})`, createdSessionIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM class_sessions WHERE id IN (${placeholders})`, createdSessionIds)
    );
  }

  await retryOnDeadlock(() => db.promise().query("DELETE FROM class_sessions WHERE title LIKE 'TEST ADMIN SESSIONS %'"));

  await db.promise().end();
});

test("admin cria encontro sem precisar ser (nem fingir ser) o professor da turma -- actor é o próprio admin", async () => {
  const result = await createSessionAsAdmin(db, {
    actorUserId: ADMIN_ACTOR_USER_ID,
    classId: CLASS_A_ID,
    payload: basePayload(),
  });

  createdSessionIds.push(result.session.id);

  assert.equal(result.session.classId, CLASS_A_ID);
  assert.equal(result.session.status, "scheduled");

  const notifRows = await countNotifications("learning.session.scheduled", result.session.id);
  assert.ok(notifRows.length > 0, "deveria ter notificado");
  assert.equal(Number(notifRows[0].actor_user_id), ADMIN_ACTOR_USER_ID, "o actor da notificação deve ser o admin, nunca um professor forjado");
});

test("conflito de número de sessão na mesma turma devolve 409, sem duplicar linha", async () => {
  const sessionNumber = uniqueSessionNumber();

  const first = await createSessionAsAdmin(db, {
    actorUserId: ADMIN_ACTOR_USER_ID,
    classId: CLASS_A_ID,
    payload: basePayload({ sessionNumber }),
  });
  createdSessionIds.push(first.session.id);

  await assert.rejects(
    () =>
      createSessionAsAdmin(db, {
        actorUserId: ADMIN_ACTOR_USER_ID,
        classId: CLASS_A_ID,
        payload: basePayload({ sessionNumber }),
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  const [rows] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM class_sessions WHERE class_id = ? AND session_number = ?`,
    [CLASS_A_ID, sessionNumber]
  );
  assert.equal(Number(rows[0].total), 1);
});

test("cancelamento pelo admin é idempotente e nunca apaga a linha (soft cancel)", async () => {
  const created = await createSessionAsAdmin(db, {
    actorUserId: ADMIN_ACTOR_USER_ID,
    classId: CLASS_A_ID,
    payload: basePayload(),
  });
  createdSessionIds.push(created.session.id);

  const first = await cancelSessionAsAdmin(db, { actorUserId: ADMIN_ACTOR_USER_ID, sessionId: created.session.id });
  assert.equal(first.alreadyCancelled, false);
  assert.equal(first.session.status, "cancelled");

  const second = await cancelSessionAsAdmin(db, { actorUserId: ADMIN_ACTOR_USER_ID, sessionId: created.session.id });
  assert.equal(second.alreadyCancelled, true);

  const notifRows = await countNotifications("learning.session.cancelled", created.session.id);
  const total = notifRows.reduce((sum, row) => sum + Number(row.total), 0);
  assert.equal(total, 1, "cancelar duas vezes não deveria notificar duas vezes");

  const [rows] = await db.promise().query(`SELECT status FROM class_sessions WHERE id = ?`, [created.session.id]);
  assert.equal(rows.length, 1, "a linha nunca deveria ser fisicamente removida");
  assert.equal(rows[0].status, "cancelled");
});

test("edição pelo admin dispara learning.session.changed quando data/horário mudam", async () => {
  const created = await createSessionAsAdmin(db, {
    actorUserId: ADMIN_ACTOR_USER_ID,
    classId: CLASS_A_ID,
    payload: basePayload({ sessionDate: "2026-10-01" }),
  });
  createdSessionIds.push(created.session.id);

  await updateSessionAsAdmin(db, {
    actorUserId: ADMIN_ACTOR_USER_ID,
    sessionId: created.session.id,
    payload: basePayload({ sessionNumber: created.session.sessionNumber, title: created.session.title, sessionDate: "2026-10-15" }),
  });

  const notifRows = await countNotifications("learning.session.changed", created.session.id);
  const total = notifRows.reduce((sum, row) => sum + Number(row.total), 0);
  assert.equal(total, 1);
});

test("listagem admin de encontros exige classId -- sem escopo, rejeita com 400", async () => {
  await assert.rejects(
    () => listSessionsForAdmin(db, {}),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("detalhe/listagem admin de encontro inexistente devolve 404, id inválido devolve 400", async () => {
  await assert.rejects(
    () => getSessionForAdmin(db, 999999999),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );

  await assert.rejects(
    () => getSessionForAdmin(db, "not-a-number"),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("frequência por chamada: agrupa por encontro, não duplica por aluno, e só traz encontros com chamada real", async () => {
  const listing = await listAttendanceSessions(db, { classId: 1 });

  assert.ok(listing.data.length > 0, "a turma seed 1 já tem chamadas reais lançadas");

  const sessionIds = listing.data.map((row) => row.sessionId);
  assert.equal(new Set(sessionIds).size, sessionIds.length, "cada encontro aparece só uma vez na listagem");

  for (const row of listing.data) {
    assert.ok(row.total > 0, "listAttendanceSessions só deveria trazer encontros com pelo menos um registro real");
  }

  const detail = await getAttendanceSessionDetail(db, listing.data[0].sessionId);
  const summedTotal = detail.students.length;
  assert.equal(summedTotal, listing.data[0].total, "o total da listagem deve bater com a quantidade de linhas do detalhe");

  const statusSum =
    detail.summary.present + detail.summary.absent + detail.summary.late + detail.summary.excused;
  assert.equal(statusSum, detail.summary.total, "presentes+ausentes+atrasados+justificados deve fechar com o total");
});

test("notas administrativas: sem escopo válido (curso/turma/professor/busca >=3), rejeita com 400", async () => {
  assert.equal(gradesHasValidScope({}), false);
  assert.equal(gradesHasValidScope({ search: "ab" }), false);
  assert.equal(gradesHasValidScope({ search: "abc" }), true);
  assert.equal(gradesHasValidScope({ courseId: 1 }), true);

  await assert.rejects(
    () => listGrades(db, {}),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});
