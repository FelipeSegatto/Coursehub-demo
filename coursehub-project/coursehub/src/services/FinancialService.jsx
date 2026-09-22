import { apiFetch } from "./APIService";

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const shouldIgnore =
      value === undefined ||
      value === null ||
      value === "";

    if (!shouldIgnore) {
      query.append(key, String(value));
    }
  });

  return query.toString();
}

export async function getFinancialDashboardSummary() {
  return apiFetch(
    "/api/admin/financial/dashboard/summary"
  );
}

export async function listFinancialContracts(params = {}) {
  const queryString = buildQueryString(params);

  const endpoint = queryString
    ? `/api/admin/financial/contracts?${queryString}`
    : "/api/admin/financial/contracts";

  return apiFetch(endpoint);
}

export async function getFinancialContractDetails(contractId) {
  if (!contractId) {
    throw new Error(
      "O identificador do contrato financeiro é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/contracts/${contractId}`
  );
}

export async function createFinancialContract(payload) {
  return apiFetch("/api/admin/financial/contracts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelFinancialContract(contractId, payload) {
  if (!contractId) {
    throw new Error("O identificador do contrato financeiro é obrigatório.");
  }

  return apiFetch(`/api/admin/financial/contracts/${contractId}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function getContractWithdrawalImpact(contractId) {
  if (!contractId) {
    throw new Error("O identificador do contrato financeiro é obrigatório.");
  }

  return apiFetch(`/api/admin/financial/contracts/${contractId}/withdrawal-impact`);
}

export async function registerContractWithdrawal(contractId, payload) {
  if (!contractId) {
    throw new Error("O identificador do contrato financeiro é obrigatório.");
  }

  return apiFetch(`/api/admin/financial/contracts/${contractId}/withdrawal`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function sendContractInvoice(contractId) {
  if (!contractId) {
    throw new Error("O identificador do contrato financeiro é obrigatório.");
  }

  return apiFetch(`/api/admin/financial/contracts/${contractId}/send-invoice`, {
    method: "POST",
  });
}

export async function getFinancialContractEvents(contractId) {
  if (!contractId) {
    throw new Error(
      "O identificador do contrato financeiro é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/contracts/${contractId}/events`
  );
}

export async function listFinancialInvoices(params = {}) {
  const queryString = buildQueryString(params);

  const endpoint = queryString
    ? `/api/admin/financial/invoices?${queryString}`
    : "/api/admin/financial/invoices";

  return apiFetch(endpoint);
}

export async function getFinancialInvoiceDetails(invoiceId) {
  if (!invoiceId) {
    throw new Error(
      "O identificador da fatura é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/invoices/${invoiceId}`
  );
}

export async function changeInvoiceDueDate(
  invoiceId,
  payload
) {
  if (!invoiceId) {
    throw new Error(
      "O identificador da fatura é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/invoices/${invoiceId}/due-date`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function changeInvoiceAmount(
  invoiceId,
  payload
) {
  if (!invoiceId) {
    throw new Error(
      "O identificador da fatura é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/invoices/${invoiceId}/amount`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function registerManualPayment(
  invoiceId,
  payload
) {
  if (!invoiceId) {
    throw new Error(
      "O identificador da fatura é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/invoices/${invoiceId}/manual-payment`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function cancelInvoice(
  invoiceId,
  payload
) {
  if (!invoiceId) {
    throw new Error(
      "O identificador da fatura é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/invoices/${invoiceId}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function refundPayment(
  paymentId,
  payload
) {
  if (!paymentId) {
    throw new Error(
      "O identificador do pagamento é obrigatório."
    );
  }

  return apiFetch(
    `/api/admin/financial/payments/${paymentId}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

/**
 * Cria (ou reaproveita uma já existente e pendente) uma tentativa de
 * pagamento PIX para uma fatura que pertence ao aluno autenticado.
 * Só paymentMethod é enviado -- invoiceId vem da URL, o valor é lido
 * do banco de dados pelo backend, nunca a partir desta chamada.
 */
export async function createInvoicePayment(invoiceId, paymentMethod) {
  if (!invoiceId) {
    throw new Error("O identificador da fatura é obrigatório.");
  }

  return apiFetch(
    `/api/student/finance/invoices/${invoiceId}/payments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentMethod }),
    }
  );
}

export async function simulateInvoicePaymentApproval(paymentId) {
  if (!paymentId) {
    throw new Error("O identificador do pagamento é obrigatório.");
  }

  return apiFetch(`/api/student/finance/payments/${paymentId}/simulate-approval`, {
    method: "POST",
  });
}

export async function getInvoicePayment(paymentId) {
  if (!paymentId) {
    throw new Error("O identificador do pagamento é obrigatório.");
  }

  return apiFetch(`/api/student/finance/payments/${paymentId}`);
}

/**
 * deliveryMethod: "copy_link" | "email" | "whatsapp_message". Cada
 * chamada invalida qualquer link anterior da mesma fatura. "email"
 * só confirma o agendamento; "copy_link"/"whatsapp_message" trazem o
 * link/mensagem em claro nesta resposta, UMA ÚNICA VEZ -- o chamador
 * nunca deve persistir esse valor (nem em state global, nem em
 * localStorage/sessionStorage), só copiar para a área de
 * transferência e descartar.
 */
export async function generateInvoicePaymentLink(invoiceId, { deliveryMethod }) {
  if (!invoiceId) {
    throw new Error("O identificador da fatura é obrigatório.");
  }

  return apiFetch(`/api/admin/financial/invoices/${invoiceId}/payment-link`, {
    method: "POST",
    body: JSON.stringify({ deliveryMethod }),
  });
}