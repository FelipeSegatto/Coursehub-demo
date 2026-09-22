/**
 * Dados institucionais usados em documentos (contrato, recibo,
 * certificado) e, em recorte menor, na página pública "Fale conosco".
 *
 * Valores vêm de env. Os fallbacks são de fachada para demonstração —
 * nunca "[PREENCHER]" em PDF. A página pública só expõe CNPJ/telefone/
 * endereço quando a env correspondente está preenchida, para não
 * publicar um CNPJ de fachada numa instalação que ainda não configurou
 * a instituição real.
 */

function stringFromEnv(envVarName, fallback = "") {
  const value = process.env[envVarName];

  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function withCnpjCheckDigits(base12) {
  const numbers = String(base12)
    .replace(/\D/g, "")
    .slice(0, 12)
    .split("")
    .map(Number);

  const calc = (length) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;

    for (let i = 0; i < length; i += 1) {
      sum += numbers[i] * weights[i];
    }

    const remainder = sum % 11;

    return remainder < 2 ? 0 : 11 - remainder;
  };

  numbers.push(calc(12));
  numbers.push(calc(13));

  const digits = numbers.join("");

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

const DEFAULT_CNPJ = withCnpjCheckDigits("543219870001");

function getInstitutionProfile() {
  const tradeName = stringFromEnv("INSTITUTION_TRADE_NAME", stringFromEnv("INSTITUTION_NAME", "CourseHub"));

  return {
    legalName: stringFromEnv("INSTITUTION_LEGAL_NAME", "CourseHub Educação Ltda."),
    tradeName,
    cnpj: stringFromEnv("INSTITUTION_CNPJ", DEFAULT_CNPJ),
    address: stringFromEnv(
      "INSTITUTION_ADDRESS",
      "Rua Augusta, 1492, Consolação, São Paulo, SP"
    ),
    email: stringFromEnv("INSTITUTION_SUPPORT_EMAIL", "contato@coursehub.com"),
    supportChannel: stringFromEnv("INSTITUTION_SUPPORT_CHANNEL", "central de ajuda do CourseHub"),
    phone: stringFromEnv("INSTITUTION_PHONE"),
    websiteUrl: stringFromEnv("INSTITUTION_WEBSITE_URL"),
  };
}

function getSignatory() {
  const institution = getInstitutionProfile();

  return {
    name: stringFromEnv("INSTITUTION_SIGNATORY_NAME", "Helena Martins"),
    role: stringFromEnv(
      "INSTITUTION_SIGNATORY_ROLE",
      `Diretora Acadêmica — ${institution.tradeName}`
    ),
  };
}

function getPublicInstitutionInfo() {
  const institution = getInstitutionProfile();
  const info = {
    name: institution.tradeName,
    supportEmail: institution.email,
    businessHours: stringFromEnv("INSTITUTION_BUSINESS_HOURS", "Segunda a sexta, 9h às 18h"),
  };

  if (institution.phone) info.phone = institution.phone;
  if (stringFromEnv("INSTITUTION_WHATSAPP")) info.whatsapp = stringFromEnv("INSTITUTION_WHATSAPP");
  if (stringFromEnv("INSTITUTION_ADDRESS")) info.address = institution.address;
  if (stringFromEnv("INSTITUTION_CNPJ")) info.cnpj = institution.cnpj;
  if (institution.websiteUrl) info.websiteUrl = institution.websiteUrl;

  return info;
}

module.exports = {
  getInstitutionProfile,
  getSignatory,
  getPublicInstitutionInfo,
};
