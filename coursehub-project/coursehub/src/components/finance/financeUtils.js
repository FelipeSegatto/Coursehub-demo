export function formatCurrency(value) {
  const numericValue = Number(value || 0);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numericValue);
}

export function formatDate(date) {
  if (!date) {
    return "Data não informada";
  }

  const normalizedDate =
    typeof date === "string" && date.length === 10
      ? `${date}T00:00:00`
      : date;

  const parsedDate = new Date(normalizedDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR").format(parsedDate);
}

export function getInvoiceStatusLabel(status) {
  const labels = {
    pending: "Pendente",
    processing: "Em processamento",
    paid: "Pago",
    overdue: "Em atraso",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  };

  return labels[status] || "Não informado";
}

export function getPaymentStatusLabel(status) {
  const labels = {
    created: "Criado",
    pending: "Pendente",
    approved: "Aprovado",
    rejected: "Recusado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    chargeback: "Pagamento contestado",
    expired: "Tentativa expirada",
  };

  return labels[status] || "Não informado";
}


export function getContractStatusLabel(status) {
  const labels = {
    active: "Ativo",
    pending: "Pendente",
    completed: "Concluído",
    cancelled: "Cancelado",
    suspended: "Suspenso",
    overdue: "Em atraso",
  };

  return labels[status] || "Não informado";
}

export function getPaymentMethodLabel(method) {
  const labels = {
    pix: "Pix",
    credit_card: "Cartão de Crédito",
    debit_card: "Cartão de débito",
    boleto: "Boleto",
    bank_transfer: "Transferência bancária",
  };

  return labels[method] || method || "Não informado";
}

export function getFeaturedInvoice(invoices = []) {
  const validInvoices = Array.isArray(invoices) ? invoices : [];

  const overdueInvoice = validInvoices
    .filter((invoice) => invoice.status === "overdue")
    .sort(
      (invoiceA, invoiceB) =>
        new Date(invoiceA.dueDate || invoiceA.due_date) -
        new Date(invoiceB.dueDate || invoiceB.due_date)
    )[0];

  if (overdueInvoice) {
    return overdueInvoice;
  }

  return (
    validInvoices
      .filter((invoice) =>
        ["pending", "processing"].includes(invoice.status)
      )
      .sort(
        (invoiceA, invoiceB) =>
          new Date(invoiceA.dueDate || invoiceA.due_date) -
          new Date(invoiceB.dueDate || invoiceB.due_date)
      )[0] || null
  );
}

export function buildCourseFinanceSummary({
  contract,
  invoices = [],
  payments = [],
}) {
  const totalContracted = Number(
    contract?.totalAmount ||
      contract?.total_amount ||
      contract?.contractValue ||
      contract?.contract_value ||
      0
  );

  const totalPaid = payments.reduce((total, payment) => {
    const isPaid = ["approved", "paid"].includes(payment.status);

    if (!isPaid) {
      return total;
    }

    return total + Number(payment.amount || 0);
  }, 0);

  const totalPending = invoices.reduce((total, invoice) => {
    if (!["pending", "processing"].includes(invoice.status)) {
      return total;
    }

    return total + Number(invoice.amount || 0);
  }, 0);

  const totalOverdue = invoices.reduce((total, invoice) => {
    if (invoice.status !== "overdue") {
      return total;
    }

    return total + Number(invoice.amount || 0);
  }, 0);

  return {
    totalContracted,
    totalPaid,
    totalPending,
    totalOverdue,
  };
}