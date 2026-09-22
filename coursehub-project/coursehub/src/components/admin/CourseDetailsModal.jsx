import StatusBadge from "../ui/StatusBadge";

const LEVEL_LABEL = {
  Iniciante: "Iniciante",
  Intermediário: "Intermediário",
  Avançado: "Avançado",
};

function formatCurrency(value) {
  const numericValue = Number(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function DetailItem({ label, value, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-800">{children ?? value ?? "-"}</dd>
    </div>
  );
}

/**
 * Visualização somente leitura de um curso -- reúne num só lugar o
 * que hoje fica espalhado entre a linha da listagem (resumida) e o
 * modal de edição (formulário). Nunca edita nada; "Editar" continua
 * sendo a única porta de entrada para alterar dados do curso.
 */
export default function CourseDetailsModal({ open, course, onClose }) {
  if (!open || !course) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
        >
          ✕
        </button>

        <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-14">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{course.name}</h2>
            <StatusBadge status={course.status} />
          </div>

          {course.category && <p className="mt-1 text-sm text-gray-500">{course.category}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <DetailItem
              label="Professores"
              value={
                Array.isArray(course.teachers) && course.teachers.length > 0
                  ? course.teachers.map((teacher) => teacher.name).join(", ")
                  : course.teacher_name || "Nenhum professor vinculado"
              }
            />
            <DetailItem label="Nível" value={LEVEL_LABEL[course.nivel] || course.nivel || "-"} />
            <DetailItem
              label="Carga horária"
              value={course.workload_hours ? `${course.workload_hours}h` : "-"}
            />
            <DetailItem label="Alunos matriculados" value={Number(course.total_students || 0)} />
          </dl>

          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Preço</p>

            {course.pricing?.hasActivePlans ? (
              <>
                <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
                  A partir de {formatCurrency(course.pricing.startingPrice)}
                </p>

                {course.pricing.monthlyPaymentFrom !== null && course.pricing.monthlyPaymentFrom !== undefined && (
                  <p className="mt-1 text-sm tabular-nums text-gray-500">
                    Mensalidades a partir de {formatCurrency(course.pricing.monthlyPaymentFrom)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-400">Consulte os valores nos planos comerciais.</p>
            )}
          </div>

          {course.description && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Descrição</p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-gray-700">{course.description}</p>
            </div>
          )}

          {course.expanded_description && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Descrição detalhada
              </p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-gray-700">
                {course.expanded_description}
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
