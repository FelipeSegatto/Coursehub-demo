import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { apiFetch } from "../../services/APIService";
import { listClasses } from "../../services/AdminClassService";
import { listAdminSessions, saveAdminSession, cancelAdminSession } from "../../services/AdminSessionService";
import { useAppliedFilters } from "../../hooks/useAppliedFilters";

import SessionCard from "../../components/sessions/SessionCard";
import SessionModal from "../../components/teachers/SessionModal";
import HoldToConfirmButton from "../../components/ui/actions/HoldToConfirmButton";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";

const SESSION_TYPE_OPTIONS = [
  { value: "class", label: "Aula" },
  { value: "review", label: "Revisão" },
  { value: "exam", label: "Prova" },
  { value: "presentation", label: "Apresentação" },
  { value: "workshop", label: "Workshop" },
  { value: "lab", label: "Laboratório" },
  { value: "recovery", label: "Recuperação" },
  { value: "other", label: "Outro" },
];

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Agendado" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

const INITIAL_DRAFT = { courseId: "", teacherId: "", classId: "", status: "", sessionType: "", from: "", to: "" };

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-40 truncate";

const dateInputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-36";

/**
 * Encontros administrativos -- mesmo componente de card/formulário do
 * professor (SessionCard/SessionModal), mas autorização e endpoints
 * são os administrativos (AdminSessionService.jsx), nunca o professor
 * "fingido". Turma é obrigatória para consultar/criar; curso e
 * professor só restringem as opções de turma.
 */
