const SESSION_TYPE_LABEL = {
  class: "Aula",
  review: "Revisão",
  exam: "Prova",
  presentation: "Apresentação",
  workshop: "Workshop",
  lab: "Laboratório",
  recovery: "Recuperação",
  other: "Outro",
};

const SESSION_STATUS_LABEL = { scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado" };

const SESSION_STATUS_CLASSES = {
  scheduled: "border-blue-100 bg-blue-50 text-blue-700",
  completed: "border-green-100 bg-green-50 text-green-700",
  cancelled: "border-gray-200 bg-gray-100 text-gray-600",
};

function formatLongDate(value) {
  if (!value) return "—";

  const date = new Date(String(value).slice(0, 10) + "T00:00:00");

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function formatSessionTime(startTime, endTime) {
  if (!startTime) return "Sem horário definido";

  const start = String(startTime).slice(0, 5);

  return endTime ? `${start} – ${String(endTime).slice(0, 5)}` : start;
}

/**
 * Cartão de encontro compartilhado por TeacherSessionsPage.jsx e
 * AdminSessionsPage.jsx -- mesma apresentação visual da seção de
 * encontros em TeacherClassDetails.jsx, sem copiar o arquivo inteiro.
 * onViewAttendance é opcional (professor e admin têm rotas de
 * frequência diferentes, quem usa o card decide o link).
 */
export default function SessionCard({ session, onEdit, onCancel, onViewAttendance, onViewCalendar, cancelling }) {
  const attendanceSummary = session.attendanceSummary || {};
  const hasAttendance = Number(attendanceSummary.total || 0) > 0;
  const isCancelled = session.status === "cancelled";
  const isCompleted = session.status === "completed";

  return (
    <article
      className={`rounded-3xl border p-5 transition sm:p-6 ${
        isCancelled ? "border-gray-200 bg-gray-50 opacity-80" : "border-gray-100 bg-white hover:border-blue-100 hover:shadow-sm"
      }`}
    >
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-blue-600">
              Encontro {String(session.sessionNumber || 0).padStart(2, "0")}
            </span>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${SESSION_STATUS_CLASSES[session.status] || SESSION_STATUS_CLASSES.scheduled}`}
            >
              {SESSION_STATUS_LABEL[session.status] || session.status}
            </span>

            <span className="rounded-full border border-purple-100 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
              {SESSION_TYPE_LABEL[session.sessionType] || session.sessionType}
            </span>
          </div>

          <h3 className="mt-3 text-xl font-bold text-gray-900">{session.title}</h3>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
            <span>{formatLongDate(session.sessionDate)}</span>
            <span>{formatSessionTime(session.startTime, session.endTime)}</span>
          </div>

          {session.description && (
            <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-600">{session.description}</p>
          )}

          {hasAttendance && (
            <div className="mt-5 flex flex-wrap gap-3 text-xs font-semibold">
              <span className="rounded-lg bg-green-50 px-3 py-2 text-green-700">{attendanceSummary.present || 0} presentes</span>
              <span className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{attendanceSummary.absent || 0} ausentes</span>
              <span className="rounded-lg bg-yellow-50 px-3 py-2 text-yellow-700">{attendanceSummary.late || 0} atrasados</span>
              <span className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">{attendanceSummary.excused || 0} justificados</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {!isCancelled && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Editar
              </button>

              {onViewAttendance && (
                <button
                  type="button"
                  onClick={onViewAttendance}
                  className="rounded-xl bg-blue-100 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-200"
                >
                  {isCompleted || hasAttendance ? "Ver chamada" : "Registrar chamada"}
                </button>
              )}

              {onViewCalendar && (
                <button
                  type="button"
                  onClick={onViewCalendar}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Ver no calendário
                </button>
              )}

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={cancelling}
                  className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelling ? "Cancelando..." : "Cancelar"}
                </button>
              )}
            </>
          )}

          {isCancelled && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Editar encontro
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
