const express =
  require("express");

const db =
  require("../db");


const {
  loginRateLimiter,

  /**
   * Recuperação de senha agora possui
   * duas camadas de rate limit.
   */
  forgotPasswordIpRateLimiter,
  forgotPasswordAccountRateLimiter,

  accountActivationRateLimiter,
} =
  require("../middlewares/rateLimiters");


const {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
} =
  require("../utils/cookies");


const {
  login,
  revokeSession,
  refreshSession,
  requestPasswordReset,
  resetPassword,
} =
  require("../services/auth/authService");


const {
  validateActivationToken,
  activateAccount,
} =
  require("../services/auth/accountActivationService");


const {
  restoreDemoSnapshot,
} = require("../services/demo/demoResetService");


const router =
  express.Router();


/**
 * ============================================================
 * LOGIN
 * ============================================================
 *
 * POST /api/auth/login
 */
router.post(
  "/auth/login",

  loginRateLimiter,

  async (
    req,
    res
  ) => {

    try {

      const {
        accessToken,
        refreshToken,
        profile,
      } =
        await login(
          db,
          req.body
        );


      setAccessTokenCookie(
        res,
        accessToken
      );


      setRefreshTokenCookie(
        res,
        refreshToken
      );


      return res
        .status(200)
        .json({
          message:
            "Login realizado com sucesso.",

          profile,
        });

    } catch (error) {

      console.error(
        "Erro ao realizar login:",
        error
      );


      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          message:
            error.statusCode
              ? error.message
              : "Erro ao realizar login.",
        });
    }
  }
);


/**
 * ============================================================
 * LOGOUT
 * ============================================================
 *
 * POST /api/auth/logout
 *
 * Mesmo que a revogação da sessão dê erro,
 * os cookies são removidos.
 */
router.post(
  "/auth/logout",

  async (
    req,
    res
  ) => {

    let demoReset = null;

    try {

      const refreshToken =
        req.cookies?.[
          REFRESH_TOKEN_COOKIE
        ];


      if (refreshToken) {

        await revokeSession(
          refreshToken
        );
      }

    } catch (error) {

      console.error(
        "Erro ao revogar refresh token:",
        error
      );
    }


    try {
      // Na demonstração pública, sair da conta significa devolver
      // TODO o banco ao estado-base: PIX/mensalidades, notificações,
      // atividades, presença, chats e demais mudanças da jornada.
      demoReset = await restoreDemoSnapshot();
    } catch (error) {
      console.error("Erro ao restaurar snapshot da demo no logout:", error);

      clearAuthCookies(res);

      return res.status(500).json({
        message: "A sessão foi encerrada, mas não foi possível restaurar a demonstração.",
        demoReset: false,
      });
    }


    clearAuthCookies(
      res
    );


    return res
      .status(200)
      .json({
        message:
          "Logout realizado com sucesso.",
        demoReset: Boolean(demoReset?.reset),
      });
  }
);


/**
 * ============================================================
 * REFRESH
 * ============================================================
 *
 * POST /api/auth/refresh
 */
router.post(
  "/auth/refresh",

  async (
    req,
    res
  ) => {

    try {

      const currentRefreshToken =
        req.cookies?.[
          REFRESH_TOKEN_COOKIE
        ];


      const {
        accessToken,
        refreshToken,
      } =
        await refreshSession(
          db,
          {
            refreshToken:
              currentRefreshToken,
          }
        );


      setAccessTokenCookie(
        res,
        accessToken
      );


      setRefreshTokenCookie(
        res,
        refreshToken
      );


      return res
        .status(200)
        .json({
          message:
            "Sessão renovada.",
        });

    } catch (error) {

      console.error(
        "Erro ao renovar sessão:",
        error
      );


      if (
        error.clearCookies
      ) {

        clearAuthCookies(
          res
        );
      }


      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          message:
            error.statusCode
              ? error.message
              : "Erro ao renovar sessão.",
        });
    }
  }
);


/**
 * ============================================================
 * ESQUECI MINHA SENHA
 * ============================================================
 *
 * POST /api/forgot-password/check-email
 *
 *
 * PROTEÇÃO 1
 * ----------
 *
 * Limite por IP:
 *
 * 30 solicitações / 15 minutos.
 *
 *
 * PROTEÇÃO 2
 * ----------
 *
 * Limite por conta/e-mail:
 *
 * 5 solicitações / 15 minutos.
 *
 *
 * Isso resolve o problema:
 *
 * conta A faz várias solicitações
 * ↓
 * conta A pode ser limitada
 *
 *
 * conta B no mesmo computador
 * ↓
 * continua funcionando
 *
 *
 * Ao mesmo tempo, alguém não pode
 * simplesmente trocar de e-mail infinitamente,
 * porque existe o teto global por IP.
 *
 *
 * A resposta continua genérica para
 * impedir enumeração de usuários.
 */
