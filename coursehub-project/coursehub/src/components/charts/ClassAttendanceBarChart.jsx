function attendanceBarColor(percentage) {
  if (percentage >= 80) return "#16a34a";
  if (percentage >= 60) return "#d97706";
  return "#dc2626";
}

function formatAttendance(value) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

export default function ClassAttendanceBarChart({ classes = [] }) {
  const data = classes.map((classItem, index) => ({
    classId: classItem.classId ?? `class-${index}`,
    className: classItem.className || "Turma",
    courseName: classItem.courseName || "",
    value:
      classItem.averageAttendancePercentage == null
        ? null
        : Number(classItem.averageAttendancePercentage),
  }));

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Frequência por turma</h3>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          Média real de presença de cada turma ativa. Sem chamada lançada, a barra fica vazia.
        </p>
      </div>

      {data.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-gray-500">
          Nenhuma turma ativa para comparar a frequência.
        </p>
      ) : (
        <ul
          className="mt-5 space-y-4"
          aria-label={`Frequência média por turma. ${data
            .map((item) => {
              const label = `${item.className}${item.courseName ? `, ${item.courseName}` : ""}`;
              return item.value == null
                ? `${label}: sem lançamento`
                : `${label}: ${formatAttendance(item.value)}`;
            })
            .join(". ")}.`}
        >
          {data.map((item) => (
            <li
              key={item.classId}
              className="grid gap-2 sm:grid-cols-[minmax(11rem,16rem)_minmax(0,1fr)] sm:items-center sm:gap-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-slate-900">{item.className}</p>
                {item.courseName ? (
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.courseName}</p>
                ) : null}
              </div>

              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"
                  aria-hidden="true"
                >
                  {item.value != null ? (
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, item.value))}%`,
                        backgroundColor: attendanceBarColor(item.value),
                      }}
                    />
                  ) : null}
                </div>
                <span
                  className={`w-14 shrink-0 text-right tabular-nums ${
                    item.value == null
                      ? "text-xs font-medium text-slate-400"
                      : "text-sm font-semibold text-slate-700"
                  }`}
                >
                  {item.value == null ? "—" : formatAttendance(item.value)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-600" /> 80%+
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-600" /> 60–79%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-600" /> abaixo de 60%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" /> sem lançamento
        </span>
      </div>
    </article>
  );
}
