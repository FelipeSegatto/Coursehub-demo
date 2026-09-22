import ContractSection from "../ContractSection";
import FeaturedInvoiceCard from "../FeaturedInvoiceCard";
import FinanceStatusBanner from "../FinanceStatusBanner";
import FinanceSummaryCards from "../FinanceSummaryCards";

export default function AllCoursesFinanceView({
  summary,
  overdueInvoice,
  nextInvoice,
  invoices = [],
  contracts = [],
  onPaymentApproved,
}) {
  const featuredInvoice =
    overdueInvoice || nextInvoice || null;

  return (
    <div className="space-y-6">
      <FinanceStatusBanner invoices={invoices} />

      <FinanceSummaryCards summary={summary} />

      {featuredInvoice && (
        <FeaturedInvoiceCard invoice={featuredInvoice} onPaymentApproved={onPaymentApproved} />
      )}

      <ContractSection contracts={contracts} />
    </div>
  );
}