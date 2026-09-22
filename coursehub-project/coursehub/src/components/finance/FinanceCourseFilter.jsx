export default function FinanceCourseFilter({
  courses = [],
  value,
  onChange,
}) {
  return (
    <div className="w-full lg:w-80">
      <label
        htmlFor="finance-course-filter"
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        Visualizar financeiro de
      </label>

      <select
        id="finance-course-filter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="
          w-full rounded-xl border border-slate-200 bg-white
          px-4 py-3 text-sm font-medium text-slate-800
          outline-none transition
          focus:border-blue-500 focus:ring-4 focus:ring-blue-100
        "
      >
        <option value="all">
          Todos os cursos ({courses.length})
        </option>

        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </select>
    </div>
  );
}