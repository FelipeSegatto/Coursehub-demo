/**
 * Espelho do frontend de backend/config/legalVersions.js -- mesmos
 * valores, arquivo separado por não haver pacote compartilhado entre
 * backend e frontend neste projeto. O backend sempre revalida que a
 * versão enviada bate com a atual antes de gravar um aceite; um
 * frontend em cache desatualizado nunca consegue registrar uma versão
 * antiga como se fosse a atual.
 */
export const CURRENT_TERMS_VERSION = "1.0.0";
export const CURRENT_PRIVACY_VERSION = "1.0.0";
