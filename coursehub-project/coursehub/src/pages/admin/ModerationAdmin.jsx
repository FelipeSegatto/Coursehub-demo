import { useEffect, useState } from "react";
import { listReports, reviewReport } from "../../services/ChatService";
import TableActionButton from "../../components/ui/actions/TableActionButton";

const STATUS_FILTERS = [
  { value: "open", label: "Abertos" },
  { value: "resolved", label: "Resolvidos" },
  { value: "dismissed", label: "Descartados" },
  { value: "", label: "Todos" },
];

const REASON_LABEL = {
  spam: "Spam",
  abuse: "Abuso",
  harassment: "Assédio",
  inappropriate_content: "Conteúdo impróprio",
  other: "Outro",
};

const TYPE_LABEL = {
  academic_peer: "Colegas",
  teacher_support: "Dúvida com professor",
  administrative_support: "Protocolo administrativo",
  staff_support: "Professor com administração",
};

function formatDateTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ModerationAdmin() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [notesByReportId, setNotesByReportId] = useState({});
  const [reviewingReportId, setReviewingReportId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchReports() {
      setLoading(true);

      try {
        const result = await listReports({ status: statusFilter || undefined, limit: 50 });

        if (cancelled) return;

        setReports(result?.items || []);
        setError("");
      } catch (requestError) {
        if (cancelled) return;

        setError(requestError.message || "Não foi possível carregar os reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchReports();

    return () => {
      cancelled = true;
    };
  }, [statusFilter, reloadToken]);

  async function handleReview(reportId, status) {
    try {
      setReviewingReportId(reportId);

      await reviewReport(reportId, { status, resolutionNote: notesByReportId[reportId] || "" });

      setReloadToken((token) => token + 1);
    } catch {
      // The report stays in the list -- the admin can just try again.
    } finally {
      setReviewingReportId(null);
    }
  }

  return (
    <main className="p-6">
      <section className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Moderação de mensagens</h1>
        <p className="mt-2 text-gray-600">Mensagens reportadas por participantes das conversas institucionais.</p>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow">
        <div className="mb-4 flex flex-wrap gap-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === filter.value ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {loading && <p className="py-6 text-center text-sm text-gray-500">Carregando...</p>}

        {!loading && error && <p className="py-3 text-center text-sm text-red-700">{error}</p>}

        {!loading && !error && reports.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">Nenhum report nesta lista.</p>
        )}

        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-500">
                  {TYPE_LABEL[report.conversationType] || report.conversationType} · {REASON_LABEL[report.reason] || report.reason}
                </span>
                <span className="text-xs text-gray-400">{formatDateTime(report.createdAt)}</span>
              </div>

              <p className="mt-2 text-sm text-gray-700">
                Reportado por <span className="font-semibold">{report.reporterName}</span>
              </p>

              <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                {report.messageDeleted ? (
                  <span className="italic text-gray-400">Mensagem já removida.</span>
                ) : (
                  report.messageBody
                )}
              </div>

              {report.details && <p className="mt-2 text-sm text-gray-600">Detalhes: {report.details}</p>}

              {report.status === "open" ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={notesByReportId[report.id] || ""}
                    onChange={(event) =>
                      setNotesByReportId((current) => ({ ...current, [report.id]: event.target.value.slice(0, 500) }))
                    }
                    rows={2}
                    maxLength={500}
                    placeholder="Nota de resolução (opcional)"
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />

                  <div className="flex gap-2">
                    <TableActionButton
                      variant="accent"
                      size="sm"
                      disabled={reviewingReportId === report.id}
                      onClick={() => handleReview(report.id, "resolved")}
                    >
                      Resolver
                    </TableActionButton>
                    <TableActionButton
                      variant="neutral"
                      size="sm"
                      disabled={reviewingReportId === report.id}
                      onClick={() => handleReview(report.id, "dismissed")}
                    >
                      Descartar
                    </TableActionButton>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-500">
                  {report.status === "resolved" ? "Resolvido" : "Descartado"}
                  {report.resolutionNote && ` — ${report.resolutionNote}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
