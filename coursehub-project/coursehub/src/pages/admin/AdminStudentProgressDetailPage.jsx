import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getEnrollmentProgress } from "../../services/AdminStudentProgressService";
import ExportPdfButton from "../../components/reports/ExportPdfButton";
import StatusBadge from "../../components/ui/StatusBadge";
import ProgressDonutChart from "../../components/charts/ProgressDonutChart";
import { CONTENT_CHART_COLORS, ACADEMIC_CHART_COLORS } from "../../components/charts/progressChartColors";

const CONTENT_TYPE_LABEL = { video: "Vídeo", pdf: "PDF", text: "Texto", live_class: "Aula ao vivo" };

function formatPercentage(value) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);

  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR").format(date);
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

export default function AdminStudentProgressDetailPage() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await getEnrollmentProgress(enrollmentId);

      setDetail(result || null);
    } catch (requestError) {
      console.error("[AdminStudentProgressDetailPage] erro:", requestError);
      setError(requestError.message || "Não foi possível carregar o progresso desta matrícula.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <main className="p-6">
        <p className="py-10 text-center text-gray-500">Carregando progresso da matrícula...</p>
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
              onClick={() => navigate("/admin/progressao")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Voltar à listagem
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!detail) return null;

  const { enrollment, contentSummary, contents, academicSummary, academicItems, attendance } = detail;

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => navigate("/admin/progressao")}
          className="mb-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          ← Voltar à progressão dos alunos
        </button>

        <section className="mb-6 flex flex-col gap-4 rounded-2xl bg-white p-6 shadow md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{enrollment.student.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {enrollment.student.registrationNumber ? `Matrícula ${enrollment.student.registrationNumber} · ` : ""}
              {enrollment.course.name}
              {enrollment.class ? ` · ${enrollment.class.name}` : ""}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <StatusBadge status={enrollment.status} />
              <span className="text-sm text-gray-500">Matriculado em {formatDate(enrollment.enrolledAt)}</span>
            </div>
          </div>

          <ExportPdfButton
            basePath={`/api/admin/student-progress/enrollments/${enrollmentId}/export.pdf`}
            filters={{}}
            label="Exportar PDF"
          />
        </section>

        <section className="mb-6 grid gap-5 lg:grid-cols-2">
          <ProgressDonutChart
            title="Progresso de conteúdo"
            description="Distribuição dos conteúdos considerados neste curso -- mesma regra usada na visão do aluno (obrigatórios, ou todos quando não há obrigatório)."
            centerValue={formatPercentage(contentSummary.progressPercentage)}
            centerLabel="concluído"
            data={[
              { name: "Concluídos", value: contentSummary.completedContents },
              { name: "Em andamento", value: contentSummary.inProgressContents },
              { name: "Não iniciados", value: contentSummary.notStartedContents },
            ]}
            colors={CONTENT_CHART_COLORS}
          />

          <ProgressDonutChart
            title="Atividades e avaliações"
            description="Situação das entregas acadêmicas neste curso."
            centerValue={`${academicSummary.delivered_items}/${academicSummary.total_items}`}
            centerLabel="entregues"
            data={[
              { name: "Corrigidas", value: academicSummary.graded_items },
              { name: "Aguardando correção", value: academicSummary.submitted_items },
              { name: "Pendentes", value: academicSummary.pending_items },
              { name: "Devolvidas", value: academicSummary.returned_items },
            ]}
            colors={ACADEMIC_CHART_COLORS}
          />
        </section>

        <section className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-gray-900">Progresso de conteúdo</h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryCard label="Concluídos" value={contentSummary.completedContents} />
            <SummaryCard label="Em andamento" value={contentSummary.inProgressContents} />
            <SummaryCard label="Não iniciados" value={contentSummary.notStartedContents} />
            <SummaryCard label="Total considerado" value={contentSummary.totalContents} />
            <SummaryCard label="Percentual" value={formatPercentage(contentSummary.progressPercentage)} />
          </div>

          {contents.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">Nenhum conteúdo acompanhável neste curso.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Conteúdo</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Obrigatório</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Último acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {contents.map((content) => (
                    <tr key={content.contentId} className="border-b border-gray-100">
                      <td className="px-3 py-3 text-sm font-semibold text-gray-900">{content.title}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{CONTENT_TYPE_LABEL[content.type] || content.type}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{content.isRequired ? "Sim" : "Não"}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <StatusBadge status={content.progressStatus} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{formatDate(content.lastAccessedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-gray-900">Atividades e avaliações</h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Entregues" value={academicSummary.delivered_items} />
            <SummaryCard label="Pendentes" value={academicSummary.pending_items} />
            <SummaryCard label="Corrigidas" value={academicSummary.graded_items} />
            <SummaryCard
              label="Média"
              value={academicSummary.average_grade !== null ? academicSummary.average_grade.toFixed(1) : "—"}
            />
          </div>

          {academicItems.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">Nenhuma atividade ou avaliação neste curso.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Título</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Prazo</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {academicItems.map((item) => (
                    <tr key={item.activity_id} className="border-b border-gray-100">
                      <td className="px-3 py-3 text-sm font-semibold text-gray-900">{item.title}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{item.activity_kind === "exam" ? "Avaliação" : "Atividade"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{formatDate(item.due_date)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <StatusBadge status={item.academic_status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">
                        {item.score !== null ? `${item.score.toFixed(1)} / ${item.max_score.toFixed(1)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {attendance && (
          <section className="rounded-2xl bg-white p-6 shadow">
            <h2 className="text-lg font-bold text-gray-900">Frequência</h2>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
              <SummaryCard label="Sessões" value={attendance.total} />
              <SummaryCard label="Presenças" value={attendance.present} />
              <SummaryCard label="Faltas" value={attendance.absent} />
              <SummaryCard label="Atrasos" value={attendance.late} />
              <SummaryCard label="Justificadas" value={attendance.excused} />
              <SummaryCard label="Taxa" value={formatPercentage(attendance.attendanceRate)} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
