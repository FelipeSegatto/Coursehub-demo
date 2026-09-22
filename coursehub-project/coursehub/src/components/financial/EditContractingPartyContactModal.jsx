import { useEffect, useState } from "react";

import { updateContractingPartyContact } from "../../services/ContractingPartyService";

import FinancialModal from "./FinancialModal";

/**
 * Edita SOMENTE e-mail e telefone do cadastro mestre do contratante
 * (PATCH /contracting-parties/:id/contact) -- nome, documento, tipo e
 * status ficam sempre como texto somente leitura aqui. Nunca toca em
 * contratos já existentes: eles guardam seu próprio snapshot,
 * congelado no momento da contratação.
 */
export default function EditContractingPartyContactModal({
  open,
  party,
  documentTypeLabel,
  onClose,
  onSuccess,
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !party) return;

    setEmail(party.email || "");
    setPhone(party.phone || "");
    setError("");
  }, [open, party]);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Informe o e-mail de contato.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await updateContractingPartyContact(party.id, {
        email: trimmedEmail,
        phone: phone.trim() || null,
      });

      onSuccess?.(result?.data);
    } catch (requestError) {
      setError(requestError?.message || "Não foi possível atualizar o contato do contratante.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinancialModal
      open={open}
      title="Editar contato do contratante"
      description={party ? `Atualize o telefone e o e-mail de ${party.name}.` : ""}
      submitLabel="Salvar alterações"
      loading={loading}
      submitDisabled={!email.trim()}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nome</p>
        <p className="mt-1 font-medium text-slate-800">{party?.name}</p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo de documento</p>
            <p className="mt-1 text-slate-700">{documentTypeLabel || "-"}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Documento</p>
            <p className="mt-1 text-slate-700">{party?.documentNumber || "-"}</p>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="contracting-party-email" className="mb-1.5 block text-sm font-semibold text-slate-700">
          E-mail
        </label>

        <input
          id="contracting-party-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={loading}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div>
        <label htmlFor="contracting-party-phone" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Telefone
        </label>

        <input
          id="contracting-party-phone"
          type="text"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={loading}
          placeholder="Opcional"
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
        Esta alteração atualiza somente o cadastro atual do contratante. Contratos e documentos já emitidos
        não serão modificados.
      </p>
    </FinancialModal>
  );
}
