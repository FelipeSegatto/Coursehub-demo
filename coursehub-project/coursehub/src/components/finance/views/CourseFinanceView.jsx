import ContractDetails from "../ContractDetails";
import FeaturedInvoiceCard from "../FeaturedInvoiceCard";
import FinanceStatusBanner from "../FinanceStatusBanner";
import FinanceSummaryCards from "../FinanceSummaryCards";
import InvoiceSection from "../InvoiceSection";
import PaymentHistorySection from "../PaymentHistorySection";

import {
  buildCourseFinanceSummary,
  getFeaturedInvoice,
} from "../financeUtils";

export default function CourseFinanceView({
  courseData,
  onPaymentApproved,
}) {
  if (!courseData?.contract) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="font-semibold text-slate-900">
          Contrato não encontrado
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          Não encontramos informações financeiras para o curso
          selecionado.
        </p>
      </div>
    );
  }

  const {
    course,
    contract,
    invoices = [],
    payments = [],
  } = courseData;

  const summary = buildCourseFinanceSummary({
    contract,
    invoices,
    payments,
  });

  const contractPayment =
  courseData.payments?.find(
    (payment) => payment.status === "approved"
  ) ||
  courseData.payments?.[0] ||
  null;

  const featuredInvoice =
    getFeaturedInvoice(invoices);

  return (
    <div className="space-y-6">
      {course && (
        <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
          <p className="text-sm font-medium text-blue-600">
            Financeiro do curso
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            {course.name}
          </h2>
        </section>
      )}

      <FinanceStatusBanner
        contract={contract}
        invoices={invoices}
      />

      <FinanceSummaryCards summary={summary} />

      {featuredInvoice && (
        <FeaturedInvoiceCard
          invoice={{
            ...featuredInvoice,
            courseName:
              featuredInvoice.courseName ||
              featuredInvoice.course_name ||
              course?.name,
          }}
          onPaymentApproved={onPaymentApproved}
        />
      )}

      <ContractDetails
        contract={courseData.contract}
        payment={contractPayment}
      />

      <InvoiceSection
        invoices={courseData.invoices}
        payments={courseData.payments}
        billingType={
            courseData.contract?.billingType ??
            courseData.contract?.billing_type
        }
        onPaymentApproved={onPaymentApproved}
      />

      <PaymentHistorySection payments={payments} />
    </div>
  );
}