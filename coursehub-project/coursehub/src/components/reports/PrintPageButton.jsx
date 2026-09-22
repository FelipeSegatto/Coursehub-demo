/**
 * "Exportar PDF" via window.print() -- para dashboards que ainda não
 * têm um filtro real na tela (ver ExportPdfButton.jsx para o caso com
 * filtro, que gera o PDF no servidor). Aqui o próprio navegador vira
 * o PDF: o botão só dispara window.print(), a folha de estilo global
 * (.print-hide / .rounded-2xl / .rounded-xl em @media print, ver
 * index.css) esconde navbar/botões e evita cortar um card no meio
 * entre páginas.
 */
export default function PrintPageButton({ label = "Exportar PDF", className = "" }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        "print-hide " +
        (className ||
          [
            "inline-flex min-h-10 items-center justify-center gap-2",
            "rounded-lg border border-slate-300 bg-white px-4",
            "text-sm font-semibold text-slate-700 shadow-sm",
            "transition hover:bg-slate-50",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          ].join(" "))
      }
    >
      {label}
    </button>
  );
}
