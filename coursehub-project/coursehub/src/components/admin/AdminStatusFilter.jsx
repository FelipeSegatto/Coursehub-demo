export default function AdminStatusFilter({
  value = "",
  onChange,
  options = [],
  label = "Status",
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="
        w-full rounded-xl border border-gray-300 bg-white
        px-4 py-2.5 text-sm text-gray-700 outline-none
        transition focus:border-blue-500 focus:ring-2
        focus:ring-blue-100 sm:w-auto
      "
    >
      <option value="">Todos os status</option>

      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}