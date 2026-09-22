const LOCAL_RASTER = /^(\/[^?\s]+)\.(png|jpe?g)$/i;

/**
 * Paths estáticos do CourseHub agora são WebP. URLs antigas em PNG/JPEG
 * (banco, cache, placeholders) apontam para o arquivo otimizado.
 */
export function publicImageUrl(url, fallback = "/images/default-course.webp") {
  if (!url || typeof url !== "string") return fallback;

  const trimmed = url.trim();
  if (!trimmed) return fallback;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;

  const match = trimmed.match(LOCAL_RASTER);
  if (match) return `${match[1]}.webp`;

  return trimmed;
}
