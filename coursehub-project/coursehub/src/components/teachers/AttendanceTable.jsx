const attendanceOptions = [
  {
    value: "present",
    label: "Presente",
    shortLabel: "Presente",
    symbol: "P",
    activeClassName:
      "border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100",
    idleClassName:
      "border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700",
  },
  {
    value: "absent",
    label: "Ausente",
    shortLabel: "Ausente",
    symbol: "A",
    activeClassName:
      "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-100",
    idleClassName:
      "border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700",
  },
  {
    value: "late",
    label: "Atrasado",
    shortLabel: "Atraso",
    symbol: "T",
    activeClassName:
      "border-amber-300 bg-amber-50 text-amber-700 ring-2 ring-amber-100",
    idleClassName:
      "border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700",
  },
  {
    value: "excused",
    label: "Justificado",
    shortLabel: "Justificado",
    symbol: "J",
    activeClassName:
      "border-violet-300 bg-violet-50 text-violet-700 ring-2 ring-violet-100",
    idleClassName:
      "border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700",
  },
];

const statusBadgeStyles = {
  present:
    "border-emerald-200 bg-emerald-50 text-emerald-700",
  absent:
    "border-rose-200 bg-rose-50 text-rose-700",
  late:
    "border-amber-200 bg-amber-50 text-amber-700",
  excused:
    "border-violet-200 bg-violet-50 text-violet-700",
};

const statusLabels = {
  present: "Presente",
  absent: "Ausente",
  late: "Atrasado",
  excused: "Justificado",
};

function getInitials(name) {
  if (!name) return "AL";

  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "AL";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${
    words[words.length - 1][0]
  }`.toUpperCase();
}

function AttendanceStatusButtons({
  student,
  disabled,
  onStatusChange,
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      role="group"
      aria-label={`Frequência de ${student.name}`}
    >
      {attendanceOptions.map((option) => {
        const isSelected =
          student.status === option.value;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            title={option.label}
            onClick={() =>
              onStatusChange(
                student.studentId,
                option.value
              )
            }
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected
                ? option.activeClassName
                : option.idleClassName
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black ${
                isSelected
                  ? "bg-white/80"
                  : "bg-slate-100"
              }`}
              aria-hidden="true"
            >
              {option.symbol}
            </span>

            <span>{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

function AttendanceTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="divide-y divide-slate-100">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(220px,1fr)_minmax(420px,1.6fr)_minmax(220px,1fr)] lg:items-center sm:px-6"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-200" />

              <div className="flex-1">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-100" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              {Array.from({ length: 4 }).map(
                (_, buttonIndex) => (
                  <div
                    key={buttonIndex}
                    className="h-10 w-full animate-pulse rounded-xl bg-slate-100 sm:w-24"
                  />
                )
              )}
            </div>

            <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AttendanceTable({
  students = [],
  loading = false,
  disabled = false,
  onStatusChange,
  onNotesChange,
}) {
  if (loading) {
    return <AttendanceTableSkeleton />;
  }

  if (!students.length) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-500">
          👥
        </div>

        <h2 className="mt-4 text-lg font-black text-slate-900">
          Nenhum aluno encontrado
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Não existem alunos ativos matriculados nesta
          turma para registrar a frequência.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="attendance-table-title"
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="attendance-table-title"
              className="text-lg font-black text-slate-900"
            >
              Lista de frequência
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Selecione a situação de cada aluno e
              adicione uma observação quando necessário.
            </p>
          </div>

          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {students.length}{" "}
            {students.length === 1
              ? "aluno"
              : "alunos"}
          </span>
        </div>
      </header>

      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-[minmax(220px,1fr)_minmax(430px,1.65fr)_minmax(240px,1fr)] gap-5 border-b border-slate-100 bg-slate-50/80 px-6 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Aluno
          </p>

          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Situação
          </p>

          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Observação
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {students.map((student) => {
            

            return (
              <article
                key={student.studentId}
                className="grid grid-cols-[minmax(220px,1fr)_minmax(430px,1.65fr)_minmax(240px,1fr)] gap-5 px-6 py-5 transition hover:bg-slate-50/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">
                    {getInitials(student.name)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-slate-900">
                        {student.name}
                      </h3>

                      {!student.isSaved && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Não salvo
                        </span>
                      )}
                    </div>

                    <p className="mt-1 truncate text-xs text-slate-500">
                      {student.registrationNumber
                        ? `Matrícula ${student.registrationNumber}`
                        : student.email ||
                          "Matrícula não informada"}
                    </p>

                    
                  </div>
                </div>

                <div className="self-center">
                  <AttendanceStatusButtons
                    student={student}
                    disabled={disabled}
                    onStatusChange={onStatusChange}
                  />
                </div>

                <div className="self-center">
                  <label
                    htmlFor={`attendance-notes-${student.studentId}`}
                    className="sr-only"
                  >
                    Observação para {student.name}
                  </label>

                  <input
                    id={`attendance-notes-${student.studentId}`}
                    type="text"
                    value={student.notes || ""}
                    disabled={disabled}
                    maxLength={255}
                    placeholder="Adicionar observação..."
                    onChange={(event) =>
                      onNotesChange(
                        student.studentId,
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Mobile e tablet */}
      <div className="divide-y divide-slate-100 lg:hidden">
        {students.map((student) => {
          const statusLabel =
            statusLabels[student.status] ||
            "Não informado";

          const statusClassName =
            statusBadgeStyles[student.status] ||
            "border-slate-200 bg-slate-50 text-slate-600";

          return (
            <article
              key={student.studentId}
              className="px-5 py-5 sm:px-6"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">
                  {getInitials(student.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-slate-900">
                      {student.name}
                    </h3>

                    {!student.isSaved && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        Não salvo
                      </span>
                    )}
                  </div>

                  <p className="mt-1 truncate text-xs text-slate-500">
                    {student.registrationNumber
                      ? `Matrícula ${student.registrationNumber}`
                      : student.email ||
                        "Matrícula não informada"}
                  </p>

                  <span
                    className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClassName}`}
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Situação
                </p>

                <AttendanceStatusButtons
                  student={student}
                  disabled={disabled}
                  onStatusChange={onStatusChange}
                />
              </div>

              <div className="mt-4">
                <label
                  htmlFor={`attendance-mobile-notes-${student.studentId}`}
                  className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400"
                >
                  Observação
                </label>

                <input
                  id={`attendance-mobile-notes-${student.studentId}`}
                  type="text"
                  value={student.notes || ""}
                  disabled={disabled}
                  maxLength={255}
                  placeholder="Adicionar observação..."
                  onChange={(event) =>
                    onNotesChange(
                      student.studentId,
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}