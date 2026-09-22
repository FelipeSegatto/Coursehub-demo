/**
 * Versões atuais dos Termos de Uso e da Política de Privacidade.
 * Todo checkout que registra aceite (contract_acceptances) precisa
 * enviar exatamente estas versões -- uma versão diferente (frontend
 * em cache desatualizado) é rejeitada em vez de silenciosamente
 * aceita como se fosse a atual. Ver
 * coursehub/src/constants/legalVersions.js para o espelho do lado do
 * frontend (mesmos valores, arquivos separados por não haver um
 * pacote compartilhado entre backend e frontend neste projeto).
 *
 * Suba estes números sempre que o texto publicado nas páginas
 * públicas mudar de forma material.
 */
const CURRENT_TERMS_VERSION = "1.0.0";
const CURRENT_PRIVACY_VERSION = "1.0.0";

module.exports = { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION };
