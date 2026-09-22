import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AdminAttendanceService } from "../../services/AdminAttendanceService";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";
import { formatDisplayDate } from "../../utils/dateUtils";

const STATUS_OPTIONS = [
  { value: "present", label: "Presente" },
  { value: "absent", label: "Ausente" },
  { value: "late", label: "Atrasado" },
  { value: "excused", label: "Justificado" },
];

function formatShortDate(value) {
  if (!value) return "-";

  return formatDisplayDate(String(value).slice(0, 10), { day: "2-digit", month: "2-digit", year: "numeric" });
}

function SummaryCard({ label, value, tone = "text-gray-900" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}

/**
 * Detalhe de uma chamada -- roster mostra só alunos com linha real em
 * attendance para este encontro (a listagem já garante que só
 * encontros com pelo menos uma chamada real chegam até aqui).
 */
export default function AdminAttendanceSessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustStatus, setAdjustStatus] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await AdminAttendanceService.getSessionDetail(sessionId);

      setDetail(result || null);
    } catch (requestError) {
      console.error("[AdminAttendanceSessionDetailPage] erro:", requestError);
      setError(requestError.message || "Não foi possível carregar a chamada.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  function handleAdjustClick(row) {
    setAdjustTarget(row);
    setAdjustStatus(row.status);
    setAdjustReason("");
    setAdjustError("");
  }

  function closeAdjustModal() {
    if (adjustLoading) return;

    setAdjustTarget(null);
    setAdjustStatus("");
    setAdjustReason("");
    setAdjustError("");
  }

  async function handleConfirmAdjust() {
    if (!adjustTarget) return;

    if (!adjustReason.trim()) {
      setAdjustError("Informe o motivo do ajuste.");
      return;
    }

    try {
      setAdjustLoading(true);
      setAdjustError("");

      await AdminAttendanceService.adjust(adjustTarget.attendanceId, {
        status: adjustStatus,
        reason: adjustReason.trim(),
      });

      closeAdjustModal();
      await fetchDetail();
    } catch (requestError) {
      console.error("Erro ao ajustar frequência:", requestError);
      setAdjustError(requestError.message || "Erro ao ajustar frequência.");
    } finally {
      setAdjustLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6">
        <p className="py-10 text-center text-gray-500">Carregando chamada...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-700">{error}</p>

          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={fetchDetail}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Tentar novamente
            </button>

            <button
              type="button"
              onClick={() => navigate("/admin/frequencia")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Voltar à frequência
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!detail) return null;

  const { session, summary, students } = detail;

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => navigate("/admin/frequencia")}
          className="mb-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          ← Voltar à frequência
        </button>

        <section className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold text-gray-900">
            Encontro {session.sessionNumber} · {session.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {session.course.name} · {session.class.name}
            {session.teacher ? ` · Professor: ${session.teacher.name}` : ""}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {formatShortDate(session.sessionDate)}
            {session.startTime ? ` · ${session.startTime.slice(0, 5)}${session.endTime ? `–${session.endTime.slice(0, 5)}` : ""}` : ""}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryCard label="Total" value={summary.total} />
            <SummaryCard label="Presentes" value={summary.present} tone="text-green-700" />
            <SummaryCard label="Ausentes" value={summary.absent} tone="text-red-700" />
            <SummaryCard label="Atrasados" value={summary.late} tone="text-amber-700" />
            <SummaryCard label="Justificados" value={summary.excused} tone="text-blue-700" />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-gray-900">Alunos</h2>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aluno</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Matrícula</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Observação</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Ajuste admin</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => (
                  <tr key={row.attendanceId} className="border-b border-gray-100">
                    <td className="px-3 py-3 text-sm font-semibold text-gray-900">{row.student.name}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{row.student.registrationNumber}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">{row.notes || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.adjustment ? (
                        <span
                          title={row.adjustment.reason || ""}
                          className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700"
                        >
                          {formatShortDate(row.adjustment.adjustedAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <TableActionButton variant="accent" size="sm" onClick={() => handleAdjustClick(row)}>
                        Ajustar
                      </TableActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-3 md:hidden">
            {students.map((row) => (
              <MobileExpandableCard
                key={row.attendanceId}
                title={row.student.name}
                subtitle={row.student.registrationNumber}
                badge={<StatusBadge status={row.status} />}
                primaryAction={
                  <TableActionButton
                    variant="accent"
                    size="md"
                    className="w-full"
                    onClick={() => handleAdjustClick(row)}
                  >
                    Ajustar
                  </TableActionButton>
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Observação</span>
                  <span className="font-medium text-gray-900">{row.notes || "-"}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Ajuste admin</span>
                  {row.adjustment ? (
                    <span
                      title={row.adjustment.reason || ""}
                      className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700"
                    >
                      {formatShortDate(row.adjustment.adjustedAt)}
                    </span>
                  ) : (
                    <span className="font-medium text-gray-400">-</span>
                  )}
                </div>
              </MobileExpandableCard>
            ))}
          </div>
        </section>
      </div>

      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">Ajustar frequência</h2>

            <p className="mt-3 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
              {adjustTarget.student.name}
            </p>

            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">Novo status</label>
              <select
                value={adjustStatus}
                onChange={(event) => setAdjustStatus(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">Motivo do ajuste</label>
              <textarea
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                placeholder="Explique o motivo da correção..."
              />
            </div>

            {adjustError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {adjustError}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeAdjustModal}
                disabled={adjustLoading}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmAdjust}
                disabled={adjustLoading}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {adjustLoading ? "Salvando..." : "Salvar ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
