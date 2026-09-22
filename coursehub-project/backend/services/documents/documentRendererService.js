/**
 * Único ponto de contato com o Puppeteer no projeto -- nenhum outro
 * módulo deve importar "puppeteer" diretamente (a rota HTTP nunca fala
 * com esta lib; só o worker de geração de documentos chama
 * renderHtmlToPdf, ver workers/documentGenerationWorker.js).
 *
 * Escolhido puppeteer em vez de Playwright: single-purpose para
 * HTML->PDF (page.pdf()), menor superfície conceitual, par mais comum
 * para este caso de uso. Versão travada exata em package.json (sem
 * range "^").
 *
 * Segurança: setRequestInterception aborta QUALQUER requisição que não
 * seja o próprio documento inicial -- isso obriga todo template a
 * embutir fontes/SVG/CSS inline (data URI ou <svg> inline), nunca
 * <link>/<img src="http://...">. Um browser é lançado uma única vez
 * (singleton lazy) e reaproveitado entre gerações dentro do processo
 * do worker.
 */
const crypto = require("crypto");
const os = require("os");
const path = require("path");

const DEFAULT_PUPPETEER_CACHE = path.join(os.homedir(), ".cache", "puppeteer");

if (
  !process.env.PUPPETEER_CACHE_DIR ||
  /cursor-sandbox-cache/i.test(process.env.PUPPETEER_CACHE_DIR)
) {
  process.env.PUPPETEER_CACHE_DIR = DEFAULT_PUPPETEER_CACHE;
}

const puppeteer = require("puppeteer");
const {
  MAX_HTML_BYTES,
  MAX_PDF_BYTES,
  RENDER_TIMEOUT_MS,
} = require("../../config/documentGenerationConfig");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });

    browserPromise.catch(() => {
      browserPromise = null;
    });
  }

  return browserPromise;
}

/**
 * Fecha o browser singleton, se houver um aberto. Usado pelo shutdown
 * gracioso do worker (SIGINT/SIGTERM) e pelos testes.
 */
async function closeBrowser() {
  if (!browserPromise) return;

  const browser = await browserPromise.catch(() => null);
  browserPromise = null;

  if (browser) {
    await browser.close();
  }
}

/**
 * Renderiza um HTML autocontido (sem nenhuma referência externa) em
 * um PDF A4. Rejeita HTML maior que MAX_HTML_BYTES antes de abrir a
 * página; rejeita o PDF resultante se ficar maior que MAX_PDF_BYTES.
 * Todo request de rede que não seja o próprio documento é abortado --
 * na prática isso significa que qualquer <link>/<img src="http://...">
 * esquecido em um template simplesmente falha silenciosamente (o
 * recurso nunca carrega), nunca vaza dado nem sai à rede.
 */
async function renderHtmlToPdf(html, { timeoutMs = RENDER_TIMEOUT_MS } = {}) {
  const htmlBytes = Buffer.byteLength(html, "utf8");

  if (htmlBytes > MAX_HTML_BYTES) {
    throw createServiceError(
      `HTML do documento excede o limite de ${MAX_HTML_BYTES} bytes (${htmlBytes} bytes).`,
      500
    );
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setRequestInterception(true);

    page.on("request", (request) => {
      if (request.resourceType() === "document" && request.isNavigationRequest()) {
        request.continue();
        return;
      }

      request.abort();
    });

    await page.setContent(html, { waitUntil: "networkidle0", timeout: timeoutMs });

    // page.pdf() devolve Uint8Array (mudança do Puppeteer a partir da
    // v22, para paridade com o browser) -- normaliza para Buffer aqui
    // para que todo consumidor downstream (hash, storage, testes) veja
    // um tipo previsível, em vez de espalhar essa checagem depois.
    const pdfBuffer = Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
        timeout: timeoutMs,
      })
    );

    if (pdfBuffer.length > MAX_PDF_BYTES) {
      throw createServiceError(
        `PDF gerado excede o limite de ${MAX_PDF_BYTES} bytes (${pdfBuffer.length} bytes).`,
        500
      );
    }

    return pdfBuffer;
  } finally {
    await page.close().catch(() => {});
  }
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = {
  renderHtmlToPdf,
  closeBrowser,
  hashBuffer,
};