export default function AdminSessionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { draft, updateDraft, applied, hasApplied, isStale, apply, clear } = useAppliedFilters(INITIAL_DRAFT);

  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [filterClasses, setFilterClasses] = useState([]);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadBaseOptions() {
      try {
        const [coursesResponse, teachersResponse] = await Promise.all([
          apiFetch("/api/admin/courses"),
          apiFetch("/api/admin/teachers"),
        ]);

        if (ignoreRequest) return;

        setCourses(Array.isArray(coursesResponse) ? coursesResponse : []);
        setTeachers(Array.isArray(teachersResponse) ? teachersResponse : []);
      } catch (requestError) {
        if (!ignoreRequest) console.error("Erro ao carregar filtros base:", requestError);
      }
    }

    loadBaseOptions();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  // Deep link vindo do calendário ("Gerenciar encontro"): aplica
  // direto pelo classId da URL, sem exigir curso/professor
  // selecionados antes -- se a turma não existir/não estiver
  // autorizada, a própria consulta (backend) devolve erro, nunca
  // quebra a tela. O dropdown de turma fica em branco até o admin
  // escolher curso/professor manualmente, mas o resultado já aparece.
  useEffect(() => {
    const classIdFromUrl = searchParams.get("classId");

    if (!hasApplied && classIdFromUrl) {
      updateDraft({ classId: classIdFromUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const classIdFromUrl = searchParams.get("classId");

    if (!hasApplied && classIdFromUrl && draft.classId === classIdFromUrl) {
      apply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.classId]);

  useEffect(() => {
    if (!draft.courseId && !draft.teacherId) {
      setFilterClasses([]);
      if (draft.classId) updateDraft({ classId: "" });
      return;
    }

    let ignoreRequest = false;

    async function loadClassesForFilter() {
      try {
        const response = await listClasses({ courseId: draft.courseId, teacherId: draft.teacherId, limit: 100 });

        if (!ignoreRequest) setFilterClasses(Array.isArray(response?.data) ? response.data : []);
      } catch (requestError) {
        if (!ignoreRequest) console.error("Erro ao carregar turmas:", requestError);
      }
    }

    loadClassesForFilter();

    return () => {
      ignoreRequest = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.courseId, draft.teacherId]);

  async function fetchSessions() {
    if (!applied?.classId) return;

    try {
      setLoading(true);
      setError("");

      const response = await listAdminSessions({
        classId: applied.classId,
        status: applied.status,
        sessionType: applied.sessionType,
        from: applied.from,
        to: applied.to,
      });

      setResult(response || null);
    } catch (requestError) {
      console.error("[AdminSessionsPage] erro:", requestError);
      setError(requestError.message || "Não foi possível carregar os encontros.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  function openCreateModal() {
    setEditingSession(null);
    setModalOpen(true);
  }

  function openEditModal(session) {
    setEditingSession(session);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingSession(null);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;

    try {
      setCancelling(true);

      await cancelAdminSession(cancelTarget.id);

      setCancelTarget(null);
      await fetchSessions();
    } catch (requestError) {
      console.error("Erro ao cancelar encontro:", requestError);
    } finally {
      setCancelling(false);
    }
  }

  const nextSessionNumber = result?.sessions?.length
    ? Math.max(...result.sessions.map((session) => session.sessionNumber || 0)) + 1
    : 1;

  const canApply = Boolean(draft.classId);

  const activeFilterCount = [draft.status, draft.sessionType, draft.from, draft.to].filter(Boolean).length;

  return (
    <main className="p-6">
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Encontros</h1>
          <p className="mt-2 text-gray-600">Gerencie os encontros de qualquer turma da instituição.</p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          disabled={!hasApplied}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Novo encontro
        </button>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-4">
          <select
            value={draft.teacherId}
            onChange={(event) => updateDraft({ teacherId: event.target.value, classId: "" })}
            className={inputClass}
          >
            <option value="">Todos os professores</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>

          <select
            value={draft.courseId}
            onChange={(event) => updateDraft({ courseId: event.target.value, classId: "" })}
            className={inputClass}
          >
            <option value="">Todos os cursos</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>

          <select
            value={draft.classId}
            onChange={(event) => updateDraft({ classId: event.target.value })}
            disabled={filterClasses.length === 0}
            className={inputClass}
          >
            <option value="">Selecione a turma</option>
            {filterClasses.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
              </option>
            ))}
          </select>

          <MobileFilterToggle activeCount={activeFilterCount}>
            <select
              value={draft.status}
              onChange={(event) => updateDraft({ status: event.target.value })}
              className={inputClass}
            >
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={draft.sessionType}
              onChange={(event) => updateDraft({ sessionType: event.target.value })}
              className={inputClass}
            >
              <option value="">Todos os tipos</option>
              {SESSION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={draft.from}
              onChange={(event) => updateDraft({ from: event.target.value })}
              className={dateInputClass}
              title="De"
            />

            <input
              type="date"
              value={draft.to}
              onChange={(event) => updateDraft({ to: event.target.value })}
              className={dateInputClass}
              title="Até"
            />
          </MobileFilterToggle>

          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Aplicar filtros
          </button>

          {hasApplied && (
            <button
              type="button"
              onClick={clear}
              className="text-sm font-semibold text-gray-500 hover:text-gray-700 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mt-6">
          {!hasApplied && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
              <p className="font-semibold text-gray-700">Selecione a turma e clique em Aplicar para ver os encontros.</p>
              <p className="mt-2 text-sm text-gray-500">Curso e professor ajudam a restringir as opções de turma.</p>
            </div>
          )}

          {hasApplied && isStale && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
              Os filtros foram alterados -- clique em "Aplicar filtros" para atualizar os resultados abaixo.
            </p>
          )}

          {hasApplied && loading && <p className="py-6 text-center text-gray-500">Carregando encontros...</p>}

          {hasApplied && !loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {hasApplied && !loading && !error && result && (
            <>
              <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {result.class.name} · {result.class.courseName}
                {result.class.teacher ? ` · Professor: ${result.class.teacher.name}` : ""}
              </div>

              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
                <SummaryCard title="Planejados" value={result.summary.plannedSessionCount || "—"} />
                <SummaryCard title="Agendados" value={result.summary.scheduled} />
                <SummaryCard title="Concluídos" value={result.summary.completed} />
                <SummaryCard title="Cancelados" value={result.summary.cancelled} />
                <SummaryCard title="Restam planejar" value={result.summary.remainingToPlan ?? "—"} />
              </div>

              {result.sessions.length === 0 ? (
                <p className="py-10 text-center text-gray-500">Nenhum encontro cadastrado para os filtros aplicados.</p>
              ) : (
                <div className="space-y-4">
                  {result.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onEdit={() => openEditModal(session)}
                      onCancel={() => setCancelTarget(session)}
                      onViewAttendance={
                        Number(session.attendanceSummary?.total || 0) > 0
                          ? () => navigate(`/admin/frequencia/encontros/${session.id}`)
                          : undefined
                      }
                      onViewCalendar={() =>
                        navigate(`/admin/calendario?date=${String(session.sessionDate).slice(0, 10)}`)
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <SessionModal
        open={modalOpen}
        classId={applied?.classId}
        session={editingSession}
        nextSessionNumber={nextSessionNumber}
        onClose={closeModal}
        onSaved={fetchSessions}
        onSubmit={saveAdminSession}
      />

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900">Cancelar encontro</h2>
            <p className="mt-3 text-sm text-gray-600">
              Tem certeza que deseja cancelar <strong>{cancelTarget.title}</strong>?
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Voltar
              </button>

              <HoldToConfirmButton
                variant="danger"
                holdDuration={1200}
                onConfirm={handleConfirmCancel}
                disabled={cancelling}
                loading={cancelling}
              >
                Confirmar cancelamento
              </HoldToConfirmButton>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ title, value }) {
  return (
    <article className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </article>
  );
}
