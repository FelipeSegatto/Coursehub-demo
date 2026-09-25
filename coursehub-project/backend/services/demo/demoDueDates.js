/**
 * No login da demo, as peças ainda abertas do roteiro vencem no fim
 * do dia corrente em America/Sao_Paulo. O snapshot guarda uma data
 * fixa; este ajuste reescreve só o banco ativo.
 */
const db = require("../../db");
const { TIMEZONE } = require("../../utils/appConfig");

const ROTEIRO_TITLES = [
  "Quiz rápido: req, res e a primeira rota",
  "Atividade Final: o que o useState devolve",
  "Quiz rápido: o que o useState devolve",
  "Avaliação final — React na prática",
];

function isDemoDueDateShiftEnabled() {
  const reset = String(process.env.DEMO_RESET_ON_LOGOUT || "").toLowerCase() === "true";
  const demo = String(process.env.DEMO_MODE || "").toLowerCase() === "true";
  return reset || demo;
}

function todayInAppTimezone(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function endOfTodayInAppTimezone(now = new Date()) {
  return `${todayInAppTimezone(now)} 23:59:00`;
}

async function shiftRoteiroDueDatesToToday(runner = db.promise(), now = new Date()) {
  if (!isDemoDueDateShiftEnabled()) return { updated: 0 };

  const dueAt = endOfTodayInAppTimezone(now);
  const [result] = await runner.query(
    `UPDATE activities SET due_date = ? WHERE title IN (?) AND status = 'active'`,
    [dueAt, ROTEIRO_TITLES]
  );

  return { updated: result.affectedRows, dueAt };
}

module.exports = {
  ROTEIRO_TITLES,
  isDemoDueDateShiftEnabled,
  endOfTodayInAppTimezone,
  todayInAppTimezone,
  shiftRoteiroDueDatesToToday,
};
