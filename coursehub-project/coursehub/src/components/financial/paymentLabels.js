export const PAYMENT_METHOD_LABELS = {
  pix: "Pix",
  boleto: "Boleto",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  bank_transfer: "Transferência bancária",
  cash: "Dinheiro",
  other: "Outro",
};

export const PAYMENT_STATUS_LABELS = {
  created: "Criado",
  pending: "Pendente",
  processing: "Processando",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  expired: "Tentativa expirada",
  refunded: "Reembolsado",
  chargeback: "Chargeback",
};

export function getPaymentMethodLabel(value) {
  return PAYMENT_METHOD_LABELS[value] ?? value ?? "—";
}

export function getPaymentStatusLabel(value) {
  return PAYMENT_STATUS_LABELS[value] ?? value ?? "—";
}
