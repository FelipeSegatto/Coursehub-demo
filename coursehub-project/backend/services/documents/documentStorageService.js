/**
 * Storage privado em disco local para os PDFs gerados. Nenhum arquivo
 * fica sob um caminho servido por express.static -- todo acesso passa
 * por um endpoint autenticado que lê via readDocument() e faz stream
 * com os headers corretos (ver routes/helpers/documentAccessRoutes.js).
 *
 * Não existe hoje nenhum serviço de storage no projeto (sem multer,
 * sem S3) -- ver inventário na Fase 0 do plano. Esta é a única
 * abstração usada pelo restante da infraestrutura de documentos
 * (generatedDocumentService.js), então trocar por um storage externo
 * (S3-compatível) no futuro significa reescrever só este arquivo,
 * mantendo a mesma assinatura de saveDocument/readDocument/deleteDocument.
 */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { STORAGE_ROOT } = require("../../config/documentGenerationConfig");

/** storage_key relativo, ex: "financial_contract/2026/08/1234.pdf". */
function buildStorageKey({ documentType, generatedDocumentId, date = new Date() }) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return path.posix.join(documentType, year, month, `${generatedDocumentId}.pdf`);
}

function resolveAbsolutePath(storageKey) {
  const normalized = path.normalize(storageKey);

  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error(`storage_key inválido: ${storageKey}`);
  }

  return path.join(STORAGE_ROOT, normalized);
}

async function saveDocument(buffer, { documentType, generatedDocumentId }) {
  const storageKey = buildStorageKey({ documentType, generatedDocumentId });
  const absolutePath = resolveAbsolutePath(storageKey);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

  return { storageKey, fileHash, fileSizeBytes: buffer.length };
}

async function readDocument(storageKey) {
  const absolutePath = resolveAbsolutePath(storageKey);

  return fs.readFile(absolutePath);
}

async function deleteDocument(storageKey) {
  const absolutePath = resolveAbsolutePath(storageKey);

  await fs.rm(absolutePath, { force: true });
}

module.exports = {
  saveDocument,
  readDocument,
  deleteDocument,
};
