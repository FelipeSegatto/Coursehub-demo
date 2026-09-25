import { useEffect, useState } from "react";

import { apiFetch } from "../../services/APIService";
import { listEnrollments } from "../../services/AdminEnrollmentService";
import {
  getAdminCompletionEligibility,
  listCompletionRules,
  createCompletionRule,
  revokeDeclaration,
  revokeCertificate,
  reissueCertificate,
  getAdminEnrollmentDeclarationEndpoints,
  getAdminAttendanceDeclarationEndpoints,
  getAdminCompletionDeclarationEndpoints,
  getAdminCertificateEndpoints,
} from "../../services/AcademicDocumentsService";
import DocumentDownloadButton from "../../components/documents/DocumentDownloadButton";

function EnrollmentSearch({ onSelect, selectedId }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      try {
        const response = await listEnrollments({ search, limit: 10 });
        if (!cancelled) setResults(response.data || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">Buscar matrícula</h2>

      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Nome do aluno, matrícula ou curso..."
        className="w-full rounded-xl border border-gray-300 px-4 py-2 outline-none focus:border-blue-500"
      />

      <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
        {loading && <p className="text-sm text-slate-500">Buscando...</p>}

        {!loading && results.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma matrícula encontrada.</p>
        )}

        {results.map((enrollment) => (
          <button
            key={enrollment.id}
            type="button"
            onClick={() => onSelect(enrollment)}
            className={`w-full rounded-xl border p-3 text-left text-sm transition ${
              selectedId === enrollment.id
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className="font-semibold text-slate-900">{enrollment.student.name}</p>
            <p className="text-slate-500">{enrollment.course.name}</p>
            <p className="mt-1 text-xs text-slate-400">Matrícula #{enrollment.id} · {enrollment.status}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function EligibilityPanel({ enrollmentId }) {
  const [state, setState] = useState("idle");
  const [evaluation, setEvaluation] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function checkEligibility() {
    setState("loading");
    setErrorMessage("");

    try {
      const { data } = await getAdminCompletionEligibility(enrollmentId);
      setEvaluation(data);
      setState("done");
    } catch (error) {
      setErrorMessage(error.message || "Não foi possível avaliar a elegibilidade.");
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Elegibilidade para conclusão</h3>
        <button
          type="button"
          onClick={checkEligibility}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Verificar
        </button>
      </div>

      {state === "error" && <p className="mt-3 text-sm text-red-600">{errorMessage}</p>}

      {evaluation && (
        <div className="mt-4">
          <p
            className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
              evaluation.eligible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {evaluation.eligible ? "Elegível" : "Não elegível"}
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Critério</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Exigido</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Alcançado</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.requirements.map((requirement) => (
                <tr key={requirement.key} className="border-b border-slate-50">
                  <td className="px-3 py-3 text-sm font-medium text-slate-900">{requirement.label}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-600">{String(requirement.required)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-slate-600">
                    {requirement.actual === null ? "—" : String(requirement.actual)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <span className={requirement.met ? "text-emerald-600" : "text-red-600"}>
                      {requirement.met ? "✓" : "✗"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RevokeButton({ onRevoke, label = "Revogar" }) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!showReason) {
    return (
      <button
        type="button"
        onClick={() => setShowReason(true)}
        className="text-sm font-semibold text-red-600 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo da revogação"
        className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
      />
      <button
        type="button"
        disabled={busy || !reason.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onRevoke(reason);
            setShowReason(false);
            setReason("");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white disabled:bg-gray-300"
      >
        Confirmar
      </button>
      <button type="button" onClick={() => setShowReason(false)} className="text-sm text-slate-500">
        Cancelar
      </button>
    </div>
  );
}

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function CertificateSection({ enrollmentId, refreshKey, onChanged }) {
  const [completedAt, setCompletedAt] = useState(todayInputValue);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-semibold text-slate-900">Certificado</h3>

      <label className="mb-3 block text-xs text-slate-500">
        Data de conclusão
        <input
          type="date"
          value={completedAt}
          onChange={(event) => setCompletedAt(event.target.value)}
          className="mt-1 block rounded-lg border border-gray-300 px-2 py-1 text-sm text-slate-900"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <DocumentDownloadButton
          key={refreshKey}
          endpoints={getAdminCertificateEndpoints(enrollmentId, completedAt)}
          label="certificado"
        />

        <RevokeButton
          onRevoke={async (reason) => {
            const { data } = await getAdminCertificateEndpoints(enrollmentId).status().catch(() => ({ data: null }));
            if (data?.id) {
              await revokeCertificate(data.id, reason);
              onChanged();
            }
          }}
        />

        <button
          type="button"
          onClick={async () => {
            const { data } = await getAdminCertificateEndpoints(enrollmentId).status().catch(() => ({ data: null }));
            if (data?.id) {
              await reissueCertificate(data.id, completedAt);
              onChanged();
            }
          }}
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          Reemitir
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        A data preenchida entra no certificado. Só emite se a matrícula for elegível. Para trocar a data de um certificado já emitido, revogue e reemita.
      </p>
    </div>
  );
}

function DeclarationSection({ title, description, endpoints, refreshKey, onChanged }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DocumentDownloadButton key={refreshKey} endpoints={endpoints} label="declaração" />

        <RevokeButton
          onRevoke={async (reason) => {
            const { data } = await endpoints.status().catch(() => ({ data: null }));
            if (data?.id) {
              await revokeDeclaration(data.id, reason);
              onChanged();
            }
          }}
        />
      </div>
    </div>
  );
}

function AttendanceDeclarationSection({ enrollmentId, refreshKey, onChanged }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [end, setEnd] = useState(today);

  const endpoints = getAdminAttendanceDeclarationEndpoints(enrollmentId, {
    referencePeriodStart: start,
    referencePeriodEnd: end,
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">Declaração de frequência</h3>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-500">
          De
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="ml-2 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Até
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="ml-2 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DocumentDownloadButton key={`${refreshKey}-${start}-${end}`} endpoints={endpoints} label="declaração" />

        <RevokeButton
          onRevoke={async (reason) => {
            const { data } = await endpoints.status().catch(() => ({ data: null }));
            if (data?.id) {
              await revokeDeclaration(data.id, reason);
              onChanged();
            }
          }}
        />
      </div>
    </div>
  );
}

const EMPTY_RULE_FORM = {
  minContentProgressPercentage: "",
  minAttendancePercentage: "",
  minAverageGrade: "",
  requireAllMandatoryItems: true,
};

function ruleToForm(rule) {
  if (!rule) return { ...EMPTY_RULE_FORM };

  return {
    minContentProgressPercentage: rule.min_content_progress_percentage ?? "",
    minAttendancePercentage: rule.min_attendance_percentage ?? "",
    minAverageGrade: rule.min_average_grade ?? "",
    requireAllMandatoryItems: Boolean(rule.require_all_mandatory_items),
  };
}

function describeRule(rule) {
  return `progresso ≥ ${rule.min_content_progress_percentage ?? "—"}% · frequência ≥ ${rule.min_attendance_percentage ?? "—"}% · nota ≥ ${rule.min_average_grade ?? "—"} · obrigatórias ${rule.require_all_mandatory_items ? "sim" : "não"}`;
}

function readCourseList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.courses)) return payload.courses;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function CompletionRuleSummary({ courseId, refreshKey, onEdit }) {
  const [activeRule, setActiveRule] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoaded(false);

      try {
        const { data } = await listCompletionRules(courseId);
        const rules = Array.isArray(data) ? data : [];
        if (!cancelled) setActiveRule(rules.find((rule) => rule.status === "active") || null);
      } catch {
        if (!cancelled) setActiveRule(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [courseId, refreshKey]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">Regra de conclusão do curso</h3>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Editar regras
        </button>
      </div>

      {!loaded && <p className="mt-2 text-sm text-slate-500">Carregando regra...</p>}

      {loaded && activeRule && (
        <p className="mt-2 text-sm text-slate-600">
          Versão ativa: #{activeRule.version} · {describeRule(activeRule)}
        </p>
      )}

      {loaded && !activeRule && (
        <p className="mt-2 text-sm text-amber-600">Nenhuma regra ativa — certificados não podem ser emitidos.</p>
      )}
    </div>
  );
}

function CompletionRulesModal({ open, initialCourseId, onClose, onSaved }) {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY_RULE_FORM);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingRules, setLoadingRules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("neutral");

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, saving, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setCourseId(initialCourseId ? String(initialCourseId) : "");
    setMessage("");

    async function loadCourses() {
      setLoadingCourses(true);

      try {
        const response = await apiFetch("/api/admin/courses");
        if (!cancelled) setCourses(readCourseList(response));
      } catch (error) {
        if (!cancelled) {
          setCourses([]);
          setMessage(error.message || "Não foi possível carregar os cursos.");
          setMessageTone("error");
        }
      } finally {
        if (!cancelled) setLoadingCourses(false);
      }
    }

    loadCourses();

    return () => {
      cancelled = true;
    };
  }, [open, initialCourseId]);

  useEffect(() => {
    if (!open || !courseId) {
      setRules([]);
      setForm({ ...EMPTY_RULE_FORM });
      return undefined;
    }

    let cancelled = false;

    async function loadRules() {
      setLoadingRules(true);
      setMessage("");

      try {
        const { data } = await listCompletionRules(courseId);
        const nextRules = Array.isArray(data) ? data : [];
        if (cancelled) return;
        setRules(nextRules);
        setForm(ruleToForm(nextRules.find((rule) => rule.status === "active")));
      } catch (error) {
        if (cancelled) return;
        setRules([]);
        setForm({ ...EMPTY_RULE_FORM });
        setMessage(error.message || "Não foi possível carregar as regras deste curso.");
        setMessageTone("error");
      } finally {
        if (!cancelled) setLoadingRules(false);
      }
    }

    loadRules();

    return () => {
      cancelled = true;
    };
  }, [open, courseId]);

  if (!open) return null;

  const activeRule = rules.find((rule) => rule.status === "active");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!courseId || saving) return;

    setSaving(true);
    setMessage("");

    try {
      await createCompletionRule(courseId, {
        minContentProgressPercentage: form.minContentProgressPercentage === "" ? null : form.minContentProgressPercentage,
        minAttendancePercentage: form.minAttendancePercentage === "" ? null : form.minAttendancePercentage,
        minAverageGrade: form.minAverageGrade === "" ? null : form.minAverageGrade,
        requireAllMandatoryItems: form.requireAllMandatoryItems,
      });

      const { data } = await listCompletionRules(courseId);
      const nextRules = Array.isArray(data) ? data : [];
      setRules(nextRules);
      setForm(ruleToForm(nextRules.find((rule) => rule.status === "active")));
      setMessage("Regra salva. A versão anterior continua valendo para os documentos já emitidos.");
      setMessageTone("success");
      onSaved();
    } catch (error) {
      setMessage(error.message || "Não foi possível salvar a regra.");
      setMessageTone("error");
    } finally {
      setSaving(false);
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && !saving) onClose();
  }

  const inputClass = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400";

  return (
    <div
      role="presentation"
      onMouseDown={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-rules-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="completion-rules-title" className="text-lg font-semibold text-slate-900">
              Regras de conclusão
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Escolha o curso e ajuste os critérios. Salvar cria uma nova versão ativa.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar modal"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-5 py-5">
            <label className="block text-sm font-medium text-slate-700">
              Curso
              <select
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                disabled={loadingCourses || saving}
                className={inputClass}
              >
                <option value="">{loadingCourses ? "Carregando cursos..." : "Selecione um curso"}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name || course.title || `Curso #${course.id}`}
                  </option>
                ))}
              </select>
            </label>

            {courseId && loadingRules && <p className="text-sm text-slate-500">Carregando regra atual...</p>}

            {courseId && !loadingRules && activeRule && (
              <p className="text-sm text-slate-600">
                Versão ativa #{activeRule.version}: {describeRule(activeRule)}
              </p>
            )}

            {courseId && !loadingRules && !activeRule && (
              <p className="text-sm text-amber-600">Este curso ainda não tem regra ativa.</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                Progresso mínimo (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.minContentProgressPercentage}
                  disabled={!courseId || saving}
                  onChange={(event) => setForm({ ...form, minContentProgressPercentage: event.target.value })}
                  placeholder="Sem exigência"
                  className={inputClass}
                />
              </label>
              <label className="text-sm text-slate-700">
                Frequência mínima (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.minAttendancePercentage}
                  disabled={!courseId || saving}
                  onChange={(event) => setForm({ ...form, minAttendancePercentage: event.target.value })}
                  placeholder="Sem exigência"
                  className={inputClass}
                />
              </label>
              <label className="text-sm text-slate-700">
                Nota mínima (0–10)
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={form.minAverageGrade}
                  disabled={!courseId || saving}
                  onChange={(event) => setForm({ ...form, minAverageGrade: event.target.value })}
                  placeholder="Sem exigência"
                  className={inputClass}
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.requireAllMandatoryItems}
                  disabled={!courseId || saving}
                  onChange={(event) => setForm({ ...form, requireAllMandatoryItems: event.target.checked })}
                />
                Exigir atividades obrigatórias
              </label>
            </div>

            <p className="text-xs text-slate-500">
              Deixe um campo vazio para não exigir esse critério. É preciso manter ao menos um critério.
            </p>

            {rules.length > 1 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Versões anteriores</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {rules
                    .filter((rule) => rule.status !== "active")
                    .slice(0, 4)
                    .map((rule) => (
                      <li key={rule.id}>
                        #{rule.version} · {describeRule(rule)}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {message && (
              <p className={`text-sm ${messageTone === "error" ? "text-red-600" : "text-slate-700"}`}>{message}</p>
            )}
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={!courseId || saving || loadingRules}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {saving ? "Salvando..." : "Salvar regra"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function CertificatesAdmin() {
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rulesCourseId, setRulesCourseId] = useState("");

  function handleChanged() {
    setRefreshKey((value) => value + 1);
  }

  function openRulesModal(courseId = "") {
    setRulesCourseId(courseId ? String(courseId) : "");
    setRulesModalOpen(true);
  }

  return (
    <main className="p-6">
      <section className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Documentos Acadêmicos</h1>
          <p className="mt-2 text-gray-600">
            Emita declarações e certificados, configure regras de conclusão e acompanhe a elegibilidade dos alunos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openRulesModal()}
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Regras de conclusão
        </button>
      </section>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <EnrollmentSearch onSelect={setSelectedEnrollment} selectedId={selectedEnrollment?.id} />

        <div className="space-y-6">
          {!selectedEnrollment && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              Selecione uma matrícula para ver e emitir documentos.
            </div>
          )}

          {selectedEnrollment && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">
                  {selectedEnrollment.student.name} — {selectedEnrollment.course.name}
                </h2>
                <p className="text-sm text-slate-500">
                  Matrícula #{selectedEnrollment.id} · Status: {selectedEnrollment.status}
                </p>
              </div>

              <EligibilityPanel enrollmentId={selectedEnrollment.id} />

              <CompletionRuleSummary
                courseId={selectedEnrollment.course.id}
                refreshKey={refreshKey}
                onEdit={() => openRulesModal(selectedEnrollment.course.id)}
              />

              <CertificateSection
                enrollmentId={selectedEnrollment.id}
                refreshKey={refreshKey}
                onChanged={handleChanged}
              />

              <DeclarationSection
                title="Declaração de matrícula"
                endpoints={getAdminEnrollmentDeclarationEndpoints(selectedEnrollment.id)}
                refreshKey={refreshKey}
                onChanged={handleChanged}
              />

              <AttendanceDeclarationSection
                enrollmentId={selectedEnrollment.id}
                refreshKey={refreshKey}
                onChanged={handleChanged}
              />

              <DeclarationSection
                title="Declaração de conclusão"
                description="Só emite se a matrícula for elegível."
                endpoints={getAdminCompletionDeclarationEndpoints(selectedEnrollment.id)}
                refreshKey={refreshKey}
                onChanged={handleChanged}
              />
            </>
          )}
        </div>
      </div>

      <CompletionRulesModal
        open={rulesModalOpen}
        initialCourseId={rulesCourseId}
        onClose={() => setRulesModalOpen(false)}
        onSaved={handleChanged}
      />
    </main>
  );
}
