import { useEffect, useState } from "react";

import {
  getContractWithdrawalImpact,
  registerContractWithdrawal,
} from "../../services/FinancialService";

import FinancialModal from "./FinancialModal";

function formatCurrency(value) {
  const numericValue = Number(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

const CONFIRMATION_WORD = "DESISTIR";

/**
 * Fluxo de desistência: contrato ATIVO/EM ATRASO -> encerrado, junto
 * com a matrícula. Nunca reembolsa automaticamente -- o admin só
 * escolhe o tratamento das cobranças já vencidas (manter ou
 * cancelar); faturas futuras ainda não pagas são sempre canceladas
 * pelo backend, e faturas pagas/reembolsadas nunca são tocadas.
 */
export default function ContractWithdrawalModal({ open, contractId, onClose, onSuccess }) {
  const [impact, setImpact] = useState(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [impactError, setImpactError] = useState("");

  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [overdueInvoiceAction, setOverdueInvoiceAction] = useState("keep");
  const [confirmation, setConfirmation] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!open || !contractId) return;

    setImpact(null);
    setImpactError("");
    setReason("");
    setNotes("");
    setOverdueInvoiceAction("keep");
    setConfirmation("");
    setSubmitError("");

    let ignoreRequest = false;

    async function loadImpact() {
      try {
        setLoadingImpact(true);

        const response = await getContractWithdrawalImpact(contractId);

        if (!ignoreRequest) {
          setImpact(response?.data || null);
        }
      } catch (requestError) {
        if (!ignoreRequest) {
          setImpactError(requestError?.message || "Não foi possível carregar o impacto da desistência.");
        }
      } finally {
        if (!ignoreRequest) {
          setLoadingImpact(false);
        }
      }
    }

    loadImpact();

    return () => {
      ignoreRequest = true;
    };
  }, [open, contractId]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!reason.trim()) {
      setSubmitError("Informe o motivo da desistência.");
      return;
    }

    if (confirmation.trim().toUpperCase() !== CONFIRMATION_WORD) {
      setSubmitError(`Digite "${CONFIRMATION_WORD}" para confirmar.`);
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError("");

      const response = await registerContractWithdrawal(contractId, {
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        overdueInvoiceAction,
      });

      await onSuccess?.(response?.message);
      onClose();
    } catch (requestError) {
      setSubmitError(requestError?.message || "Não foi possível registrar a desistência.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    Boolean(impact?.isWithdrawalAllowed) &&
    reason.trim().length > 0 &&
    confirmation.trim().toUpperCase() === CONFIRMATION_WORD;

  return (
    <FinancialModal
      open={open}
      title="Registrar desistência"
      description="Encerra antecipadamente um contrato ativo, coordenando contrato, matrícula e cobranças."
      submitLabel="Confirmar desistência"
      danger
      loading={submitting}
      submitDisabled={!canSubmit}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      {loadingImpact && (
        <p className="py-6 text-center text-sm text-slate-500">Carregando impacto da desistência...</p>
      )}

      {!loadingImpact && impactError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{impactError}</div>
      )}

      {!loadingImpact && !impactError && impact && (
        <>
          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
          )}

          {!impact.isWithdrawalAllowed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Desistência não permitida</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {impact.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aluno</p>
              <p className="mt-1 font-medium text-slate-800">{impact.student?.name || "-"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Curso</p>
              <p className="mt-1 font-medium text-slate-800">{impact.course?.name || "-"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contratante</p>
              <p className="mt-1 font-medium text-slate-800">{impact.contractingParty?.name || "-"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status atual</p>
              <p className="mt-1 font-medium text-slate-800">
                Contrato: {impact.contract?.status} · Matrícula: {impact.enrollment?.status || "-"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xs text-slate-500">Pago</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">
                {formatCurrency(impact.totals.paidAmount)}
              </p>
              <p className="text-xs text-slate-400">{impact.totals.paidCount} fatura(s)</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xs text-slate-500">Abertas</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatCurrency(impact.totals.openAmount)}
              </p>
              <p className="text-xs text-slate-400">{impact.totals.openCount} fatura(s)</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xs text-slate-500">Vencidas</p>
              <p className="mt-1 text-sm font-semibold text-red-700">
                {formatCurrency(impact.totals.overdueAmount)}
              </p>
              <p className="text-xs text-slate-400">{impact.totals.overdueCount} fatura(s)</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xs text-slate-500">Reembolsadas</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatCurrency(impact.totals.refundedAmount)}
              </p>
              <p className="text-xs text-slate-400">{impact.totals.refundedCount} fatura(s)</p>
            </div>
          </div>

          {impact.totals.openCount > 0 && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              As {impact.totals.openCount} fatura(s) em aberto (ainda não vencidas), totalizando{" "}
              {formatCurrency(impact.totals.openAmount)}, serão canceladas automaticamente.
            </p>
          )}

          {impact.totals.overdueCount > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Tratamento das {impact.totals.overdueCount} fatura(s) vencida(s) ({formatCurrency(impact.totals.overdueAmount)})
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <label
                  className={`flex-1 cursor-pointer rounded-lg border px-4 py-3 text-sm ${
                    overdueInvoiceAction === "keep"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="overdueInvoiceAction"
                    value="keep"
                    checked={overdueInvoiceAction === "keep"}
                    onChange={() => setOverdueInvoiceAction("keep")}
                    className="mr-2"
                  />
                  Manter cobrança
                </label>

                <label
                  className={`flex-1 cursor-pointer rounded-lg border px-4 py-3 text-sm ${
                    overdueInvoiceAction === "cancel"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="overdueInvoiceAction"
                    value="cancel"
                    checked={overdueInvoiceAction === "cancel"}
                    onChange={() => setOverdueInvoiceAction("cancel")}
                    className="mr-2"
                  />
                  Cancelar cobrança
                </label>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="withdrawal-reason" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Motivo da desistência
            </label>

            <textarea
              id="withdrawal-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
          </div>

          <div>
            <label htmlFor="withdrawal-notes" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Observações (opcional)
            </label>

            <textarea
              id="withdrawal-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={submitting}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm leading-6 text-amber-800">
              A desistência encerra a matrícula e o acesso ao curso. Pagamentos já realizados e o histórico
              acadêmico serão preservados. Nenhum reembolso será feito automaticamente.
            </p>
          </div>

          <div>
            <label htmlFor="withdrawal-confirmation" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Digite {CONFIRMATION_WORD} para confirmar
            </label>

            <input
              id="withdrawal-confirmation"
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={submitting || !impact.isWithdrawalAllowed}
              autoComplete="off"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
          </div>
        </>
      )}
    </FinancialModal>
  );
}
