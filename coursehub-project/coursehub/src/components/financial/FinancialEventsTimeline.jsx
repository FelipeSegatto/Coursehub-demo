import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "./paymentLabels";

const EVENT_TYPE_LABELS = {
  // Contratação e cobrança
  contract_created: "Contrato criado",
  initial_invoice_created: "Fatura de ativação gerada",
  contract_cancelled: "Contrato cancelado",
  invoice_due_date_changed: "Vencimento da fatura alterado",
  invoice_amount_changed: "Valor da fatura alterado",
  invoice_cancelled: "Fatura cancelada",
  invoice_marked_overdue: "Fatura marcada como atrasada",

  // Pagamento e ativação
  invoice_paid_manually: "Pagamento registrado manualmente",
  invoice_paid: "Pagamento confirmado pelo gateway",
  invoice_payment_confirmed: "Pagamento da fatura confirmado",
  payment_approved_after_invoice_already_paid:
    "Pagamento aprovado após fatura já paga (requer conciliação)",
  payment_refunded: "Pagamento reembolsado",
  payment_chargeback: "Chargeback recebido",
  gateway_status_notified: "Notificação do gateway recebida",
  contract_activated: "Contrato ativado",
  enrollment_created: "Matrícula criada",
  enrollment_locked_automatically: "Matrícula bloqueada automaticamente",

  // Conta e acesso ao sistema
  account_activated: "Conta ativada pelo aluno",
  account_activation_invitation_created: "Convite de ativação enviado",
  account_activation_invitation_resent: "Convite de ativação reenviado",
  account_activation_manual_link_generated:
    "Link de ativação gerado manualmente",
  account_activation_previous_tokens_invalidated:
    "Convites de ativação anteriores invalidados",

  // Checkout multi-canal e link de pagamento
  contract_acceptance_recorded: "Aceite do contrato registrado",
  invoice_payment_link_generated: "Link de pagamento gerado",
  invoice_payment_link_sent: "Link de pagamento enviado por e-mail",
  invoice_payment_link_message_prepared: "Mensagem de WhatsApp preparada",
};

const SOURCE_LABELS = {
  system: "Sistema",
  admin: "Administrador",
  gateway: "Gateway",
  student: "Aluno",
};

// Chaves reais gravadas em financial_events.previous_value/new_value pelos
// serviços do backend (ver services/financial e services/auth) -- cobre o
// vocabulário inteiro usado hoje, não só o da contratação.
const VALUE_KEY_LABELS = {
  studentId: "Aluno",
  courseId: "Curso",
  courseName: "Curso",
  contractingPartyId: "Contratante",
  origin: "Origem",
  amount: "Valor",
  dueDate: "Vencimento",
  deliveryMethod: "Canal de envio",
  expiresAt: "Expira em",
  status: "Status",
  invoiceStatus: "Status da fatura",
  paymentStatus: "Status do pagamento",
  enrollmentStatus: "Status da matrícula",
  cancellationReason: "Motivo do cancelamento",
  lockReason: "Motivo do bloqueio",
  paidAt: "Pago em",
  cancelledAt: "Cancelado em",
  refundedAt: "Reembolsado em",
  refundReason: "Motivo do reembolso",
  paymentMethod: "Forma de pagamento",
  scholarshipType: "Tipo de bolsa",
  justification: "Justificativa",
  authorizedByUserId: "Autorizado por (usuário)",
  validUntil: "Válido até",
};

// Valores de enum que também aparecem dentro desses blocos (status,
// origem, forma de pagamento, canal de envio) -- traduzidos à parte da
// chave, já que o mesmo valor ("admin", por exemplo) pode aparecer em
// campos diferentes. As entradas de forma de pagamento e status de
// pagamento vêm de paymentLabels.js (fonte única, compartilhada com a
// tabela de pagamentos em FinancialInvoicesDetails.jsx) em vez de
// duplicadas aqui -- o restante do mapa cobre enums que não são de
// payments (status de invoice/contrato, origem, canal de envio).
const VALUE_ENUM_LABELS = {
  pending_payment: "Aguardando pagamento",
  active: "Ativo",
  overdue: "Atrasada",
  completed: "Concluído",
  paid: "Paga",
  locked: "Bloqueada",
  financial_overdue: "Inadimplência",
  email: "E-mail",
  manual_link: "Link manual",
  admin: "Comercial (admin)",
  public_checkout: "Checkout público",
  authenticated_checkout: "Checkout autenticado",
  migration: "Migração",
  scholarship: "Bolsa",
  courtesy: "Cortesia",
  withdrawn: "Desistente",
  student_withdrawal: "Desistência do aluno",
  ...PAYMENT_METHOD_LABELS,
  ...PAYMENT_STATUS_LABELS,
};

