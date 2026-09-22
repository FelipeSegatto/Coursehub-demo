/**
 * Configuração central da infraestrutura compartilhada de geração de
 * documentos formais em PDF (contratos, 2ª via de fatura, recibos
 * nesta fase; declarações/certificados/relatórios em fases futuras).
 * Só constantes derivadas de env com fallback seguro, mesmo idioma de
 * checkoutConfig.js.
 */
const path = require("path");

function positiveIntFromEnv(envVarName, fallback) {
  const configured = Number(process.env[envVarName]);

  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function boolFromEnv(envVarName, fallback) {
  const configured = process.env[envVarName];

  if (configured === undefined) return fallback;

  return configured !== "false";
}

/** Raiz de armazenamento local dos PDFs gerados. Nunca servida por express.static. */
const STORAGE_ROOT = path.join(__dirname, "..", "storage", "generated-documents");

/** Limite de tamanho do HTML de entrada, em bytes, antes de renderizar. */
const MAX_HTML_BYTES = positiveIntFromEnv("DOCUMENT_MAX_HTML_BYTES", 2 * 1024 * 1024); // 2 MB

/** Limite de tamanho do PDF resultante, em bytes. */
const MAX_PDF_BYTES = positiveIntFromEnv("DOCUMENT_MAX_PDF_BYTES", 15 * 1024 * 1024); // 15 MB

/** Timeout de renderização (navegação + geração do PDF), em milissegundos. */
const RENDER_TIMEOUT_MS = positiveIntFromEnv("DOCUMENT_RENDER_TIMEOUT_MS", 20000);

/** Tuning do worker de geração de documentos -- mesmo padrão do worker de notificações. */
const WORKER_BATCH_SIZE = positiveIntFromEnv("DOCUMENT_WORKER_BATCH_SIZE", 5);
const WORKER_POLL_INTERVAL_MS = positiveIntFromEnv("DOCUMENT_WORKER_POLL_INTERVAL_MS", 5000);
const WORKER_LEASE_MINUTES = positiveIntFromEnv("DOCUMENT_WORKER_LEASE_MINUTES", 5);
const WORKER_MAX_ATTEMPTS = positiveIntFromEnv("DOCUMENT_WORKER_MAX_ATTEMPTS", 3);
const WORKER_ENABLED = boolFromEnv("DOCUMENT_WORKER_ENABLED", true);

module.exports = {
  STORAGE_ROOT,
  MAX_HTML_BYTES,
  MAX_PDF_BYTES,
  RENDER_TIMEOUT_MS,
  WORKER_BATCH_SIZE,
  WORKER_POLL_INTERVAL_MS,
  WORKER_LEASE_MINUTES,
  WORKER_MAX_ATTEMPTS,
  WORKER_ENABLED,
};