router.post(
  "/forgot-password/check-email",

  /**
   * Primeiro:
   *
   * segurança global da rede.
   */
  forgotPasswordIpRateLimiter,

  /**
   * Depois:
   *
   * segurança específica da conta.
   */
  forgotPasswordAccountRateLimiter,

  async (
    req,
    res
  ) => {

    /**
     * Nunca informamos publicamente:
     *
     * "esse e-mail existe"
     *
     * ou:
     *
     * "esse e-mail não existe"
     *
     * Isso evita enumeration attack.
     */
    const genericResponse = {
      message:
        "Se este e-mail estiver cadastrado, enviamos um link de redefinição de senha.",
    };


    try {

      await requestPasswordReset(
        db,
        req.body
      );


      return res
        .status(200)
        .json(
          genericResponse
        );

    } catch (error) {

      /**
       * Erros de payload inválido
       * ainda podem retornar 400.
       */
      if (
        error.statusCode ===
        400
      ) {

        return res
          .status(400)
          .json({
            message:
              error.message,
          });
      }


      /**
       * Qualquer outro erro:
       *
       * - usuário inexistente;
       * - usuário inativo;
       * - erro interno controlado;
       *
       * continua retornando a mensagem
       * genérica.
       *
       * Isso evita permitir que alguém
       * descubra contas cadastradas.
       */
      console.error(
        "Erro ao processar recuperação de senha:",
        error
      );


      return res
        .status(200)
        .json(
          genericResponse
        );
    }
  }
);


/**
 * ============================================================
 * REDEFINIR SENHA USANDO TOKEN
 * ============================================================
 *
 * PATCH /api/forgot-password/reset
 *
 *
 * Aqui NÃO usamos o limiter por e-mail.
 *
 * Motivo:
 *
 * a pessoa já possui um token de recuperação.
 *
 * Esta request representa outra etapa do fluxo.
 *
 *
 * Mantemos o limite global por IP para evitar
 * força bruta contra tokens.
 */
router.patch(
  "/forgot-password/reset",

  forgotPasswordIpRateLimiter,

  async (
    req,
    res
  ) => {

    try {

      await resetPassword(
        db,
        req.body
      );


      return res
        .status(200)
        .json({
          message:
            "Senha redefinida com sucesso. Você já pode entrar novamente.",
        });

    } catch (error) {

      console.error(
        "Erro ao redefinir senha:",
        error
      );


      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          message:
            error.statusCode
              ? error.message
              : "Erro interno ao redefinir a senha.",
        });
    }
  }
);


/**
 * ============================================================
 * VALIDAR TOKEN DE ATIVAÇÃO
 * ============================================================
 *
 * GET /api/auth/account-activation/validate?token=...
 *
 * Fluxo separado de recuperação de senha.
 */
router.get(
  "/auth/account-activation/validate",

  accountActivationRateLimiter,

  async (
    req,
    res
  ) => {

    try {

      const result =
        await validateActivationToken(
          db,
          req.query.token
        );


      return res
        .status(200)
        .json(
          result
        );

    } catch (error) {

      console.error(
        "Erro ao validar token de ativação:",
        error
      );


      /**
       * Não revelamos detalhes
       * sobre o token.
       */
      return res
        .status(200)
        .json({
          valid:
            false,
        });
    }
  }
);


/**
 * ============================================================
 * ATIVAR CONTA
 * ============================================================
 *
 * POST /api/auth/account-activation
 *
 * Define a primeira senha e ativa
 * uma conta criada sem senha.
 */
router.post(
  "/auth/account-activation",

  accountActivationRateLimiter,

  async (
    req,
    res
  ) => {

    try {

      const result =
        await activateAccount(
          db,
          req.body
        );


      return res
        .status(200)
        .json(
          result
        );

    } catch (error) {

      console.error(
        "Erro ao ativar conta:",
        error
      );


      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          message:
            error.statusCode
              ? error.message
              : "Erro interno ao ativar a conta.",
        });
    }
  }
);


module.exports =
  router;