const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Enviado ao iniciar uma sessão de checkout público
 * (publicCheckoutSessionService.js#startPublicCheckoutSession), antes
 * de qualquer usuário/contrato/invoice existir -- prova que quem
 * iniciou o checkout controla o e-mail informado, para impedir
 * criação massiva de contratos falsos por requisições anônimas.
 * Semanticamente distinto de account.activation.invitation_created:
 * aqui não existe conta CourseHub nenhuma ainda, o destinatário é
 * sempre externo.
 */
registerNotificationType({
  type: "checkout.email_verification_requested",
  category: "financial",
  priority: "normal",
  emailPolicy: "essential",
  requiredContext: ["courseName", "verificationPath"],

  buildTitle: () => "Confirme seu e-mail para continuar a contratação",

  buildMessage: (context) =>
    [
      `Recebemos o início de uma contratação do curso "${context.courseName}" com este e-mail.`,
      "Confirme seu e-mail pelo link abaixo para continuar.",
      "",
      "Se você não reconhece esta ação, ignore esta mensagem -- nenhum cadastro ou cobrança é criado sem essa confirmação.",
    ].join("\n"),

  actionLabel: "Confirmar e-mail",

  buildActionPath: (context) => context.verificationPath,

  // Uma chave nova por sessão -- reenviar a verificação (nova sessão)
  // nunca é engolido pela deduplicação de uma tentativa anterior.
  buildDeduplicationKey: (context) => `checkout.email_verification_requested:${context.sessionToken}`,

  // O link de verificação embute um token de uso único -- ver
  // notificationTypeRegistry.js#sensitiveActionPath. O destinatário
  // aqui é sempre externo (nenhuma conta existe antes da verificação).
  sensitiveActionPath: true,

  recipientPolicy: "o e-mail informado ao iniciar a sessão de checkout público -- sempre externo",
});
