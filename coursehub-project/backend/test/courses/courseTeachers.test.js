const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");

const { createCourse, updateCourse, getCourseById } = require("../../services/admin/adminCourseService");
const { createTeacher, updateTeacher } = require("../../services/admin/adminTeacherService");
const { createClass, updateClass } = require("../../services/admin/adminClassService");

const {
  listCourseTeachers,
  listTeacherCourses: listCourseTeacherRows,
  isTeacherAssignedToCourse,
  assertTeacherAssignedToCourse,
} = require("../../services/courses/courseTeacherService");

const {
  assertCourseBelongsToTeacher,
  getClassOwnedByTeacher,
} = require("../../services/classes/classAccessService");

const { validateTeacherActivityAccess } = require("../../services/activities/activityScopeService");
const { listTeacherCourses } = require("../../services/teacher/teacherCourseService");

const RUN_ID = Date.now();
const COURSE_NAME_PREFIX = `TEST COURSE TEACHERS ${RUN_ID}`;

const createdCourseIds = [];
const createdTeacherIds = [];
const createdTeacherUserIds = [];
const createdClassIds = [];
const createdActivityIds = [];

function testEmail(label) {
  return `course.teachers.${RUN_ID}.${label}@example.com`;
}

// teachers.cpf é NOT NULL/UNIQUE no schema (mesmo a validação de
// negócio do admin não exigindo CPF) -- gera um CPF com dígitos
// verificadores válidos, mesmo algoritmo já usado em
// contractWithdrawal.test.js.
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

async function purgeFixtures() {
  if (createdActivityIds.length > 0) {
    await db.promise().query(`DELETE FROM activities WHERE id IN (?)`, [createdActivityIds]);
  }

  if (createdClassIds.length > 0) {
    await db.promise().query(`DELETE FROM classes WHERE id IN (?)`, [createdClassIds]);
  }

  if (createdCourseIds.length > 0 || createdTeacherIds.length > 0) {
    await db.promise().query(
      `DELETE FROM course_teachers WHERE course_id IN (?) OR teacher_id IN (?)`,
      [createdCourseIds.length > 0 ? createdCourseIds : [0], createdTeacherIds.length > 0 ? createdTeacherIds : [0]]
    );
  }

  if (createdCourseIds.length > 0) {
    await db.promise().query(`DELETE FROM courses WHERE id IN (?)`, [createdCourseIds]);
  }

  if (createdTeacherIds.length > 0) {
    await db.promise().query(`DELETE FROM teachers WHERE id IN (?)`, [createdTeacherIds]);
  }

  if (createdTeacherUserIds.length > 0) {
    await db.promise().query(`DELETE FROM users WHERE id IN (?)`, [createdTeacherUserIds]);
  }
}

before(async () => {
  // Limpa qualquer resíduo de uma execução anterior interrompida
  // (mesmo RUN_ID nunca colide entre execuções, mas o e-mail pattern
  // sim se dois processos de teste rodarem no mesmo milissegundo --
  // extremamente improvável, mantido só como defesa).
  const [staleUsers] = await db
    .promise()
    .query(`SELECT id FROM users WHERE email LIKE ?`, [`course.teachers.${RUN_ID}.%`]);

  if (staleUsers.length > 0) {
    const staleUserIds = staleUsers.map((row) => row.id);
    const [staleTeachers] = await db
      .promise()
      .query(`SELECT id FROM teachers WHERE user_id IN (?)`, [staleUserIds]);

    if (staleTeachers.length > 0) {
      const staleTeacherIds = staleTeachers.map((row) => row.id);
      await db.promise().query(`DELETE FROM course_teachers WHERE teacher_id IN (?)`, [staleTeacherIds]);
      await db.promise().query(`DELETE FROM classes WHERE teacher_id IN (?)`, [staleTeacherIds]);
      await db.promise().query(`DELETE FROM teachers WHERE id IN (?)`, [staleTeacherIds]);
    }

    await db.promise().query(`DELETE FROM users WHERE id IN (?)`, [staleUserIds]);
  }

  await db.promise().query(`DELETE FROM courses WHERE name LIKE ?`, [`${COURSE_NAME_PREFIX}%`]);
});

