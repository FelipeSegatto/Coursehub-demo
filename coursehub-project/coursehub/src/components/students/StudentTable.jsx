const ALIGN_CLASSES = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Mesma melhoria de cabeçalho de AdminTable.jsx/TeacherTable.jsx --
 * `column.align`/`column.headerClassName` são opcionais e
 * retrocompatíveis, colunas existentes que só passam {key, label}
 * continuam funcionando exatamente como antes.
 */
export default function StudentTable({
  columns = [],
  data = [],
  renderRow,
  emptyMessage = "Nenhum registro encontrado.",
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${
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
                className="px-4 py-10 text-center text-sm text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => renderRow(item))
          )}
        </tbody>
      </table>
    </div>
  );
}