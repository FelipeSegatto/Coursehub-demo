/**
 * Dados institucionais públicos (página "Fale conosco").
 *
 * A fonte é institutionConfig.js. Campos opcionais só entram na
 * resposta quando a env correspondente está preenchida — nunca um
 * placeholder visível ao visitante.
 */

const { getPublicInstitutionInfo } = require("./institutionConfig");

module.exports = { getPublicInstitutionInfo };
