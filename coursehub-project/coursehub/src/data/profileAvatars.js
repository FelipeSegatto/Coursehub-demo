import { API_URL } from "../services/APIService";

export const FEMININE_AVATARS = [
  {
    key: "feminine-01",
    src: "/avatars/feminine/feminine-01.webp",
    alt: "Avatar feminino 1",
  },
  {
    key: "feminine-02",
    src: "/avatars/feminine/feminine-02.webp",
    alt: "Avatar feminino 2",
  },
  {
    key: "feminine-03",
    src: "/avatars/feminine/feminine-03.webp",
    alt: "Avatar feminino 3",
  },
  {
    key: "feminine-04",
    src: "/avatars/feminine/feminine-04.webp",
    alt: "Avatar feminino 4",
  },
];

export const MASCULINE_AVATARS = [
  {
    key: "masculine-01",
    src: "/avatars/masculine/masculine-01.webp",
    alt: "Avatar masculino 1",
  },
  {
    key: "masculine-02",
    src: "/avatars/masculine/masculine-02.webp",
    alt: "Avatar masculino 2",
  },
  {
    key: "masculine-03",
    src: "/avatars/masculine/masculine-03.webp",
    alt: "Avatar masculino 3",
  },
  {
    key: "masculine-04",
    src: "/avatars/masculine/masculine-04.webp",
    alt: "Avatar masculino 4",
  },
];

export const profileAvatars = {
  feminine: FEMININE_AVATARS,
  masculine: MASCULINE_AVATARS,
  unspecified: [...FEMININE_AVATARS, ...MASCULINE_AVATARS],
};

const AVATARS_BY_KEY = Object.fromEntries(
  [...FEMININE_AVATARS, ...MASCULINE_AVATARS].map((avatar) => [avatar.key, avatar])
);

const FEMININE_GENDERS = new Set(["feminino", "female", "f", "woman", "mulher"]);
const MASCULINE_GENDERS = new Set(["masculino", "male", "m", "man", "homem"]);

export function genderBucket(gender) {
  const normalized = String(gender || "").trim().toLowerCase();

  if (FEMININE_GENDERS.has(normalized)) return "feminine";
  if (MASCULINE_GENDERS.has(normalized)) return "masculine";

  return "unspecified";
}

export function avatarsForGender(gender) {
  return profileAvatars[genderBucket(gender)] || profileAvatars.unspecified;
}

export function getAvatarByKey(avatarKey, gender) {
  if (AVATARS_BY_KEY[avatarKey]) {
    return AVATARS_BY_KEY[avatarKey];
  }

  const pool = avatarsForGender(gender);

  return (
    pool[0] || {
      key: "default",
      src: "/avatars/feminine/feminine-01.webp",
      alt: "Avatar padrão",
    }
  );
}

export function resolveAvatarSrc({ avatarKey, gender, avatarFileId }) {
  if (avatarFileId) {
    return {
      key: `upload-${avatarFileId}`,
      src: `${API_URL}/api/files/${avatarFileId}`,
      alt: "Foto de perfil",
    };
  }

  return getAvatarByKey(avatarKey, gender);
}
