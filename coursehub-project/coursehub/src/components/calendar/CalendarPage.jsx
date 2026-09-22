import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";

import { useCalendarEvents } from "../../hooks/useCalendarEvents";
import {
  getMonthRangeBounds,
  todayDateString,
} from "../../utils/dateUtils";
import { apiFetch } from "../../services/APIService";

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deep link vindo de Encontros ("Ver no calendário"): ?date=YYYY-MM-DD
 * foca o mês/dia do encontro. Valor ausente ou mal formado é
 * ignorado silenciosamente -- nunca quebra a tela, só cai no padrão
 * (mês atual).
 */
function resolveInitialFocusDate(searchParams) {
  const dateParam = searchParams.get("date");

  if (dateParam && DATE_PARAM_PATTERN.test(dateParam)) {
    return dateParam;
  }

  return todayDateString();
}

import { getMacroFilters } from "./calendarDisplayConfig";
import CalendarToolbar from "./CalendarToolbar";
import CalendarFilterBar from "./CalendarFilterBar";
import CalendarMonthGrid from "./CalendarMonthGrid";
import CalendarAgendaSection from "./CalendarAgendaSection";
import CalendarEventDetailsDrawer from "./CalendarEventDetailsDrawer";
import CalendarEventFormModal from "./CalendarEventFormModal";

const today = new Date();

export default function CalendarPage({ role, userId, title, description }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [initialFocusDate] = useState(() => resolveInitialFocusDate(searchParams));
  const [initialFocusYear, initialFocusMonth] = initialFocusDate.split("-").map(Number);

  const [year, setYear] = useState(initialFocusYear);
  const [month, setMonth] = useState(initialFocusMonth - 1);
  const [selectedDate, setSelectedDate] = useState(initialFocusDate);
  const [macroFilterKey, setMacroFilterKey] = useState("all");
  const [activeIndicatorTypes, setActiveIndicatorTypes] = useState(new Set());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formModal, setFormModal] = useState(null); // { mode, event } | null
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const { from, to } = useMemo(() => getMonthRangeBounds(year, month), [year, month]);

  const { events, counts, loading, error } = useCalendarEvents({
    role,
    userId,
    from,
    to,
    reloadToken,
  });

  const macroFilters = getMacroFilters(role);
  const activeMacroFilter =
    macroFilters.find((filter) => filter.key === macroFilterKey) || macroFilters[0];

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (!activeMacroFilter.match(event)) return false;

      if (activeIndicatorTypes.size > 0 && !activeIndicatorTypes.has(event.indicatorType)) {
        return false;
      }

      return true;
    });
  }, [events, activeMacroFilter, activeIndicatorTypes]);

  const eventsForSelectedDay = useMemo(
    () => filteredEvents.filter((event) => event.startDate === selectedDate),
    [filteredEvents, selectedDate]
  );

  function goToPrevMonth() {
    if (month === 0) {
      setYear((previous) => previous - 1);
      setMonth(11);
    } else {
      setMonth((previous) => previous - 1);
    }
  }

  function goToNextMonth() {
    if (month === 11) {
      setYear((previous) => previous + 1);
      setMonth(0);
    } else {
      setMonth((previous) => previous + 1);
    }
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayDateString());
  }

  function handleMacroFilterChange(key) {
    setMacroFilterKey(key);
    setActiveIndicatorTypes(new Set());
  }

  function toggleIndicatorType(indicatorType) {
    setActiveIndicatorTypes((previous) => {
      const next = new Set(previous);

      if (next.has(indicatorType)) next.delete(indicatorType);
      else next.add(indicatorType);

      return next;
    });
  }

  function handleEdit(event) {
    setSelectedEvent(null);
    setFormModal({ mode: "edit", event });
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;

    try {
      setCancelling(true);

      await apiFetch(`/api/admin/calendar/events/${cancelTarget.sourceId}`, {
        method: "DELETE",
      });

      setCancelTarget(null);
      setSelectedEvent(null);
      setReloadToken((token) => token + 1);
    } catch {
      // erro exibido de forma discreta — não bloqueia o restante do calendário
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="p-6">
      <section className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {description && <p className="mt-2 text-gray-600">{description}</p>}
      </section>

      {counts && (
        <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Hoje</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{counts.today}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Próximos</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{counts.upcoming}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Atrasados</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{counts.overdue}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-400">Total do mês</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{counts.total}</p>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white p-6 shadow">
        <CalendarToolbar
          role={role}
          year={year}
          month={month}
          onPrevMonth={goToPrevMonth}
          onNextMonth={goToNextMonth}
          onToday={goToToday}
          macroFilterKey={activeMacroFilter.key}
          onMacroFilterChange={handleMacroFilterChange}
          onCreateClick={() => setFormModal({ mode: "create", event: null })}
          onCreateSession={
            role === "admin" || role === "teacher"
              ? () => navigate(`/${role === "admin" ? "admin" : "professor"}/encontros?date=${selectedDate}`)
              : undefined
          }
        />

        <CalendarFilterBar
          counts={counts}
          activeIndicatorTypes={activeIndicatorTypes}
          onToggle={toggleIndicatorType}
        />

        {loading && (
          <p className="py-10 text-center text-gray-500">Carregando calendário...</p>
        )}

        {!loading && error && (
          <p className="py-10 text-center text-red-500">{error}</p>
        )}

        {!loading && !error && (
          <>
            <CalendarMonthGrid
              year={year}
              month={month}
              events={filteredEvents}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            <CalendarAgendaSection
              selectedDate={selectedDate}
              events={eventsForSelectedDay}
              onOpenDetails={setSelectedEvent}
              onEdit={role === "admin" ? handleEdit : undefined}
              onCancel={role === "admin" ? setCancelTarget : undefined}
            />
          </>
        )}
      </section>

      <CalendarEventDetailsDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={role === "admin" ? handleEdit : undefined}
        onCancel={role === "admin" ? setCancelTarget : undefined}
      />

      {role === "admin" && formModal && (
        <CalendarEventFormModal
          open={Boolean(formModal)}
          mode={formModal.mode}
          initialData={formModal.event}
          onClose={() => setFormModal(null)}
          onSuccess={() => setReloadToken((token) => token + 1)}
        />
      )}

      {role === "admin" && (
        <Dialog.Root
          open={Boolean(cancelTarget)}
          onOpenChange={(open) => !open && setCancelTarget(null)}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />

            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-lg font-bold text-gray-900">
                  Cancelar evento
                </Dialog.Title>

                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Fechar"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
                  >
                    <X size={18} />
                  </button>
                </Dialog.Close>
              </div>

              <p className="mt-3 text-sm text-gray-600">
                Tem certeza que deseja cancelar{" "}
                <strong>{cancelTarget?.title}</strong>? Ele deixará de aparecer no
                calendário dos alunos e professores.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleConfirmCancel}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </main>
  );
}
