const { test } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const { decorateCalendarEvent } = require("../../services/calendar/calendarEventDecorator");

function classSessionDto(overrides = {}) {
  return {
    id: "class-session:1",
    sourceType: "class_session",
    sourceId: 1,
    eventGroup: "class",
    indicatorType: "class",
    title: "Aula 1",
    startDate: "2026-08-20",
    endDate: null,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    status: "active",
    courseId: 1,
    courseName: "React",
    classId: 5,
    className: "Turma A",
    deepLink: "/professor/turmas/5/frequencia",
    ...overrides,
  };
}

test("class_session: professor recebe 'Abrir turma' e 'Gerenciar encontro' apontando pra /professor/encontros", () => {
  const decorated = decorateCalendarEvent(classSessionDto(), { role: "teacher", today: "2026-08-18" });

  const manage = decorated.actions.find((action) => action.label === "Gerenciar encontro");
  assert.ok(manage);
  assert.equal(manage.target, "/professor/encontros?classId=5&sessionId=1");

  assert.ok(decorated.actions.some((action) => action.label === "Abrir turma"));
});

test("class_session: admin recebe só 'Gerenciar encontro', apontando pra /admin/encontros", () => {
  const decorated = decorateCalendarEvent(classSessionDto(), { role: "admin", today: "2026-08-18" });

  assert.equal(decorated.actions.length, 1);
  assert.equal(decorated.actions[0].label, "Gerenciar encontro");
  assert.equal(decorated.actions[0].target, "/admin/encontros?classId=5&sessionId=1");
});

test("class_session: aluno não recebe nenhuma ação de gestão (sem página de Encontros do lado do aluno)", () => {
  const decorated = decorateCalendarEvent(classSessionDto(), { role: "student", today: "2026-08-18" });

  assert.deepEqual(decorated.actions, []);
});

test("academic_event: comportamento de admin/edição não foi afetado pela mudança em class_session", () => {
  const eventDto = {
    id: "academic-event:9",
    sourceType: "academic_event",
    sourceId: 9,
    eventGroup: "academic",
    indicatorType: "enrollment",
    title: "Matrícula",
    startDate: "2026-08-20",
    status: "active",
  };

  const decorated = decorateCalendarEvent(eventDto, { role: "admin", today: "2026-08-18" });

  assert.ok(decorated.actions.some((action) => action.type === "edit"));
  assert.ok(decorated.actions.some((action) => action.type === "cancel"));

  const studentView = decorateCalendarEvent(eventDto, { role: "student", today: "2026-08-18" });
  assert.deepEqual(studentView.actions, []);
});
