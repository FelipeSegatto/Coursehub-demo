const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  genderBucket,
  pickAvatarKeyForUser,
  isCatalogAvatarKey,
  FEMININE_KEYS,
  MASCULINE_KEYS,
} = require("../../services/profile/avatarCatalog");
const { getPurposeConfig } = require("../../config/uploadConfig");

test("avatar catalog splits keys by gender", () => {
  assert.equal(genderBucket("Feminino"), "feminine");
  assert.equal(genderBucket("female"), "feminine");
  assert.equal(genderBucket("Masculino"), "masculine");
  assert.equal(genderBucket("male"), "masculine");
  assert.equal(genderBucket("Outro"), "unspecified");

  assert.ok(FEMININE_KEYS.includes(pickAvatarKeyForUser({ id: 1, gender: "Feminino" })));
  assert.ok(MASCULINE_KEYS.includes(pickAvatarKeyForUser({ id: 1, gender: "Masculino" })));
  assert.equal(isCatalogAvatarKey("feminine-01"), true);
  assert.equal(isCatalogAvatarKey("student-01"), false);
});

test("upload purposes restrict mime types and roles", () => {
  assert.deepEqual(getPurposeConfig("avatar").allowedRoles, ["student", "teacher", "admin"]);
  assert.ok(getPurposeConfig("submission").allowedMimeTypes.includes("application/pdf"));
  assert.ok(getPurposeConfig("course_material").allowedRoles.includes("teacher"));
  assert.ok(getPurposeConfig("course_material").allowedRoles.includes("admin"));
  assert.equal(getPurposeConfig("submission").allowedRoles.includes("student"), true);
  assert.equal(getPurposeConfig("course_material").maxBytes, 5 * 1024 * 1024);
  assert.equal(getPurposeConfig("submission").maxBytes, 5 * 1024 * 1024);
});
