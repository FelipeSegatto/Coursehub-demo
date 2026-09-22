const ALIGN_CLASSES = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Cabeçalho compacto e denso: text-xs/semibold/uppercase discreto em
 * vez de text-sm sem padding horizontal (o que colava as colunas
 * umas nas outras). `column.align`/`column.headerClassName` são
 * opcionais e retrocompatíveis -- colunas existentes que só passam
 * {key, label} continuam funcionando exatamente como antes, só
 * herdam o novo espaçamento/tipografia do cabeçalho. O corpo da
 * tabela continua 100% controlado por `renderRow` de cada página
 * (não force uma API de célula que não bate com como as linhas já
 * são montadas).
 */
/**
 * `renderMobileCard` é opcional -- quando fornecido, a tabela some em
 * telas pequenas e dá lugar a uma lista de cards (título + ação
 * sempre visíveis, detalhes só ao expandir), em vez de forçar
 * scroll horizontal para alcançar a coluna de ações. Páginas que
 * ainda não migraram continuam com o scroll horizontal de sempre.
 */
function AdminTable({
  columns = [],
  data = [],
  renderRow,
  renderMobileCard,
  emptyMessage = "Nenhum registro encontrado.",
}) {
  return (
    <>
      <div className={renderMobileCard ? "hidden overflow-x-auto md:block" : "overflow-x-auto"}>
        <table className="w-full min-w-[750px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${
                    ALIGN_CLASSES[column.align] || ALIGN_CLASSES.left
                  } ${column.headerClassName || ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-sm text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map(renderRow)
            )}
          </tbody>
        </table>
      </div>

      {renderMobileCard && (
        <div className="space-y-3 md:hidden">
          {data.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-gray-500">{emptyMessage}</p>
          ) : (
            data.map(renderMobileCard)
          )}
        </div>
      )}
    </>
  );
}

export default AdminTable;