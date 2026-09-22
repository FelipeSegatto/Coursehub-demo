const ALIGN_CLASSES = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Mesma melhoria de cabeçalho de AdminTable.jsx (compacto, com
 * respiro horizontal) -- os dois componentes continuam separados de
 * propósito (não foram unificados), só ganharam a mesma tipografia
 * pra ficar consistente entre admin e professor. `column.align`/
 * `column.headerClassName` são opcionais e retrocompatíveis.
 */
function TeacherTable({
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

export default TeacherTable;