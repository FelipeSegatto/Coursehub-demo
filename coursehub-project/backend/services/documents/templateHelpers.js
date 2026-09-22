/**
 * Helpers de formatação compartilhados pelos templates de documento
 * (backend/services/documents/templates/*.js). Equivalentes aos já
 * existentes em contractTermsTemplate.js -- não importados de lá de
 * propósito, para não acoplar a infraestrutura nova de documentos ao
 * módulo de termos de contrato (já testado, financeiro, em produção).
 * Pequena duplicação aceita em troca de isolamento.
 */
const { normalizeDocumentNumber } = require("../../utils/documentValidation");

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function formatCurrency(value) {
  const numeric = Number(value ?? 0);

  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "[data não informada]";

  const date = typeof value === "string" ? new Date(value.slice(0, 10) + "T00:00:00") : value;

  if (Number.isNaN(date?.getTime?.())) return "[data não informada]";

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "[data não informada]";

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date?.getTime?.())) return "[data não informada]";

  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDocument(value) {
  const digits = normalizeDocumentNumber(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  return value || "[documento não informado]";
}

function formatAddress(address) {
  if (!address) return "[endereço não informado]";

  const parts = [address.line, address.city, address.state, address.zipCode].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "[endereço não informado]";
}

module.exports = {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDocument,
  formatAddress,
};
