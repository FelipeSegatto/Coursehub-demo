/**
 * Limites e MIME permitidos do upload genérico (avatar, envio de
 * atividade, material de curso). Arquivos nunca vão para express.static:
 * o worker/rota autenticada é quem lê o disco.
 */
const path = require("path");

const UPLOAD_ROOT = path.join(__dirname, "..", "storage", "uploads");

const PURPOSES = ["avatar", "submission", "course_material"];

const PURPOSE_CONFIG = {
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    allowedRoles: ["student", "teacher", "admin"],
  },
  submission: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/zip",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
    allowedRoles: ["student"],
  },
  course_material: {
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/zip",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    allowedRoles: ["teacher", "admin"],
  },
};

function getPurposeConfig(purpose) {
  return PURPOSE_CONFIG[purpose] || null;
}

function extensionForMime(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  };

  return map[mimeType] || "bin";
}

function isInlinePreviewMime(mimeType) {
  return mimeType === "application/pdf" || String(mimeType).startsWith("image/");
}

module.exports = {
  UPLOAD_ROOT,
  PURPOSES,
  PURPOSE_CONFIG,
  getPurposeConfig,
  extensionForMime,
  isInlinePreviewMime,
};
