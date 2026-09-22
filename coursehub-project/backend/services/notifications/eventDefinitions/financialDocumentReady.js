const { registerNotificationType } = require("../notificationTypeRegistry");

const DOCUMENT_TYPE_LABEL = {
  financial_contract: "contrato",
  invoice_copy: "2ª via da fatura",
  payment_receipt: "recibo de pagamento",
  enrollment_declaration: "declaração de matrícula",
  attendance_declaration: "declaração de frequência",
  completion_declaration: "declaração de conclusão",
  certificate: "certificado",
};

const ACADEMIC_DOCUMENT_TYPES = new Set([
  "enrollment_declaration",
  "attendance_declaration",
  "completion_declaration",
  "certificate",
]);

/**
 * Disparado só pelo worker de geração de documentos
 * (workers/documentGenerationWorker.js), só depois que o documento
 * chega em 'ready' -- nunca antes, para nunca notificar sucesso de
 * algo que falhou. Só notifica o solicitante quando ele é um aluno
 * (accessContext scope='student'); um admin gerando pela própria tela
 * acompanha por polling, não precisa de notificação assíncrona.
 */
registerNotificationType({
  type: "financial.document.ready",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["documentType", "generatedDocumentId"],

  buildTitle: (context) => `Documento disponível: ${DOCUMENT_TYPE_LABEL[context.documentType] || "documento"}`,

  buildMessage: (context) => {
    const label = DOCUMENT_TYPE_LABEL[context.documentType] || "documento";
    const area = ACADEMIC_DOCUMENT_TYPES.has(context.documentType)
      ? "na sua área de documentos"
      : "na sua área financeira";

    return `Seu ${label} já está pronto para download ${area}.`;
  },

  actionLabel: "Baixar documento",

  buildActionPath: (context) =>
    ACADEMIC_DOCUMENT_TYPES.has(context.documentType) ? "/aluno/documentos" : "/aluno/financeiro",

  buildDeduplicationKey: (context) => `financial.document.ready:${context.generatedDocumentId}`,

  recipientPolicy: "só o aluno que solicitou a geração (accessContext scope='student')",
});
