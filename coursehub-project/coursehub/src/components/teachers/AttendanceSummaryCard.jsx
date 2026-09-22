const shiftLabels = {
  morning: "Manhã",
  afternoon: "Tarde",
  night: "Noite",
  online: "Online",
};

const classStatusLabels = {
  active: "Ativa",
  inactive: "Inativa",
  finished: "Finalizada",
};

const classStatusStyles = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive:
    "border-amber-200 bg-amber-50 text-amber-700",
  finished:
    "border-slate-200 bg-slate-100 text-slate-600",
};

function calculatePercentage(value, total) {
  if (!total) return 0;

  return Math.round((value / total) * 100);
}

export default function AttendanceSummaryCard({
  classData,
  summary,
}) {
  if (!classData) return null;

  const total = Number(summary?.total || 0);
  const present = Number(summary?.present || 0);
  const absent = Number(summary?.absent || 0);
  const late = Number(summary?.late || 0);
  const excused = Number(summary?.excused || 0);

  const presentPercentage =
    calculatePercentage(present, total);

  const absentPercentage =
    calculatePercentage(absent, total);

  const latePercentage =
    calculatePercentage(late, total);

  const excusedPercentage =
    calculatePercentage(excused, total);

  const shiftLabel =
    shiftLabels[classData.shift] ||
    classData.shift ||
    "Turno não informado";

  const statusLabel =
    classStatusLabels[classData.status] ||
    classData.status ||
    "Status não informado";

  const statusClassName =
    classStatusStyles[classData.status] ||
    "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <section
      aria-labelledby="attendance-summary-title"
      className="space-y-5"
    >
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClassName}`}
                >
                  {statusLabel}
                </span>

                <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  {shiftLabel}
                </span>
              </div>

              <h2
                id="attendance-summary-title"
                className="mt-3 text-2xl font-black tracking-tight text-slate-900"
              >
                {classData.name}
              </h2>

              <p className="mt-1 text-sm font-medium text-slate-500">
                {classData.courseTitle ||
                  "Curso não informado"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-5">
          <div className="bg-white px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
              Total de alunos
            </p>

            <p className="mt-2 text-2xl font-black text-slate-900">
              {total}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Alunos matriculados na turma
            </p>
          </div>

          <div className="bg-white px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-600">
              Presentes
            </p>

            <p className="mt-2 text-2xl font-black text-slate-900">
              {present}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {presentPercentage}% da turma
            </p>
          </div>

          <div className="bg-white px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-rose-600">
              Ausentes
            </p>

            <p className="mt-2 text-2xl font-black text-slate-900">
              {absent}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {absentPercentage}% da turma
            </p>
          </div>

          <div className="bg-white px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-600">
              Atrasados
            </p>

            <p className="mt-2 text-2xl font-black text-slate-900">
              {late}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {latePercentage}% da turma
            </p>
          </div>

          <div className="bg-white px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-600">
              Justificados
            </p>

            <p className="mt-2 text-2xl font-black text-slate-900">
              {excused}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {excusedPercentage}% da turma
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}