after(async () => {
  await purgeFixtures();
  await db.promise().end();
});

let teacherSequence = 0;

async function createTeacherFixture(label) {
  teacherSequence += 1;

  const teacher = await createTeacher(db, {
    name: `Professor Teste ${label} ${teacherSequence}`,
    email: testEmail(`teacher-${label}-${teacherSequence}`),
    password: "senhaSegura123",
    gender: "Masculino",
    status: "active",
    cpf: testCpf(teacherSequence),
  });

  createdTeacherIds.push(teacher.id);
  createdTeacherUserIds.push(teacher.user_id);

  return teacher;
}

let courseSequence = 0;

async function createCourseFixture({ teacherIds } = {}) {
  courseSequence += 1;

  const course = await createCourse(db, {
    name: `${COURSE_NAME_PREFIX} ${courseSequence}`,
    description: "Curso de teste (course_teachers)",
    workload_hours: 10,
    price: 0,
    status: "active",
    teacherIds,
  });

  createdCourseIds.push(course.id);

  return course;
}

async function createActivityFixture(courseId, { classId = null } = {}) {
  const [result] = await db.promise().query(
    `
      INSERT INTO activities (course_id, class_id, activity_kind, title, type, status, created_at, updated_at)
      VALUES (?, ?, 'activity', 'Atividade de teste', 'text', 'active', NOW(), NOW())
    `,
    [courseId, classId]
  );

  createdActivityIds.push(result.insertId);

  return result.insertId;
}

// -----------------------------------------------------------------
// A. Migration/backfill -- reconciliação de courses.teacher_id legado
// -----------------------------------------------------------------

test("A: um curso com teacher_id legado (sem linha em course_teachers ainda) é reconciliado ao ser lido com reconcileLegacy", async () => {
  const teacher = await createTeacherFixture("legacy-a");

  // Simula exatamente o estado que a migration de backfill corrigiu
  // para dados pré-existentes: teacher_id preenchido, nenhuma linha
  // correspondente em course_teachers.
  const course = await createCourseFixture({});
  await db.promise().query(`UPDATE courses SET teacher_id = ? WHERE id = ?`, [teacher.id, course.id]);

  const [[beforeRow]] = await db.promise().query(
    `SELECT status FROM course_teachers WHERE course_id = ? AND teacher_id = ?`,
    [course.id, teacher.id]
  );
  assert.equal(beforeRow, undefined, "não deveria existir linha em course_teachers antes da reconciliação");

  const teachers = await listCourseTeachers(db.promise(), course.id, { reconcileLegacy: true });

  assert.equal(teachers.length, 1);
  assert.equal(teachers[0].id, teacher.id);

  const [[afterRow]] = await db.promise().query(
    `SELECT status FROM course_teachers WHERE course_id = ? AND teacher_id = ?`,
    [course.id, teacher.id]
  );
  assert.equal(afterRow.status, "active");
});

// -----------------------------------------------------------------
// B/L. Curso com múltiplos professores; cadastro admin persiste
// -----------------------------------------------------------------

test("B/L: criar um curso com teacherIds=[Ana, João, Maria] persiste os três vínculos ativos", async () => {
  const ana = await createTeacherFixture("ana");
  const joao = await createTeacherFixture("joao");
  const maria = await createTeacherFixture("maria");

  const course = await createCourseFixture({ teacherIds: [ana.id, joao.id, maria.id] });

  const teachers = await listCourseTeachers(db.promise(), course.id);
  const teacherIds = teachers.map((teacher) => teacher.id).sort((a, b) => a - b);

  assert.deepEqual(teacherIds, [ana.id, joao.id, maria.id].sort((a, b) => a - b));
});

// -----------------------------------------------------------------
// M. Edição de curso adiciona/remove vínculos corretamente
// -----------------------------------------------------------------

