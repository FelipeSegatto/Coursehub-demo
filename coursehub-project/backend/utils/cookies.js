const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const INVOICE_PAYMENT_SESSION_COOKIE = "invoice_payment_session";

const DURATION_UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Converte strings de duração no formato usado pelo jsonwebtoken
 * ("15m", "7d", "1h"...) em milissegundos, para uso em maxAge de cookie.
 */
function durationToMs(value, fallbackMs) {
  const match = /^(\d+)(s|m|h|d)$/.exec(String(value || "").trim());

  if (!match) {
    return fallbackMs;
  }

  const [, amount, unit] = match;

  return Number(amount) * DURATION_UNITS[unit];
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

function setAccessTokenCookie(res, accessToken) {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...baseCookieOptions(),
    path: "/",
    maxAge: durationToMs(process.env.ACCESS_TOKEN_EXPIRES_IN, 15 * 60 * 1000),
  });
}

function setRefreshTokenCookie(res, refreshToken) {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    path: "/api/auth",
    maxAge: durationToMs(
      process.env.REFRESH_TOKEN_EXPIRES_IN,
      7 * 24 * 60 * 60 * 1000
    ),
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseCookieOptions(), path: "/" });

  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...baseCookieOptions(),
    path: "/api/auth",
  });
}

const INVOICE_PAYMENT_SESSION_PATH = "/api/public/invoice-payment";

/**
 * Cookie curto da sessão de pagamento privado de invoice (ver
 * repositories/invoicePaymentSessions.js) -- escopado por `path` só às
 * rotas de pagamento de invoice, mesma disciplina de
 * setRefreshTokenCookie escopar a /api/auth.
 */
function setInvoicePaymentSessionCookie(res, sessionToken, { maxAgeMs } = {}) {
  res.cookie(INVOICE_PAYMENT_SESSION_COOKIE, sessionToken, {
    ...baseCookieOptions(),
    path: INVOICE_PAYMENT_SESSION_PATH,
    maxAge: maxAgeMs,
  });
}

function clearInvoicePaymentSessionCookie(res) {
  res.clearCookie(INVOICE_PAYMENT_SESSION_COOKIE, {
    ...baseCookieOptions(),
    path: INVOICE_PAYMENT_SESSION_PATH,
  });
}

module.exports = {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  INVOICE_PAYMENT_SESSION_COOKIE,
  INVOICE_PAYMENT_SESSION_PATH,
  durationToMs,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  setInvoicePaymentSessionCookie,
  clearInvoicePaymentSessionCookie,
};
