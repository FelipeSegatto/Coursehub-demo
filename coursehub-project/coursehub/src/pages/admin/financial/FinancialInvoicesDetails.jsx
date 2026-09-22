import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import { getFinancialInvoiceDetails } from "../../../services/FinancialService";

import InvoiceStatusBadge from "../../../components/financial/InvoiceStatusBadge";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from "../../../components/financial/paymentLabels";
import ChangeInvoiceDueDateModal from "../../../components/financial/ChangeInvoiceDueDateModal";
import ChangeInvoiceAmountModal from "../../../components/financial/ChangeInvoiceAmountModal";
import RegisterManualPaymentModal from "../../../components/financial/RegisterManualPaymentModal";
import CancelInvoiceModal from "../../../components/financial/CancelInvoiceModal";
import RefundPaymentModal from "../../../components/financial/RefundPaymentModal";
import InvoicePaymentLinkMenu from "../../../components/financial/InvoicePaymentLinkMenu";
import DocumentDownloadButton from "../../../components/documents/DocumentDownloadButton";
import MobileExpandableCard from "../../../components/ui/MobileExpandableCard";
import {
  getAdminInvoiceCopyEndpoints,
  getAdminPaymentReceiptEndpoints,
} from "../../../services/DocumentGenerationService";

function formatCurrency(value) {
  const number = Number(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(number) ? number : 0);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const datePart =
    typeof value === "string"
      ? value.split("T")[0]
      : value;

  const date = new Date(`${datePart}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR").format(
        date
      );
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function extractResponseData(response) {
  return response?.data ?? response ?? {};
}

function normalizeInvoiceResponse(response) {
  const result = extractResponseData(response);

  return {
    invoice:
      result.invoice ??
      result.financialInvoice ??
      result,

    payments: Array.isArray(result.payments)
      ? result.payments
      : Array.isArray(result.invoice?.payments)
        ? result.invoice.payments
        : [],
  };
}

function DetailItem({ label, value, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      <dd className="mt-1.5 text-sm font-medium text-slate-800">
        {children ?? value ?? "—"}
      </dd>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  valueClassName = "text-slate-900",
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>

      <p
        className={[
          "mt-2 text-2xl font-semibold",
          "tracking-tight",
          valueClassName,
        ].join(" ")}
      >
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </article>
  );
}

export default function FinancialInvoicesDetails() {
 const { cobrancaId } = useParams();
 const navigate = useNavigate();



  const [invoice, setInvoice] =
    useState(null);
  const [payments, setPayments] =
    useState([]);

  const [loading, setLoading] =
    useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] =
    useState(0);

  const [activeModal, setActiveModal] =
    useState(null);

  const [selectedPayment, setSelectedPayment] =
    useState(null);

  const loadInvoice = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response =
        await getFinancialInvoiceDetails(
          cobrancaId
        );

      const normalized =
        normalizeInvoiceResponse(response);

      setInvoice(normalized.invoice);
      setPayments(normalized.payments);
    } catch (requestError) {
      setInvoice(null);
      setPayments([]);

      setError(
        requestError?.message ||
          "Não foi possível carregar a fatura."
      );
    } finally {
      setLoading(false);
    }
  }, [cobrancaId]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice, reloadKey]);

  const financialValues = useMemo(() => {
    const amount = Number(
      invoice?.amount ??
        invoice?.totalAmount ??
        invoice?.total_amount ??
        0
    );

    const paidAmount = Number(
      invoice?.paidAmount ??
        invoice?.paid_amount ??
        0
    );

    return {
      amount,
      paidAmount,
      remainingAmount: Math.max(
        amount - paidAmount,
        0
      ),
    };
  }, [invoice]);

  function reloadInvoice() {
    setReloadKey((value) => value + 1);
  }

  function openRefundModal(payment) {
    setSelectedPayment(payment);
    setActiveModal("refund");
  }

  function closeModal() {
    setActiveModal(null);
    setSelectedPayment(null);
  }

  if (loading) {
    return (
      <main className="min-h-full bg-slate-50 px-4 py-8">
        <div className="flex min-h-[420px] items-center justify-center">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        </div>
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="min-h-full bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            Não foi possível carregar a fatura
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {error}
          </p>

          <button
            type="button"
            onClick={reloadInvoice}
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  const contractId =
    invoice.financialContractId ??
    invoice.financial_contract_id ??
    invoice.contractId ??
    invoice.contract_id;

  const dueDate =
    invoice.dueDate ??
    invoice.due_date;

  const canEdit =
    !["cancelled", "refunded"].includes(
      invoice.status
    );

  const canRegisterPayment =
    ["pending", "overdue", "processing"].includes(
      invoice.status
    ) &&
    financialValues.remainingAmount > 0;

  const canCancel =
    ["pending", "overdue"].includes(
      invoice.status
    );

  const canShareLink =
    ["pending", "overdue", "processing"].includes(
      invoice.status
    );

  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/admin/financeiro/cobrancas"
                )
              }
              className="text-sm font-semibold text-blue-600 hover:underline"
            >
              ← Voltar às faturas
            </button>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                Fatura #{invoice.id}
              </h1>

              <InvoiceStatusBadge
                status={invoice.status}
              />
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Consulte valores, vencimento,
              pagamentos e operações da fatura.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <DocumentDownloadButton
              endpoints={getAdminInvoiceCopyEndpoints(invoice.id)}
              label="2ª via"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            />

            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActiveModal("dueDate")
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Alterar vencimento
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveModal("amount")
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Alterar valor
                </button>
              </>
            )}

            {canRegisterPayment && (
              <button
                type="button"
                onClick={() =>
                  setActiveModal("payment")
                }
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Registrar pagamento
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() =>
                  setActiveModal("cancel")
                }
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Cancelar fatura
              </button>
            )}
          </div>
        </header>

        {canShareLink && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-900">Compartilhar cobrança</h2>
            <InvoicePaymentLinkMenu invoiceId={invoice.id} />
          </section>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            label="Valor da fatura"
            value={formatCurrency(
              financialValues.amount
            )}
            description="Valor total atual"
          />

          <SummaryCard
            label="Valor pago"
            value={formatCurrency(
              financialValues.paidAmount
            )}
            description="Pagamentos confirmados"
            valueClassName="text-emerald-700"
          />

          <SummaryCard
            label="Saldo restante"
            value={formatCurrency(
              financialValues.remainingAmount
            )}
            description="Valor ainda pendente"
            valueClassName={
              invoice.status === "overdue"
                ? "text-red-700"
                : "text-slate-900"
            }
          />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">
              Informações da fatura
            </h2>
          </header>

          <dl className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem
              label="Identificador"
              value={`#${invoice.id}`}
            />

            <DetailItem label="Status">
              <InvoiceStatusBadge
                status={invoice.status}
              />
            </DetailItem>

            <DetailItem
              label="Contrato"
              value={
                contractId
                  ? `#${contractId}`
                  : "—"
              }
            />

            <DetailItem
              label="Matrícula"
              value={
                invoice.enrollmentId ??
                invoice.enrollment_id
                  ? `#${
                      invoice.enrollmentId ??
                      invoice.enrollment_id
                    }`
                  : "—"
              }
            />

            <DetailItem
              label="Vencimento"
              value={formatDate(dueDate)}
            />

            <DetailItem
              label="Parcela"
              value={
                invoice.installmentNumber ??
                invoice.installment_number ??
                "—"
              }
            />

            <DetailItem
              label="Criada em"
              value={formatDateTime(
                invoice.createdAt ??
                  invoice.created_at
              )}
            />

            <DetailItem
              label="Atualizada em"
              value={formatDateTime(
                invoice.updatedAt ??
                  invoice.updated_at
              )}
            />
          </dl>

          {contractId && (
            <div className="border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/admin/financeiro/contratos/${contractId}`
                  )
                }
                className="text-sm font-semibold text-blue-600 hover:underline"
              >
                Ver contrato relacionado
              </button>
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">
              Pagamentos
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {payments.length}{" "}
              {payments.length === 1
                ? "pagamento registrado"
                : "pagamentos registrados"}
            </p>
          </header>

          {payments.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              Nenhum pagamento registrado para
              esta fatura.
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[850px]">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      {[
                        { label: "Pagamento", align: "left" },
                        { label: "Valor", align: "right" },
                        { label: "Forma", align: "left" },
                        { label: "Status", align: "left" },
                        { label: "Data", align: "left" },
                        { label: "Referência", align: "left" },
                        { label: "", align: "right" },
                      ].map((column) => (
                        <th
                          key={column.label || "actions"}
                          className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                            column.align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr
                        key={payment.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 text-sm font-semibold text-slate-800">
                          #{payment.id}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold tabular-nums text-emerald-700">
                          {formatCurrency(
                            payment.amount
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {getPaymentMethodLabel(
                            payment.paymentMethod ??
                              payment.payment_method
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {getPaymentStatusLabel(payment.status)}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatDateTime(
                            payment.paymentDate ??
                              payment.payment_date ??
                              payment.createdAt ??
                              payment.created_at
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {payment.reference ?? "—"}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {payment.status === "approved" && (
                              <DocumentDownloadButton
                                endpoints={getAdminPaymentReceiptEndpoints(payment.id)}
                                label="recibo"
                                className="text-sm font-semibold text-blue-600 hover:underline"
                              />
                            )}

                            {![
                              "refunded",
                              "cancelled",
                            ].includes(
                              payment.status
                            ) && (
                              <button
                                type="button"
                                onClick={() =>
                                  openRefundModal(
                                    payment
                                  )
                                }
                                className="text-sm font-semibold text-red-600 hover:underline"
                              >
                                Reembolsar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {payments.map((payment) => (
                  <MobileExpandableCard
                    key={payment.id}
                    title={`Pagamento #${payment.id}`}
                    subtitle={formatCurrency(payment.amount)}
                    badge={
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {getPaymentStatusLabel(payment.status)}
                      </span>
                    }
                    primaryAction={
                      (payment.status === "approved" ||
                        !["refunded", "cancelled"].includes(payment.status)) && (
                        <div className="flex items-center gap-4">
                          {payment.status === "approved" && (
                            <DocumentDownloadButton
                              endpoints={getAdminPaymentReceiptEndpoints(payment.id)}
                              label="recibo"
                              className="text-sm font-semibold text-blue-600 hover:underline"
                            />
                          )}

                          {!["refunded", "cancelled"].includes(payment.status) && (
                            <button
                              type="button"
                              onClick={() => openRefundModal(payment)}
                              className="text-sm font-semibold text-red-600 hover:underline"
                            >
                              Reembolsar
                            </button>
                          )}
                        </div>
                      )
                    }
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Forma</span>
                      <span className="font-medium text-slate-900">
                        {getPaymentMethodLabel(payment.paymentMethod ?? payment.payment_method)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Data</span>
                      <span className="font-medium text-slate-900">
                        {formatDateTime(
                          payment.paymentDate ?? payment.payment_date ?? payment.createdAt ?? payment.created_at
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Referência</span>
                      <span className="font-medium text-slate-900">{payment.reference ?? "—"}</span>
                    </div>
                  </MobileExpandableCard>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <ChangeInvoiceDueDateModal
        open={activeModal === "dueDate"}
        invoice={invoice}
        onClose={closeModal}
        onSuccess={reloadInvoice}
      />

      <ChangeInvoiceAmountModal
        open={activeModal === "amount"}
        invoice={invoice}
        onClose={closeModal}
        onSuccess={reloadInvoice}
      />

      <RegisterManualPaymentModal
        open={activeModal === "payment"}
        invoice={invoice}
        onClose={closeModal}
        onSuccess={reloadInvoice}
      />

      <CancelInvoiceModal
        open={activeModal === "cancel"}
        invoice={invoice}
        onClose={closeModal}
        onSuccess={reloadInvoice}
      />

      <RefundPaymentModal
        open={activeModal === "refund"}
        payment={selectedPayment}
        onClose={closeModal}
        onSuccess={reloadInvoice}
      />
    </main>
  );
}