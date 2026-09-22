const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * All dynamic content in these templates comes from
 * notificationTypeRegistry builders, which in later stages will
 * interpolate real entity titles/feedback/free text -- never trust
 * it as safe HTML, always escape before interpolating into markup.
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function frontendOrigin() {
  return String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

/**
 * `actionPath` is usually an internal path ("/aluno/notas"). Some
 * flows already hand a full URL (invoice payment links). Never prefix
 * FRONTEND_URL onto an absolute URL -- that used to produce
 * `http://localhost:5173http://localhost:5173/...`.
 */
function resolveActionUrl(actionPath) {
  const pathOrUrl = String(actionPath || "").trim();

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const origin = frontendOrigin();

  if (!pathOrUrl) {
    return origin;
  }

  return `${origin}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

/**
 * Shared HTML shell for every transactional email CourseHub sends.
 * `bodyHtml` must already be escaped/composed safely by the caller --
 * this function does not escape it again (it wraps pre-built markup,
 * not raw text).
 *
 * Visual tokens match the official PDF letterhead (navy + CourseHub
 * orange), so password reset, checkout, activation and in-app
 * notifications read as the same family.
 */
function renderBaseLayout({ preheader = "", bodyHtml }) {
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CourseHub</title>
      </head>
      <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif; color:#111827;">
        <span style="display:none; font-size:1px; color:#f3f4f6;">${escapeHtml(preheader)}</span>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" style="max-width:520px; background:#ffffff; border-radius:12px; overflow:hidden;">
                <tr>
                  <td style="background:#0a2a57; padding:20px 24px;">
                    <span style="color:#ffffff; font-size:18px; font-weight:bold; letter-spacing:-0.02em;">Course</span><span style="color:#f46c3c; font-size:18px; font-weight:bold; letter-spacing:-0.02em;">Hub</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    ${bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px; background:#f9fafb; font-size:12px; color:#6b7280;">
                    Este é um e-mail automático do CourseHub. Não é necessário responder.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function renderTransactionalBody({
  title,
  message,
  actionUrl,
  actionLabel = "Acessar no CourseHub",
  notice = "Canal institucional do CourseHub — esta comunicação pode ser acessada pela gestão autorizada para atendimento, segurança e auditoria.",
}) {
  return `
    <h1 style="font-size:18px; margin:0 0 12px; color:#0a2a57;">${escapeHtml(title)}</h1>
    <p style="font-size:14px; line-height:1.5; margin:0 0 20px; white-space:pre-line;">${escapeHtml(
      message
    )}</p>
    <p style="margin:0 0 20px;">
      <a
        href="${escapeHtml(actionUrl)}"
        style="display:inline-block; background:#0a2a57; color:#ffffff; text-decoration:none; padding:10px 18px; border-radius:8px; font-size:14px; font-weight:bold;"
      >
        ${escapeHtml(actionLabel)}
      </a>
    </p>
    ${
      notice
        ? `<p style="font-size:12px; color:#6b7280; margin:0;">${escapeHtml(notice)}</p>`
        : ""
    }
  `;
}

module.exports = {
  escapeHtml,
  frontendOrigin,
  resolveActionUrl,
  renderBaseLayout,
  renderTransactionalBody,
};
