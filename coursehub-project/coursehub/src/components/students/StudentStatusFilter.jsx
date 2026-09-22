export default function StudentStatusFilter({
  value,
  onChange,
  options = [],
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 outline-none focus:border-blue-500 md:w-auto"
    >
      {options.map((option) => (
        <option
          key={option.value || "all"}
          value={option.value}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}