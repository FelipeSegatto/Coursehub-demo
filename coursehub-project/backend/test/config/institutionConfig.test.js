const { test } = require("node:test");
const assert = require("node:assert/strict");

const { getInstitutionProfile, getSignatory } = require("../../config/institutionConfig");
const { isValidCnpj } = require("../../utils/documentValidation");

test("perfil institucional de documentos nunca usa [PREENCHER]", () => {
  const profile = getInstitutionProfile();
  const signatory = getSignatory();
  const blob = JSON.stringify({ profile, signatory });

  assert.equal(blob.includes("[PREENCHER]"), false);
  assert.ok(profile.legalName.length > 0);
  assert.ok(profile.tradeName.length > 0);
  assert.ok(isValidCnpj(profile.cnpj));
  assert.ok(signatory.name.length > 0);
});
