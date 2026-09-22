const FEMININE_KEYS = ["feminine-01", "feminine-02", "feminine-03", "feminine-04"];
const MASCULINE_KEYS = ["masculine-01", "masculine-02", "masculine-03", "masculine-04"];
const ALL_KEYS = [...FEMININE_KEYS, ...MASCULINE_KEYS];

const FEMININE_GENDERS = new Set([
  "feminino",
  "female",
  "f",
  "woman",
  "mulher",
]);

const MASCULINE_GENDERS = new Set([
  "masculino",
  "male",
  "m",
  "man",
  "homem",
]);

function normalizeGender(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function genderBucket(gender) {
  const normalized = normalizeGender(gender);

  if (FEMININE_GENDERS.has(normalized)) return "feminine";
  if (MASCULINE_GENDERS.has(normalized)) return "masculine";

  return "unspecified";
}

function isCatalogAvatarKey(avatarKey) {
  return ALL_KEYS.includes(String(avatarKey || ""));
}

function pickAvatarKeyForUser({ id, gender }) {
  const bucket = genderBucket(gender);
  const pool = bucket === "feminine" ? FEMININE_KEYS : bucket === "masculine" ? MASCULINE_KEYS : ALL_KEYS;
  const index = Math.abs(Number(id) || 0) % pool.length;

  return pool[index];
}

module.exports = {
  FEMININE_KEYS,
  MASCULINE_KEYS,
  ALL_KEYS,
  genderBucket,
  isCatalogAvatarKey,
  pickAvatarKeyForUser,
};
