import PaymentRow from "./PaymentRow";

export default function PaymentHistorySection({
  payments = [],
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Histórico de pagamentos
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Pagamentos realizados ou processados para este curso.
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="font-semibold text-slate-900">
            Nenhum pagamento encontrado
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Ainda não existem pagamentos registrados para este
            contrato.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
            />
          ))}
        </div>
      )}
    </section>
  );
}