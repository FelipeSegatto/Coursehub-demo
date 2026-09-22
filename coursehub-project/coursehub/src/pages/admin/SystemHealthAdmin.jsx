import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";

const POLL_MS = 30000;

function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ ok }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {ok ? "OK" : "Atenção"}
    </span>
  );
}

function MetricCard({ label, value, warn }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-red-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function SystemHealthAdmin() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let intervalId = null;
    let cancelled = false;

    async function fetchHealth() {
      try {
        const result = await apiFetch("/api/admin/system-health");

        if (cancelled) return;

        setHealth(result);
        setError("");
      } catch (requestError) {
        if (cancelled) return;

        setError(requestError.message || "Não foi possível carregar o status do sistema.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function start() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (!cancelled) fetchHealth();
      }, POLL_MS);
    }

    function stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stop();
      } else {
        fetchHealth();
        start();
      }
    }

    fetchHealth();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const outboxHealthy = health ? health.notificationOutbox.stuckProcessing === 0 && health.notificationOutbox.failed === 0 : true;
  const remindersHealthy = health ? health.scheduledReminders.dueUnprocessed === 0 : true;

  return (
    <main className="p-6">
      <section className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Status do sistema</h1>
        <p className="mt-2 text-gray-600">
          Visão operacional dos workers de notificação/e-mail e das filas de atendimento do chat. Atualiza a cada 30s.
        </p>
      </section>

      {loading && <p className="py-6 text-center text-sm text-gray-500">Carregando...</p>}

      {!loading && error && <p className="py-3 text-center text-sm text-red-700">{error}</p>}

      {!loading && !error && health && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Fila de notificações / e-mail</h2>
              <StatusPill ok={outboxHealthy} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <MetricCard label="Pendentes" value={health.notificationOutbox.pending} />
              <MetricCard label="Em processamento" value={health.notificationOutbox.processing} />
              <MetricCard
                label="Travadas"
                value={health.notificationOutbox.stuckProcessing}
                warn={health.notificationOutbox.stuckProcessing > 0}
              />
              <MetricCard
                label="Falhas"
                value={health.notificationOutbox.failed}
                warn={health.notificationOutbox.failed > 0}
              />
              <MetricCard label="Enviadas (24h)" value={health.notificationOutbox.sentLast24h} />
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Pendente mais antiga: {formatDateTime(health.notificationOutbox.oldestPendingCreatedAt)}
            </p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Lembretes financeiros agendados</h2>
              <StatusPill ok={remindersHealthy} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <MetricCard
                label="Pendentes (vencidos)"
                value={health.scheduledReminders.dueUnprocessed}
                warn={health.scheduledReminders.dueUnprocessed > 0}
              />
              <MetricCard label="Última execução" value={formatDateTime(health.scheduledReminders.lastProcessedAt)} />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-3 font-bold text-gray-900">Filas de atendimento do chat</h2>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <MetricCard label="Protocolos de alunos sem atribuição" value={health.chatQueues.unassignedAdministrativeTickets} />
              <MetricCard label="Conversas com professores sem atribuição" value={health.chatQueues.unassignedStaffTickets} />
              <MetricCard label="Reports abertos" value={health.chatQueues.openReports} />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Gateway de pagamento</h2>
              <StatusPill ok={health.paymentGateway.configured} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <MetricCard label="Provedor ativo" value={health.paymentGateway.gateway} />
              <MetricCard
                label="Credenciais"
                value={health.paymentGateway.configured ? "Configuradas" : "Faltando"}
                warn={!health.paymentGateway.configured}
              />
            </div>
          </section>

          <p className="text-xs text-gray-400">Última verificação: {formatDateTime(health.checkedAt)}</p>
        </div>
      )}
    </main>
  );
}
