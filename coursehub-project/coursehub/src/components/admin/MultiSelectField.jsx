import { useMemo, useState } from "react";

/**
 * Multi-select pesquisável reutilizável -- checkboxes + busca + chips
 * dos itens já selecionados. Criado para curso<->professor (N:N),
 * mas é genérico o bastante (options = [{id, name}], selectedIds =
 * number[]) para qualquer outro relacionamento N:N do admin no
 * futuro, em vez de um seletor construído do zero por tela.
 */
export default function MultiSelectField({
  label,
  options = [],
  selectedIds = [],
  onChange,
  loading = false,
  disabled = false,
  placeholder = "Buscar...",
  emptyOptionsMessage = "Nenhuma opção encontrada.",
  noneSelectedMessage = "Nenhum vínculo selecionado.",
  id,
}) {
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedIdSet = useMemo(() => new Set(selectedIds.map(Number)), [selectedIds]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedIdSet.has(Number(option.id))),
    [options, selectedIdSet]
  );

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return options;

    return options.filter((option) => option.name?.toLowerCase().includes(term));
  }, [options, query]);

  function toggleOption(optionId) {
    const numericId = Number(optionId);

    if (selectedIdSet.has(numericId)) {
      onChange(selectedIds.filter((existingId) => Number(existingId) !== numericId));
    } else {
      onChange([...selectedIds, numericId]);
    }
  }

  function removeOption(optionId) {
    const numericId = Number(optionId);
    onChange(selectedIds.filter((existingId) => Number(existingId) !== numericId));
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      {selectedOptions.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 py-1 pl-3 pr-1.5 text-xs font-medium text-blue-700"
            >
              {option.name}

              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => removeOption(option.id)}
                disabled={disabled}
                aria-label={`Remover ${option.name}`}
                className="rounded-full p-0.5 text-blue-500 transition hover:bg-blue-100 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-gray-400">{noneSelectedMessage}</p>
      )}

      <div className="relative mt-2">
        <input
          id={id}
          type="text"
          value={dropdownOpen ? query : ""}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            setDropdownOpen(true);
            setQuery("");
          }}
          onBlur={() => setDropdownOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDropdownOpen(false);
              event.currentTarget.blur();
            }

            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
          placeholder={loading ? "Carregando..." : placeholder}
          disabled={disabled || loading}
          autoComplete="off"
          className={inputClass}
        />

        {dropdownOpen && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            {loading ? (
              <p className="px-4 py-3 text-sm text-gray-500">Carregando...</p>
            ) : filteredOptions.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">{emptyOptionsMessage}</p>
            ) : (
              filteredOptions.map((option) => {
                const checked = selectedIdSet.has(Number(option.id));

                return (
                  <label
                    key={option.id}
                    onMouseDown={(event) => event.preventDefault()}
                    className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-gray-800 transition hover:bg-blue-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(option.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {option.name}
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
