const multer = require("multer");
const { PURPOSE_CONFIG, getPurposeConfig } = require("../config/uploadConfig");

const MULTER_MAX_BYTES = Math.max(
  ...Object.values(PURPOSE_CONFIG).map((config) => config.maxBytes)
);

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function uploadForPurpose(purposeField = "purpose", { forcePurpose } = {}) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MULTER_MAX_BYTES, files: 1 },
  }).single("file");

  return function handleUpload(req, res, next) {
    upload(req, res, (multerError) => {
      if (multerError) {
        if (multerError.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            message: `Arquivo excede o limite de ${Math.round(MULTER_MAX_BYTES / (1024 * 1024))} MB.`,
          });
        }

        return res.status(400).json({ message: "Não foi possível receber o arquivo." });
      }

      const purpose = String(
        forcePurpose || req.body?.[purposeField] || req.query?.purpose || ""
      ).trim();
      const config = getPurposeConfig(purpose);

      if (!config) {
        return res.status(400).json({ message: "Informe um propósito de upload válido." });
      }

      if (!config.allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          message: "Você não possui permissão para enviar este tipo de arquivo.",
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Selecione um arquivo." });
      }

      if (!config.allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          message: "Formato não aceito para este envio.",
        });
      }

      if (req.file.size > config.maxBytes) {
        const maxMb = Math.round(config.maxBytes / (1024 * 1024));
        return res.status(413).json({
          message: `Arquivo excede o limite de ${maxMb} MB.`,
        });
      }

      req.uploadPurpose = purpose;
      return next();
    });
  };
}

module.exports = {
  createServiceError,
  uploadForPurpose,
};
