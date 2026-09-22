

const {
  registerNotificationType,
} = require(
  "../notificationTypeRegistry"
);


/**
 * ============================================================
 * CONTRATO DE CURSO CANCELADO
 * ============================================================
 *
 * Disparado quando um administrador cancela
 * um financial_contract.
 *
 *
 * O aluno recebe:
 *
 * 1. notificação dentro do CourseHub;
 * 2. e-mail;
 * 3. link para sua área financeira.
 *
 *
 * O evento é ESSENTIAL porque cancelamento
 * contratual é uma comunicação importante
 * sobre a relação do aluno com o curso.
 */
registerNotificationType({
  /**
   * Identificador único do evento.
   */
  type:
    "financial.contract.cancelled",


  /**
   * Aparece dentro da categoria financeira
   * das preferências/notificações.
   */
  category:
    "financial",


  /**
   * Cancelamento contratual merece
   * destaque maior.
   */
  priority:
    "high",


  /**
   * ==========================================================
   * ESSENTIAL
   * ==========================================================
   *
   * Mesmo que o aluno tenha desligado
   * e-mails financeiros opcionais,
   * esta comunicação deve ser enviada.
   */
  emailPolicy:
    "essential",


  /**
   * Contexto mínimo necessário
   * para construir a notificação.
   */
  requiredContext: [
    "contractId",
    "courseId",
    "courseName",
  ],


  /**
   * ==========================================================
   * TÍTULO
   * ==========================================================
   */
  buildTitle: () =>
    "Contrato do curso cancelado",


  /**
   * ==========================================================
   * MENSAGEM
   * ==========================================================
   */
  buildMessage: (
    context
  ) => {

    const lines = [
      `O contrato referente ao curso "${context.courseName}" foi cancelado.`,
    ];


    /**
     * Se o administrador informou motivo,
     * mostramos ao aluno.
     */
    if (
      context.reason
    ) {

      lines.push(
        `Motivo: ${context.reason}`
      );
    }


    lines.push(
      "",
      "Você pode consultar os detalhes na sua área financeira."
    );


    return lines.join(
      "\n"
    );
  },


  /**
   * ==========================================================
   * LINK
   * ==========================================================
   *
   * Ao clicar na notificação/e-mail,
   * o aluno é levado para o Financeiro.
   */
  buildActionPath: () =>
    "/aluno/financeiro",


  /**
   * ==========================================================
   * IDEMPOTÊNCIA
   * ==========================================================
   *
   * Um mesmo contrato não deve gerar
   * duas notificações de cancelamento.
   */
  buildDeduplicationKey: (
    context
  ) =>
    `financial.contract.cancelled:${context.contractId}`,


  /**
   * Documenta quem deve receber.
   */
  recipientPolicy:
    "student owner of the financial contract",
});