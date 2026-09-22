const { test } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const { getPublicInstitutionInfo } = require("../../config/institutionPublicConfig");

const ALLOWED_KEYS = new Set(["name", "supportEmail", "phone", "whatsapp", "businessHours", "address", "cnpj", "websiteUrl"]);

test("getPublicInstitutionInfo só devolve campos da lista explícita segura", () => {
  const info = getPublicInstitutionInfo();

  for (const key of Object.keys(info)) {
    assert.ok(ALLOWED_KEYS.has(key), `campo inesperado exposto publicamente: ${key}`);
  }

  // Sempre presentes, com fallback -- nunca undefined/placeholder cru.
  assert.equal(typeof info.name, "string");
  assert.ok(info.name.length > 0);
  assert.equal(typeof info.supportEmail, "string");
  assert.equal(typeof info.businessHours, "string");
});

test("getPublicInstitutionInfo nunca inclui segredos, chaves de pagamento ou URLs internas", () => {
  const info = getPublicInstitutionInfo();
  const serialized = JSON.stringify(info).toLowerCase();

  for (const forbidden of ["secret", "token", "access_token", "webhook", "password", "senha", "jwt"]) {
    assert.ok(!serialized.includes(forbidden), `resposta pública não deveria conter "${forbidden}"`);
  }
});
