import { API_URL } from "../../services/APIService";

/**
 * Link de download para os relatórios em PDF (backend/routes/adminReportsRoutes.js).
 * Diferente de DocumentDownloadButton (documentos formais, Fase 1/2),
 * aqui não há solicitar/aguardar/baixar -- a geração é síncrona, uma
 * única GET já devolve o PDF pronto, então é só um <a href> puro,
 * igual ao padrão já usado em downloadUrl (DocumentGenerationService.jsx).
 *
 * `filters` deve já estar nos nomes de parâmetro que o backend espera
 * (ex: dueFrom/dueTo, não dueDateFrom/dueDateTo) -- a tradução dos
 * nomes de estado local da tela para os nomes do backend é
 * responsabilidade de quem usa o componente.
 */
function buildQueryString(filters = {}) {
  const query = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === false) return;

    query.set(key, String(value));
  });

  const queryString = query.toString();

  return queryString ? `?${queryString}` : "";
}

export default function ExportPdfButton({ basePath, filters, label = "Exportar PDF", className = "" }) {
  const href = `${API_URL}${basePath}${buildQueryString(filters)}`;

  return (
    <a
      href={href}
      className={
        className ||
        [
          "inline-flex min-h-10 items-center justify-center gap-2",
          "rounded-lg border border-slate-300 bg-white px-4",
          "text-sm font-semibold text-slate-700 shadow-sm",
          "transition hover:bg-slate-50",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        ].join(" ")
      }
    >
      {label}
    </a>
  );
}
