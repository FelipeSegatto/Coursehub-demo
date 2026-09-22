import InvoiceRow from "./InvoiceRow";

export default function InvoiceSection({
  invoices = [],
  payments = [],
  billingType,
  onPaymentApproved,
}) {
  const isMonthlyPlan = billingType === "monthly_plan";

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {isMonthlyPlan
            ? "Mensalidades"
            : "Cobrança do curso"}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {isMonthlyPlan
            ? "Acompanhe as mensalidades pagas, pendentes e ainda a vencer."
            : "Consulte o valor, a forma de pagamento e a situação da cobrança deste curso."}
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="font-semibold text-slate-900">
            Nenhuma cobrança encontrada
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Este contrato ainda não possui cobranças cadastradas.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {invoices.map((invoice) => {
            const invoicePayment =
              payments.find(
                (payment) =>
                  Number(
                    payment.invoiceId ??
                      payment.invoice_id
                  ) === Number(invoice.id) &&
                  payment.status === "approved"
              ) ||
              payments.find(
                (payment) =>
                  Number(
                    payment.invoiceId ??
                      payment.invoice_id
                  ) === Number(invoice.id)
              ) ||
              null;

            return (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                payment={invoicePayment}
                billingType={billingType}
                onPaymentApproved={onPaymentApproved}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}