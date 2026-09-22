import { useEffect, useState } from "react";
import { listNotificationPreferences, updateNotificationPreference } from "../../services/NotificationService";

const CATEGORY_LABELS = {
  learning: {
    label: "Acadêmico",
    description: "Atividades, avaliações, conteúdos, encontros, notas e frequência.",
  },
  financial: {
    label: "Financeiro",
    description: "Faturas, pagamentos e lembretes de vencimento.",
  },
  calendar: {
    label: "Calendário institucional",
    description: "Eventos institucionais publicados, alterados ou cancelados.",
  },
  chat: {
    label: "Chat",
    description: "Novas mensagens em suas conversas.",
  },
};

function labelFor(category) {
  return CATEGORY_LABELS[category]?.label || category;
}

function descriptionFor(category) {
  return CATEGORY_LABELS[category]?.description || "";
}

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingCategory, setSavingCategory] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const result = await listNotificationPreferences();

        if (!cancelled) {
          setPreferences(result || []);
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error("[NotificationPreferences] erro ao carregar:", requestError);
          setError(requestError.message || "Não foi possível carregar as preferências.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(category, nextValue) {
    const previousPreferences = preferences;

    setPreferences((current) =>
      current.map((preference) =>
        preference.category === category
          ? { ...preference, emailEnabled: nextValue, isDefault: false }
          : preference
      )
    );
    setSavingCategory(category);

    try {
      await updateNotificationPreference(category, nextValue);
    } catch (requestError) {
      console.error("[NotificationPreferences] erro ao salvar:", requestError);
      setPreferences(previousPreferences);
    } finally {
      setSavingCategory(null);
    }
  }

  if (loading) {
    return <p className="py-6 text-center text-gray-500">Carregando preferências...</p>;
  }

  if (error) {
    return <p className="py-6 text-center text-sm text-red-700">{error}</p>;
  }

  if (preferences.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {preferences.map((preference) => (
        <div
          key={preference.category}
          className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 py-4 px-8"
        >
          <div>
            <p className="font-semibold text-gray-900">{labelFor(preference.category)}</p>
            <p className="text-sm text-gray-500">{descriptionFor(preference.category)}</p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={preference.emailEnabled}
            disabled={savingCategory === preference.category}
            onClick={() => handleToggle(preference.category, !preference.emailEnabled)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
              preference.emailEnabled ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                preference.emailEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
