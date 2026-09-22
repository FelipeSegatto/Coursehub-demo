const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * ============================================================
 * DESISTÊNCIA DE CONTRATO REGISTRADA
 * ============================================================
 *
 * Disparado quando um administrador registra a desistência de um
 * aluno (registerContractWithdrawal -- contrato ATIVO/EM ATRASO,
 * matrícula já existente, ambos encerrados na mesma transação).
 *
 * Distinto de financial.contract.cancelled (contractCancellationService.js):
 * aquele cobre um contrato ainda pending_payment, antes da matrícula
 * existir -- este é especificamente sobre um aluno que já estava
 * estudando e desistiu, por isso a mensagem também menciona o
 * encerramento da matrícula/acesso, não só do contrato comercial.
 *
 * O aluno recebe:
 * 1. notificação dentro do CourseHub;
 * 2. e-mail;
 * 3. link para sua área financeira.
 *
 * ESSENTIAL pelo mesmo motivo do cancelamento genérico: perder acesso
 * ao curso é uma comunicação importante que não deve depender de
 * preferências de e-mail opcionais.
 */
registerNotificationType({
  type: "financial.contract.withdrawn",

  category: "financial",

  priority: "high",

  emailPolicy: "essential",

  requiredContext: ["contractId", "courseId", "courseName"],

  buildTitle: () => "Desistência registrada",

  buildMessage: (context) => {
    const lines = [
      `Sua desistência do curso "${context.courseName}" foi registrada. O contrato foi encerrado e sua matrícula foi desativada.`,
    ];

    if (context.reason) {
      lines.push(`Motivo informado: ${context.reason}`);
    }

    lines.push(
      "",
      "Pagamentos já realizados e seu histórico acadêmico continuam preservados e disponíveis na sua área financeira."
    );

    return lines.join("\n");
  },

  buildActionPath: () => "/aluno/financeiro",

  // Um mesmo contrato só pode receber UMA desistência (o próprio
  // registerContractWithdrawal bloqueia uma segunda chamada com 409
  // antes mesmo de chegar aqui), mas a chave de deduplicação evita
  // duas notificações mesmo numa hipotética re-entrega do evento.
  buildDeduplicationKey: (context) => `financial.contract.withdrawn:${context.contractId}`,

  recipientPolicy: "student owner of the financial contract",
});