test("M: editar um curso trocando teacherIds ativa os novos e desativa (sem apagar) os removidos", async () => {
  const teacher1 = await createTeacherFixture("edit1");
  const teacher2 = await createTeacherFixture("edit2");
  const teacher3 = await createTeacherFixture("edit3");

  const course = await createCourseFixture({ teacherIds: [teacher1.id, teacher2.id] });

  await updateCourse(db, course.id, {
    name: course.name,
    description: "Curso de teste (course_teachers) - editado",
    workload_hours: 10,
    price: 0,
    status: "active",
    teacherIds: [teacher2.id, teacher3.id],
  });

  const activeTeachers = await listCourseTeachers(db.promise(), course.id);
  const activeIds = activeTeachers.map((teacher) => teacher.id).sort((a, b) => a - b);

  assert.deepEqual(activeIds, [teacher2.id, teacher3.id].sort((a, b) => a - b));

  // teacher1 removido -- nunca DELETE, só status='inactive'.
  const [[removedRow]] = await db.promise().query(
    `SELECT status FROM course_teachers WHERE course_id = ? AND teacher_id = ?`,
    [course.id, teacher1.id]
  );
  assert.equal(removedRow.status, "inactive");
});

// -----------------------------------------------------------------
// N/O. Admin Teacher: cadastro/edição com cursos vinculados
// -----------------------------------------------------------------

test("N/O: cadastrar e editar um professor com courseIds sincroniza course_teachers pelo lado do professor", async () => {
  const courseA = await createCourseFixture({});
  const courseB = await createCourseFixture({});
  const courseC = await createCourseFixture({});

  teacherSequence += 1;

  const teacher = await createTeacher(db, {
    name: `Professor Teste multi-curso ${teacherSequence}`,
    email: testEmail(`teacher-multicourse-${teacherSequence}`),
    password: "senhaSegura123",
    gender: "Feminino",
    status: "active",
    cpf: testCpf(teacherSequence),
    courseIds: [courseA.id, courseB.id],
  });

  createdTeacherIds.push(teacher.id);
  createdTeacherUserIds.push(teacher.user_id);

  const coursesAfterCreate = await listCourseTeacherRows(db.promise(), teacher.id);
  const courseIdsAfterCreate = coursesAfterCreate.map((course) => course.id).sort((a, b) => a - b);
  assert.deepEqual(courseIdsAfterCreate, [courseA.id, courseB.id].sort((a, b) => a - b));

  await updateTeacher(db, teacher.id, {
    name: teacher.name,
    email: teacher.email,
    gender: "Feminino",
    cpf: testCpf(teacherSequence),
    status: "active",
    courseIds: [courseB.id, courseC.id],
  });

  const coursesAfterUpdate = await listCourseTeacherRows(db.promise(), teacher.id);
  const courseIdsAfterUpdate = coursesAfterUpdate.map((course) => course.id).sort((a, b) => a - b);
  assert.deepEqual(courseIdsAfterUpdate, [courseB.id, courseC.id].sort((a, b) => a - b));

  // courseA removido -- inactive, não deletado.
  const [[removedRow]] = await db.promise().query(
    `SELECT status FROM course_teachers WHERE course_id = ? AND teacher_id = ?`,
    [courseA.id, teacher.id]
  );
  assert.equal(removedRow.status, "inactive");
});

// -----------------------------------------------------------------
// C/D/E. "Meus cursos" -- um curso com vários professores aparece
// para cada um deles
// -----------------------------------------------------------------

test("C/D/E: um curso com Ana + João + Maria aparece em 'meus cursos' para os três", async () => {
  const ana = await createTeacherFixture("meuscursos-ana");
  const joao = await createTeacherFixture("meuscursos-joao");
  const maria = await createTeacherFixture("meuscursos-maria");
  const outsider = await createTeacherFixture("meuscursos-outsider");

  const course = await createCourseFixture({ teacherIds: [ana.id, joao.id, maria.id] });

  for (const teacher of [ana, joao, maria]) {
    const courses = await listTeacherCourses(db, teacher.user_id);
    assert.ok(
      courses.some((c) => c.id === course.id),
      `curso deveria aparecer em 'meus cursos' para ${teacher.name}`
    );
  }

  const outsiderCourses = await listTeacherCourses(db, outsider.user_id);
  assert.ok(
    !outsiderCourses.some((c) => c.id === course.id),
    "curso não deveria aparecer para um professor não vinculado"
  );
});

// -----------------------------------------------------------------
// F/G/H. Autorização geral do curso -- membros permitidos, não
// membro recebe 403
// -----------------------------------------------------------------

