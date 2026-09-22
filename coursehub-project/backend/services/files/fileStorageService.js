/**
 * Disco local privado para uploads do usuário (avatares customizados,
 * envios de atividade, materiais de curso). Espelha a abstração de
 * documentStorageService.js: save/read/delete por storage_key, sem
 * express.static.
 */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { UPLOAD_ROOT, extensionForMime } = require("../../config/uploadConfig");

function buildStorageKey({ purpose, fileId, mimeType, date = new Date() }) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const extension = extensionForMime(mimeType);

  return path.posix.join(purpose, year, month, `${fileId}.${extension}`);
}

function resolveAbsolutePath(storageKey) {
  const normalized = path.normalize(storageKey);

  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error(`storage_key inválido: ${storageKey}`);
  }

  return path.join(UPLOAD_ROOT, normalized);
}

async function saveUploadedBuffer(buffer, { purpose, fileId, mimeType }) {
  const storageKey = buildStorageKey({ purpose, fileId, mimeType });
  const absolutePath = resolveAbsolutePath(storageKey);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    storageKey,
    fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
    fileSizeBytes: buffer.length,
  };
}

async function readUploadedFile(storageKey) {
  return fs.readFile(resolveAbsolutePath(storageKey));
}

async function deleteUploadedFile(storageKey) {
  await fs.rm(resolveAbsolutePath(storageKey), { force: true });
}

module.exports = {
  buildStorageKey,
  saveUploadedBuffer,
  readUploadedFile,
  deleteUploadedFile,
};
