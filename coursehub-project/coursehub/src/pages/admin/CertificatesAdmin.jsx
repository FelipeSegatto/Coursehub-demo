import { useEffect, useState } from "react";

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

function CertificateSection({ enrollmentId, refreshKey, onChanged }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-semibold text-slate-900">Certificado</h3>

      <div className="flex flex-wrap items-center gap-3">
        <DocumentDownloadButton
          key={refreshKey}
          endpoints={getAdminCertificateEndpoints(enrollmentId)}
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
              await reissueCertificate(data.id);
              onChanged();
            }
          }}
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          Reemitir
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Só emite se a matrícula for elegível (mesma avaliação de "Elegibilidade para conclusão").
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

function CompletionRuleSection({ courseId }) {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState({
    minContentProgressPercentage: "",
    minAttendancePercentage: "",
    minAverageGrade: "",
    requireAllMandatoryItems: true,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRules() {
    const { data } = await listCompletionRules(courseId);
    setRules(data || []);
  }

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const activeRule = rules.find((rule) => rule.status === "active");

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      await createCompletionRule(courseId, {
        minContentProgressPercentage: form.minContentProgressPercentage || null,
        minAttendancePercentage: form.minAttendancePercentage || null,
        minAverageGrade: form.minAverageGrade || null,
        requireAllMandatoryItems: form.requireAllMandatoryItems,
      });
      setMessage("Nova versão da regra criada.");
      await loadRules();
    } catch (error) {
      setMessage(error.message || "Não foi possível salvar a regra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">Regra de conclusão do curso</h3>

      {activeRule ? (
        <p className="mt-2 text-sm text-slate-600">
          Versão ativa: #{activeRule.version} · progresso ≥ {activeRule.min_content_progress_percentage ?? "—"}% ·
          frequência ≥ {activeRule.min_attendance_percentage ?? "—"}% · nota ≥ {activeRule.min_average_grade ?? "—"} ·
          obrigatórias {activeRule.require_all_mandatory_items ? "sim" : "não"}
        </p>
      ) : (
        <p className="mt-2 text-sm text-amber-600">Nenhuma regra ativa -- certificados não podem ser emitidos.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs text-slate-500">
          Progresso mín. (%)
          <input
            type="number"
            min="0"
            max="100"
            value={form.minContentProgressPercentage}
            onChange={(event) => setForm({ ...form, minContentProgressPercentage: event.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Frequência mín. (%)
          <input
            type="number"
            min="0"
            max="100"
            value={form.minAttendancePercentage}
            onChange={(event) => setForm({ ...form, minAttendancePercentage: event.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Nota mín. (0-10)
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={form.minAverageGrade}
            onChange={(event) => setForm({ ...form, minAverageGrade: event.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={form.requireAllMandatoryItems}
            onChange={(event) => setForm({ ...form, requireAllMandatoryItems: event.target.checked })}
          />
          Exigir obrigatórias
        </label>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
      >
        Salvar nova versão
      </button>

      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </div>
  );
}

export default function CertificatesAdmin() {
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleChanged() {
    setRefreshKey((value) => value + 1);
  }

  return (
    <main className="p-6">
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Documentos Acadêmicos</h1>
        <p className="mt-2 text-gray-600">
          Emita declarações e certificados, configure regras de conclusão e acompanhe a elegibilidade dos alunos.
        </p>
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

              <CompletionRuleSection courseId={selectedEnrollment.course.id} />

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
    </main>
  );
}