test("F/G/H: professores vinculados acessam o curso; professor não vinculado recebe 403", async () => {
  const ana = await createTeacherFixture("auth-ana");
  const joao = await createTeacherFixture("auth-joao");
  const outsider = await createTeacherFixture("auth-outsider");

  const course = await createCourseFixture({ teacherIds: [ana.id, joao.id] });

  await assertCourseBelongsToTeacher(db.promise(), { courseId: course.id, teacherId: ana.id });
  await assertCourseBelongsToTeacher(db.promise(), { courseId: course.id, teacherId: joao.id });

  await assert.rejects(
    () => assertCourseBelongsToTeacher(db.promise(), { courseId: course.id, teacherId: outsider.id }),
    (error) => {
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

// -----------------------------------------------------------------
// I. Atividades -- acesso geral do curso via course_teachers
// -----------------------------------------------------------------

test("I: professores vinculados ao curso têm acesso geral esperado a uma atividade do curso", async () => {
  const ana = await createTeacherFixture("activity-ana");
  const joao = await createTeacherFixture("activity-joao");
  const outsider = await createTeacherFixture("activity-outsider");

  const course = await createCourseFixture({ teacherIds: [ana.id, joao.id] });
  const activityId = await createActivityFixture(course.id);

  const { activity: activityForAna } = await validateTeacherActivityAccess(db.promise(), {
    userId: ana.user_id,
    activityId,
  });
  assert.equal(activityForAna.id, activityId);

  const { activity: activityForJoao } = await validateTeacherActivityAccess(db.promise(), {
    userId: joao.user_id,
    activityId,
  });
  assert.equal(activityForJoao.id, activityId);

  await assert.rejects(
    () => validateTeacherActivityAccess(db.promise(), { userId: outsider.user_id, activityId }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

// -----------------------------------------------------------------
// J/K. Turmas continuam com ownership próprio -- membership no curso
// não confere ownership automática de turma; backend valida
// professor<->curso na criação/edição de turma
// -----------------------------------------------------------------

test("J: membership no curso confere acesso operacional às turmas do curso (João acessa a Turma A de Ana)", async () => {
  const ana = await createTeacherFixture("turma-ana");
  const joao = await createTeacherFixture("turma-joao");

  const course = await createCourseFixture({ teacherIds: [ana.id, joao.id] });

  const classItem = await createClass(db, {
    name: "Turma A",
    course_id: course.id,
    teacher_id: ana.id,
    shift: "online",
    status: "active",
  });

  createdClassIds.push(classItem.id);

  const anaOwnsClass = await getClassOwnedByTeacher(db.promise(), { classId: classItem.id, teacherId: ana.id });
  assert.ok(anaOwnsClass, "Ana deveria ser dona da turma que ela mesma foi cadastrada como responsável");

  const joaoOwnsClass = await getClassOwnedByTeacher(db.promise(), { classId: classItem.id, teacherId: joao.id });
  assert.ok(joaoOwnsClass, "João deve operar a turma do curso em que é co-professor");
});

test("K: não é possível cadastrar/editar uma turma com professor não vinculado ao curso", async () => {
  const ana = await createTeacherFixture("turma-elig-ana");
  const outsider = await createTeacherFixture("turma-elig-outsider");

  const course = await createCourseFixture({ teacherIds: [ana.id] });

  await assert.rejects(
    () =>
      createClass(db, {
        name: "Turma B",
        course_id: course.id,
        teacher_id: outsider.id,
        shift: "online",
        status: "active",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /não está vinculado ao curso/);
      return true;
    }
  );

  const classItem = await createClass(db, {
    name: "Turma C",
    course_id: course.id,
    teacher_id: ana.id,
    shift: "online",
    status: "active",
  });

  createdClassIds.push(classItem.id);

  await assert.rejects(
    () =>
      updateClass(db, classItem.id, {
        name: "Turma C",
        teacher_id: outsider.id,
        shift: "online",
        status: "active",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /não está vinculado ao curso/);
      return true;
    }
  );
});

// -----------------------------------------------------------------
// P. Inativação de vínculo não concede acesso
// -----------------------------------------------------------------

test("P: um vínculo course_teachers inactive não concede acesso ao curso", async () => {
  const ana = await createTeacherFixture("inactive-ana");
  const joao = await createTeacherFixture("inactive-joao");

  const course = await createCourseFixture({ teacherIds: [ana.id, joao.id] });

  // Remove Ana via edição (fica inactive, não deletada).
  await updateCourse(db, course.id, {
    name: course.name,
    description: "Curso de teste (course_teachers)",
    workload_hours: 10,
    price: 0,
    status: "active",
    teacherIds: [joao.id],
  });

  const anaAssigned = await isTeacherAssignedToCourse(db.promise(), { courseId: course.id, teacherId: ana.id });
  assert.equal(anaAssigned, false);

  await assert.rejects(
    () => assertCourseBelongsToTeacher(db.promise(), { courseId: course.id, teacherId: ana.id }),
    (error) => {
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  // João continua com acesso normal.
  await assertCourseBelongsToTeacher(db.promise(), { courseId: course.id, teacherId: joao.id });
});

// -----------------------------------------------------------------
// Q. Compatibilidade -- teacher_id/teacher_name legados continuam
// funcionando
// -----------------------------------------------------------------

test("Q: listCourses/getCourseById continuam devolvendo teacher_id/teacher_name legados sem quebrar", async () => {
  const ana = await createTeacherFixture("compat-ana");

  const course = await createCourseFixture({});
  await db.promise().query(`UPDATE courses SET teacher_id = ? WHERE id = ?`, [ana.id, course.id]);

  const detail = await getCourseById(db, course.id);

  assert.equal(detail.teacher_id, ana.id);
  assert.equal(detail.teacher_name, ana.name);
  // E também já expõe os novos campos, convergidos pela reconciliação
  // de leitura.
  assert.ok(Array.isArray(detail.teachers));
  assert.ok(detail.teacherIds.includes(ana.id));
});

// -----------------------------------------------------------------
// R. Sem comportamento especial baseado em courses.teacher_id
// (nenhuma diferença de acesso entre "é o legado" e "é só membro")
// -----------------------------------------------------------------

test("R: um professor que é courses.teacher_id legado não tem nenhum privilégio a mais que um membro comum de course_teachers", async () => {
  const legacyTeacher = await createTeacherFixture("principal-legacy");
  const plainMember = await createTeacherFixture("principal-plain");

  const course = await createCourseFixture({ teacherIds: [legacyTeacher.id, plainMember.id] });
  await db.promise().query(`UPDATE courses SET teacher_id = ? WHERE id = ?`, [legacyTeacher.id, course.id]);

  // Ambos passam pela mesma checagem de autorização geral do curso,
  // com o mesmo resultado -- nenhum tratamento privilegiado para
  // quem também é courses.teacher_id.
  await assertCourseBelongsToTeacher(db.promise(), { courseId: course.id, teacherId: legacyTeacher.id });
  await assertCourseBelongsToTeacher(db.promise(), { courseId: course.id, teacherId: plainMember.id });

  const teachers = await listCourseTeachers(db.promise(), course.id);
  const legacyRow = teachers.find((teacher) => teacher.id === legacyTeacher.id);
  const plainRow = teachers.find((teacher) => teacher.id === plainMember.id);

  // Mesmo shape de dados para os dois -- nenhum campo "isPrimary"/
  // "principal" existe para distinguir um do outro.
  assert.deepEqual(Object.keys(legacyRow).sort(), Object.keys(plainRow).sort());
});

// -----------------------------------------------------------------
// assertTeacherAssignedToCourse com mensagem/status customizados
// (usado por adminClassService com 400, não 403)
// -----------------------------------------------------------------

test("assertTeacherAssignedToCourse aceita statusCode/message customizados", async () => {
  const ana = await createTeacherFixture("custom-msg-ana");
  const outsider = await createTeacherFixture("custom-msg-outsider");

  const course = await createCourseFixture({ teacherIds: [ana.id] });

  await assert.rejects(
    () =>
      assertTeacherAssignedToCourse(
        db.promise(),
        { courseId: course.id, teacherId: outsider.id },
        { statusCode: 422, message: "mensagem customizada" }
      ),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.message, "mensagem customizada");
      return true;
    }
  );
});
