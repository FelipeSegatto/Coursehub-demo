import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";
import { getAttendanceHistory } from "../../services/TeacherAttendanceHistoryService";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import { formatDisplayDate } from "../../utils/dateUtils";

const SESSION_STATUS_OPTIONS = [
  { value: "scheduled", label: "Agendada" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
  { value: "archived", label: "Arquivada" },
];

const ATTENDANCE_STATUS_OPTIONS = [
  { value: "complete", label: "Chamada concluída" },
  { value: "pending", label: "Chamada pendente" },
];

const PAGE_LIMIT = 10;

function formatShortDate(value) {
  if (!value) return "-";

  return formatDisplayDate(String(value).slice(0, 10), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function TeacherAttendanceHistory() {
  const { usuarioLogado } = useAuth();

  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sessionStatus, setSessionStatus] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("");
  const [page, setPage] = useState(1);

  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!usuarioLogado?.id) return;

    let ignoreRequest = false;

    async function loadClasses() {
      try {
        setLoadingClasses(true);

        const response = await apiFetch(
          `/api/teacher/by-user/${usuarioLogado.id}/classes`
        );

        const classList = Array.isArray(response)
          ? response
          : Array.isArray(response?.classes)
            ? response.classes
            : Array.isArray(response?.data)
              ? response.data
              : [];

        if (!ignoreRequest) {
          setClasses(classList);
        }
      } catch (requestError) {
        if (!ignoreRequest) {
          console.error("Erro ao carregar turmas:", requestError);
          setClasses([]);
        }
      } finally {
        if (!ignoreRequest) {
          setLoadingClasses(false);
        }
      }
    }

    loadClasses();

    return () => {
      ignoreRequest = true;
    };
  }, [usuarioLogado?.id]);

  const fetchHistory = useCallback(async () => {
    if (!classId) {
      setHistory(null);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await getAttendanceHistory({
        classId,
        from,
        to,
        sessionStatus,
        attendanceStatus,
        page,
        limit: PAGE_LIMIT,
      });

      setHistory(result);
    } catch (requestError) {
      console.error("[TeacherAttendanceHistory] erro:", requestError);
      setError(
        requestError.message || "Não foi possível carregar o histórico de frequência."
      );
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }, [classId, from, to, sessionStatus, attendanceStatus, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function handleClassChange(event) {
    setClassId(event.target.value);
    setPage(1);
  }

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-auto";

  const pagination = history?.pagination;

  const activeFilterCount = [from, to, sessionStatus, attendanceStatus].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Área do Professor</p>

            <h1 className="mt-2 text-4xl font-bold text-gray-900">
              Histórico de frequência
            </h1>

            <p className="mt-3 max-w-3xl text-gray-600">
              Selecione uma turma para ver o resumo e o histórico de chamadas já
              registradas.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/professor/minhas-turmas"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Abrir minhas turmas
            </Link>

            {classId && (
              <Link
                to={`/professor/turmas/${classId}/frequencia`}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Registrar chamada
              </Link>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <select
              value={classId}
              onChange={handleClassChange}
              disabled={loadingClasses}
              className={inputClass}
            >
              <option value="">
                {loadingClasses ? "Carregando turmas..." : "Selecione uma turma"}
              </option>

              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>

            <MobileFilterToggle activeCount={activeFilterCount}>
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                disabled={!classId}
                className={inputClass}
                title="De"
              />

              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                disabled={!classId}
                className={inputClass}
                title="Até"
              />

              <select
                value={sessionStatus}
                onChange={(event) => {
                  setSessionStatus(event.target.value);
                  setPage(1);
                }}
                disabled={!classId}
                className={inputClass}
              >
                <option value="">Todos os status de sessão</option>
                {SESSION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={attendanceStatus}
                onChange={(event) => {
                  setAttendanceStatus(event.target.value);
                  setPage(1);
                }}
                disabled={!classId}
                className={inputClass}
              >
                <option value="">Chamada pendente e concluída</option>
                {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </MobileFilterToggle>
          </div>
        </section>

        {!classId && !loadingClasses && (
          <p className="mt-8 py-12 text-center text-gray-500">
            Selecione uma turma acima para ver o resumo e o histórico de chamadas.
          </p>
        )}

        {classId && loading && (
          <p className="mt-8 py-12 text-center text-gray-500">
            Carregando histórico...
          </p>
        )}

        {classId && !loading && error && (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={fetchHistory}
              className="text-sm font-semibold text-red-700 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {classId && !loading && !error && history && (
          <>
            <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Sessões no período" value={history.summary.totalSessions} />
              <StatCard
                title="Chamadas concluídas"
                value={history.summary.completedCalls}
                color="green"
              />
              <StatCard
                title="Chamadas pendentes"
                value={history.summary.pendingCalls}
                color={history.summary.pendingCalls > 0 ? "yellow" : "blue"}
              />
              <StatCard
                title="Frequência média"
                value={
                  history.summary.averageAttendanceRate !== null
                    ? `${history.summary.averageAttendanceRate}%`
                    : "-"
                }
                color="purple"
              />
            </section>

            <section className="mt-6 grid gap-6 md:grid-cols-4">
              <StatCard title="Presentes" value={history.summary.present} color="green" />
              <StatCard title="Ausentes" value={history.summary.absent} color="red" />
              <StatCard title="Atrasados" value={history.summary.late} color="yellow" />
              <StatCard title="Justificados" value={history.summary.excused} />
            </section>

            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                {history.class.name} · {history.class.course.name}
              </h2>

              {history.sessions.length === 0 ? (
                <p className="mt-6 py-6 text-center text-gray-500">
                  Nenhuma sessão encontrada para os filtros selecionados.
                </p>
              ) : (
                <>
                  <div className="mt-6 hidden space-y-4 md:block">
                    {history.sessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-xl border border-gray-100 bg-gray-50 p-5"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-gray-900">{session.title}</p>

                            <p className="mt-1 text-sm text-gray-500">
                              {formatShortDate(session.sessionDate)}
                              {session.startTime ? ` · ${session.startTime.slice(0, 5)}` : ""}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <StatusBadge status={session.status} />

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                session.attendanceStatus === "complete"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {session.attendanceStatus === "complete"
                                ? "Chamada concluída"
                                : "Chamada pendente"}
                            </span>

                            <span className="text-sm text-gray-600">
                              {session.counts.present}/{session.counts.total} presentes
                            </span>

                            <Link
                              to={session.deepLink}
                              className="rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-200"
                            >
                              {session.attendanceStatus === "complete"
                                ? "Ver chamada"
                                : "Registrar chamada"}
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 space-y-3 md:hidden">
                    {history.sessions.map((session) => (
                      <MobileExpandableCard
                        key={session.id}
                        title={session.title}
                        subtitle={`${formatShortDate(session.sessionDate)}${
                          session.startTime ? ` · ${session.startTime.slice(0, 5)}` : ""
                        }`}
                        badge={<StatusBadge status={session.status} size="sm" />}
                        primaryAction={
                          <TableActionButton
                            variant="accent"
                            size="md"
                            className="w-full"
                            to={session.deepLink}
                          >
                            {session.attendanceStatus === "complete"
                              ? "Ver chamada"
                              : "Registrar chamada"}
                          </TableActionButton>
                        }
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Chamada</span>
                          <span className="font-medium text-gray-900">
                            {session.attendanceStatus === "complete"
                              ? "Chamada concluída"
                              : "Chamada pendente"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Presentes</span>
                          <span className="font-medium text-gray-900">
                            {session.counts.present}/{session.counts.total}
                          </span>
                        </div>
                      </MobileExpandableCard>
                    ))}
                  </div>
                </>
              )}

              {pagination && pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between gap-4">
                  <p className="text-sm text-gray-500">
                    Página {pagination.page} de {pagination.totalPages} ·{" "}
                    {pagination.total} sessão(ões)
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(current - 1, 1))}
                      disabled={pagination.page <= 1}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPage((current) => Math.min(current + 1, pagination.totalPages))
                      }
                      disabled={pagination.page >= pagination.totalPages}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