function formatDateTime(value) {
  if (!value) {
    return "Data não informada";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatEventType(eventType) {
  if (!eventType) {
    return "Evento financeiro";
  }

  return (
    EVENT_TYPE_LABELS[eventType] ||
    eventType
      .replaceAll("_", " ")
      .replace(/^\w/, (letter) =>
        letter.toUpperCase()
      )
  );
}

function formatSource(source) {
  return SOURCE_LABELS[source] || source || "Origem desconhecida";
}

const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/;

function formatPrimitiveValue(value) {
  if (value === null || value === undefined) {
    return "Não informado";
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string" && ISO_DATETIME_PATTERN.test(value)) {
    const hasTime = value.includes("T");

    return hasTime
      ? formatDateTime(value)
      : new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
  }

  return VALUE_ENUM_LABELS[value] || String(value);
}

function formatValueKey(key) {
  return (
    VALUE_KEY_LABELS[key] ||
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

function ValueBlock({ title, value }) {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return (
      <div className="rounded-lg bg-slate-50 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </span>

        <p className="mt-1 break-words text-sm text-slate-700">
          {formatPrimitiveValue(value)}
        </p>
      </div>
    );
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </span>

      <dl className="mt-2 space-y-2">
        {entries.map(([key, entryValue]) => (
          <div
            key={key}
            className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"
          >
            <dt className="text-xs font-medium text-slate-500">
              {formatValueKey(key)}
            </dt>

            <dd className="break-words text-sm text-slate-700 sm:text-right">
              {formatPrimitiveValue(entryValue)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EmptyTimelineState() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-500">
        ↻
      </div>

      <h3 className="mt-4 text-base font-semibold text-slate-900">
        Nenhum evento registrado
      </h3>

      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
        As alterações e operações realizadas neste contrato
        aparecerão aqui.
      </p>
    </div>
  );
}

export default function FinancialEventsTimeline({
  events = [],
}) {
  if (!Array.isArray(events) || events.length === 0) {
    return <EmptyTimelineState />;
  }

  return (
    <ol className="divide-y divide-slate-100">
      {events.map((event, index) => (
        <li
          key={event.id ?? `${event.eventType}-${index}`}
          className="relative px-5 py-5"
        >
          <div className="flex gap-4">
            <div className="relative flex shrink-0 flex-col items-center">
              <span className="mt-1 h-3 w-3 rounded-full border-2 border-blue-600 bg-white" />

              {index < events.length - 1 && (
                <span className="absolute top-5 h-[calc(100%+24px)] w-px bg-slate-200" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {formatEventType(
                      event.eventType ??
                        event.event_type
                    )}
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    {formatSource(event.source)}
                    {event.actorUserId ||
                    event.actor_user_id
                      ? ` · Usuário #${
                          event.actorUserId ??
                          event.actor_user_id
                        }`
                      : ""}
                  </p>
                </div>

                <time className="whitespace-nowrap text-xs text-slate-500">
                  {formatDateTime(
                    event.createdAt ??
                      event.created_at
                  )}
                </time>
              </div>

              {event.reason && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Motivo
                  </span>

                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {event.reason}
                  </p>
                </div>
              )}

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <ValueBlock
                  title="Valor anterior"
                  value={
                    event.previousValue ??
                    event.previous_value
                  }
                />

                <ValueBlock
                  title="Novo valor"
                  value={
                    event.newValue ??
                    event.new_value
                  }
                />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}