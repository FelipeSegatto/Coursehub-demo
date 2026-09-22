import { apiFetch, API_URL } from "./APIService";

/**
 * Wrappers para os 6 grupos de endpoint de documentos financeiros
 * (contrato/2ª via/recibo x admin/aluno). Todos seguem o mesmo trio:
 * request (POST idempotente) / status (GET) / a URL de download (uma
 * navegação de browser simples, mesmo padrão já usado pelo link
 * existente de "Ver termo do contrato" em FinancialContractsDetails --
 * o Content-Disposition do backend já faz o navegador baixar o
 * arquivo, sem precisar de blob/JS extra aqui).
 */

function buildEndpoints(basePath) {
  return {
    request: () => apiFetch(basePath, { method: "POST" }),
    status: () => apiFetch(basePath),
    downloadUrl: `${API_URL}${basePath}/download`,
  };
}

function forContract(basePathPrefix, contractId) {
  return buildEndpoints(`${basePathPrefix}/contracts/${contractId}/document`);
}

function forInvoice(basePathPrefix, invoiceId) {
  return buildEndpoints(`${basePathPrefix}/invoices/${invoiceId}/document`);
}

function forPayment(basePathPrefix, paymentId) {
  return buildEndpoints(`${basePathPrefix}/payments/${paymentId}/receipt`);
}

export function getAdminContractDocumentEndpoints(contractId) {
  return forContract("/api/admin/financial", contractId);
}

export function getAdminInvoiceCopyEndpoints(invoiceId) {
  return forInvoice("/api/admin/financial", invoiceId);
}

export function getAdminPaymentReceiptEndpoints(paymentId) {
  return forPayment("/api/admin/financial", paymentId);
}

export function getStudentContractDocumentEndpoints(contractId) {
  return forContract("/api/student/finance", contractId);
}

export function getStudentInvoiceCopyEndpoints(invoiceId) {
  return forInvoice("/api/student/finance", invoiceId);
}

export function getStudentPaymentReceiptEndpoints(paymentId) {
  return forPayment("/api/student/finance", paymentId);
}
