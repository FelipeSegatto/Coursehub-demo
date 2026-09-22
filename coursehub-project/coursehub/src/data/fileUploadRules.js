/** Regras espelhadas de backend/config/uploadConfig.js. */
export const FILE_UPLOAD_RULES = {
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    extensions: ["JPG", "PNG", "WEBP"],
    accept: "image/jpeg,image/png,image/webp",
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  submission: {
    maxBytes: 5 * 1024 * 1024,
    extensions: ["PDF", "JPG", "PNG", "WEBP", "ZIP", "DOC", "DOCX"],
    accept:
      "application/pdf,image/jpeg,image/png,image/webp,application/zip,.doc,.docx",
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/zip",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  course_material: {
    maxBytes: 5 * 1024 * 1024,
    extensions: ["PDF", "JPG", "PNG", "WEBP", "ZIP", "DOCX", "PPTX"],
    accept:
      "application/pdf,image/jpeg,image/png,image/webp,application/zip,.docx,.pptx",
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/zip",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
};

const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function getUploadRule(purpose) {
  return FILE_UPLOAD_RULES[purpose] || null;
}

export function formatMaxSizeLabel(maxBytes) {
  return `${Math.round(maxBytes / (1024 * 1024))} MB`;
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function joinFormats(extensions) {
  if (!extensions?.length) return "";
  if (extensions.length === 1) return extensions[0];

  return `${extensions.slice(0, -1).join(", ")} ou ${extensions[extensions.length - 1]}`;
}

function mimeFromFileName(fileName) {
  const ext = String(fileName || "").split(".").pop()?.toLowerCase();
  return EXT_TO_MIME[ext] || "";
}

export function validateSelectedFile(file, purpose) {
  const rule = getUploadRule(purpose);

  if (!file || !rule) return "";

  if (file.size > rule.maxBytes) {
    const limit = formatMaxSizeLabel(rule.maxBytes);
    return `Arquivo acima de ${limit}. Envie um arquivo de até ${limit}.`;
  }

  const mime = file.type || mimeFromFileName(file.name);

  if (!mime || !rule.mimeTypes.includes(mime)) {
    return `Formato não aceito. Use ${joinFormats(rule.extensions)}.`;
  }

  return "";
}
