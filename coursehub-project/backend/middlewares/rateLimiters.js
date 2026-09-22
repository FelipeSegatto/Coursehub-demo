const {
  rateLimit,
  ipKeyGenerator,
} = require("express-rate-limit");


/**
 * ============================================================
 * LOGIN
 * ============================================================
 *
 * Limita tentativas de login:
 *
 * 10 tentativas
 * a cada 15 minutos
 * por IP.
 *
 * Este limiter foi mantido igual ao projeto original.
 *
 * Depois podemos melhorar o login também usando uma
 * proteção combinada por conta + IP.
 */
const loginRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      message:
        "Muitas tentativas de login. Tente novamente em alguns minutos.",
    },
  });


/**
 * ============================================================
 * RECUPERAÇÃO DE SENHA - LIMITE GLOBAL POR IP
 * ============================================================
 *
 * Esta é a primeira camada de segurança.
 *
 * NOVA REGRA:
 *
 * 30 solicitações / 15 minutos / IP.
 *
 * É uma barreira global contra abuso da rede,
 * mas não é mais o limite principal por conta.
 */
const forgotPasswordIpRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      ipKeyGenerator(
        req.ip
      ),

    message: {
      message:
        "Muitas solicitações de recuperação foram realizadas desta rede. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * RECUPERAÇÃO DE SENHA - LIMITE POR CONTA/E-MAIL
 * ============================================================
 *
 * Cada e-mail possui seu próprio contador.
 *
 * 5 solicitações / 15 minutos / e-mail.
 */
const forgotPasswordAccountRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) => {

      const email =
        String(
          req.body?.email ||
            ""
        )
          .trim()
          .toLowerCase();


      if (!email) {

        return (
          "forgot-password-email-fallback:" +
          ipKeyGenerator(
            req.ip
          )
        );
      }


      return (
        "forgot-password-email:" +
        email
      );
    },

    message: {
      message:
        "Muitas solicitações de recuperação foram feitas para esta conta. Aguarde alguns minutos antes de solicitar outro link.",
    },
  });


/**
 * ============================================================
 * CHAT - ENVIO DE MENSAGEM
 * ============================================================
 */
const chatMessageRateLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    max:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitas mensagens em pouco tempo. Aguarde um instante antes de enviar outra.",
    },
  });


/**
 * ============================================================
 * CHAT - ABERTURA DE CONVERSAS
 * ============================================================
 */
const chatConversationOpenRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitas conversas abertas em pouco tempo. Aguarde um instante antes de abrir outra.",
    },
  });


/**
 * ============================================================
 * CHAT - REPORTS
 * ============================================================
 */
const chatReportRateLimiter =
  rateLimit({
    windowMs:
      60 * 60 * 1000,

    max:
      20,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitos reports em pouco tempo. Aguarde um instante antes de reportar outra mensagem.",
    },
  });


/**
 * ============================================================
 * PAGAMENTOS
 * ============================================================
 */
const paymentCreateRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitas tentativas de pagamento em pouco tempo. Aguarde um instante antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * ATIVAÇÃO DE CONTA
 * ============================================================
 */
const accountActivationRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      8,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      message:
        "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * REENVIO DE CONVITE DE ATIVAÇÃO
 * ============================================================
 */
const accountActivationInvitationRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitos convites gerados em pouco tempo. Aguarde um instante antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * LINK PRIVADO DE INVOICE
 * ============================================================
 */
const invoicePaymentLinkAccessRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      20,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      message:
        "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * GERAÇÃO ADMINISTRATIVA DE LINK DE PAGAMENTO
 * ============================================================
 */
const invoicePaymentLinkAdminRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitos links gerados em pouco tempo. Aguarde um instante antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * PAGAMENTO DE INVOICE POR LINK PRIVADO
 * ============================================================
 */
const publicInvoicePaymentCreateRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.invoicePaymentSession
        ?.sessionId
        ? `session:${req.invoicePaymentSession.sessionId}`
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitas tentativas de pagamento em pouco tempo. Aguarde um instante antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * CRIAÇÃO DE CHECKOUT PÚBLICO
 * ============================================================
 */
const publicCheckoutSessionRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      message:
        "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * VERIFICAÇÃO DE E-MAIL DO CHECKOUT
 * ============================================================
 */
const checkoutEmailVerificationRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      8,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      message:
        "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * SUBMISSÃO FINAL DO CHECKOUT PÚBLICO
 * ============================================================
 */
const checkoutContractSubmitRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      message:
        "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * GERAÇÃO DE DOCUMENTOS
 * ============================================================
 */
const documentGenerationRequestRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      15,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitas solicitações de documento em pouco tempo. Aguarde um instante antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * DOWNLOAD DE DOCUMENTOS
 * ============================================================
 */
const documentDownloadRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? String(
            req.auth.userId
          )
        : ipKeyGenerator(
            req.ip
          ),

    message: {
      message:
        "Muitos downloads em pouco tempo. Aguarde um instante antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * RECUPERAÇÃO DE LINK DE FATURA - LIMITE GLOBAL POR IP
 * ============================================================
 *
 * Usado pela rota pública:
 *
 * POST /api/public/invoice-payment/request-link
 *
 * 30 solicitações / 15 minutos / IP.
 */
const invoicePaymentLinkRecoveryByIpRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      `invoice-link-recovery-ip:${ipKeyGenerator(
        req.ip
      )}`,

    message: {
      message:
        "Muitas solicitações de recuperação de link foram realizadas desta rede. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * RECUPERAÇÃO DE LINK DE FATURA - LIMITE POR E-MAIL
 * ============================================================
 *
 * Cada e-mail possui seu próprio contador.
 *
 * 5 solicitações / 15 minutos / e-mail.
 */
const invoicePaymentLinkRecoveryByEmailRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) => {

      const email =
        String(
          req.body?.email || ""
        )
          .trim()
          .toLowerCase();


      if (!email) {

        return (
          "invoice-link-recovery-email-fallback:" +
          ipKeyGenerator(
            req.ip
          )
        );
      }


      return (
        "invoice-link-recovery-email:" +
        email
      );
    },

    message: {
      message:
        "Muitas solicitações de recuperação foram feitas para este e-mail. Aguarde alguns minutos antes de solicitar outro link.",
    },
  });


/**
 * ============================================================
 * FORMULÁRIO PÚBLICO DE CONTATO - LIMITE GLOBAL POR IP
 * ============================================================
 *
 * Usado pela rota pública:
 *
 * POST /api/public/contact
 *
 * 10 solicitações / 15 minutos / IP.
 */
const contactRequestByIpRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      `contact-request-ip:${ipKeyGenerator(
        req.ip
      )}`,

    message: {
      message:
        "Muitas mensagens foram enviadas desta rede. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * FORMULÁRIO PÚBLICO DE CONTATO - LIMITE POR E-MAIL
 * ============================================================
 *
 * Cada e-mail possui seu próprio contador.
 *
 * 5 solicitações / 15 minutos / e-mail.
 */
const contactRequestByEmailRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) => {

      const email =
        String(
          req.body?.email || ""
        )
          .trim()
          .toLowerCase();


      if (!email) {

        return (
          "contact-request-email-fallback:" +
          ipKeyGenerator(
            req.ip
          )
        );
      }


      return (
        "contact-request-email:" +
        email
      );
    },

    message: {
      message:
        "Muitas mensagens foram enviadas para este e-mail. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * EXPORTAÇÃO DE RELATÓRIOS
 * ============================================================
 *
 * Usado por:
 *
 * - relatórios administrativos;
 * - PDF de progresso do professor;
 * - PDF de progresso do aluno visto pelo admin.
 *
 * 20 exportações / 10 minutos / usuário.
 */
const reportExportRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      20,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      req.auth?.userId
        ? `report-export-user:${req.auth.userId}`
        : `report-export-ip:${ipKeyGenerator(
            req.ip
          )}`,

    message: {
      message:
        "Muitas exportações de relatório em pouco tempo. Aguarde alguns minutos antes de gerar outro arquivo.",
    },
  });


/**
 * ============================================================
 * VERIFICAÇÃO PÚBLICA DE DOCUMENTOS
 * ============================================================
 *
 * Usado por:
 *
 * GET /api/public/documents/verify/:code
 *
 * Como a rota é pública e não existe usuário autenticado,
 * usamos o IP como chave.
 *
 * 30 verificações / 10 minutos / IP.
 */
const documentVerificationRateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    keyGenerator: (req) =>
      `document-verification-ip:${ipKeyGenerator(
        req.ip
      )}`,

    message: {
      message:
        "Muitas verificações de documentos foram realizadas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.",
    },
  });


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */
module.exports = {

  loginRateLimiter,

  forgotPasswordIpRateLimiter,
  forgotPasswordAccountRateLimiter,

  chatMessageRateLimiter,
  chatConversationOpenRateLimiter,
  chatReportRateLimiter,

  paymentCreateRateLimiter,

  accountActivationRateLimiter,
  accountActivationInvitationRateLimiter,

  invoicePaymentLinkAccessRateLimiter,
  invoicePaymentLinkAdminRateLimiter,

  publicInvoicePaymentCreateRateLimiter,

  publicCheckoutSessionRateLimiter,
  checkoutEmailVerificationRateLimiter,
  checkoutContractSubmitRateLimiter,

  documentGenerationRequestRateLimiter,
  documentDownloadRateLimiter,

  invoicePaymentLinkRecoveryByIpRateLimiter,
  invoicePaymentLinkRecoveryByEmailRateLimiter,

  reportExportRateLimiter,
  documentVerificationRateLimiter,

  contactRequestByIpRateLimiter,
  contactRequestByEmailRateLimiter,
};