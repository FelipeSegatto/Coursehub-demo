/**
 * Redimensiona e recompacta rasters em public/ e src/assets para WebP.
 * Uso (em coursehub/): node scripts/optimize-images.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanDirs = [path.join(root, "public"), path.join(root, "src", "assets")];
const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function maxWidthFor(filePath) {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();

  if (normalized.includes("/avatars/")) return 256;
  if (/\/course-\d+\.(webp|png|jpe?g)$/.test(normalized)) return 960;

  return 1920;
}

function forceRemove(filePath) {
  try {
    execFileSync("cmd.exe", ["/c", "del", "/f", "/q", filePath], { stdio: "ignore" });
  } catch {
    // ignore
  }
}

async function walk(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath, files);
      continue;
    }

    if (entry.name.endsWith(".tmp")) {
      forceRemove(fullPath);
      continue;
    }

    if (RASTER.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

async function optimizeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const destPath = ext === ".webp" ? filePath : filePath.replace(/\.(png|jpe?g)$/i, ".webp");
  const originalStat = await fs.stat(filePath);

  if (ext === ".webp" && originalStat.size < 80 * 1024) {
    return { filePath, destPath: filePath, skipped: true, before: originalStat.size, after: originalStat.size };
  }
  const metadata = await sharp(filePath, { failOn: "none" }).metadata();
  const maxWidth = maxWidthFor(filePath);
  const width = metadata.width || maxWidth;

  let pipeline = sharp(filePath, { failOn: "none" }).rotate();

  if (width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }

  const buffer = await pipeline.webp({ quality: 74, effort: 6, smartSubsample: true }).toBuffer();

  if (destPath === filePath && buffer.length >= originalStat.size * 0.95) {
    return { filePath, destPath, skipped: true, before: originalStat.size, after: originalStat.size };
  }

  if (destPath === filePath) {
    forceRemove(filePath);
  }

  await fs.writeFile(destPath, buffer);

  if (destPath !== filePath) {
    forceRemove(filePath);
  }

  return {
    filePath,
    destPath,
    skipped: false,
    before: originalStat.size,
    after: buffer.length,
  };
}

async function main() {
  const files = [];

  for (const dir of scanDirs) {
    await walk(dir, files);
  }

  files.sort();

  let saved = 0;
  const results = [];

  for (const filePath of files) {
    try {
      const result = await optimizeFile(filePath);
      results.push(result);
      saved += Math.max(0, result.before - result.after);
      const label = path.relative(root, result.destPath || filePath);

      if (result.skipped) {
        console.log(`skip  ${label}`);
      } else {
        console.log(
          `ok    ${label}  ${(result.before / 1024).toFixed(0)}KB → ${(result.after / 1024).toFixed(0)}KB`
        );
      }
    } catch (error) {
      console.error(`fail  ${path.relative(root, filePath)}: ${error.message}`);
    }
  }

  const publicLogin = path.join(root, "public", "images", "login-bg.webp");
  const assetLogin = path.join(root, "src", "assets", "login-bg.webp");

  try {
    await fs.copyFile(publicLogin, assetLogin);
    console.log("sync  src/assets/login-bg.webp");
  } catch {
    // ignore
  }

  const defaultCourse = path.join(root, "public", "images", "default-course.webp");
  const sourceCourse = path.join(root, "public", "images", "course-6.webp");

  try {
    await fs.access(defaultCourse);
  } catch {
    await fs.copyFile(sourceCourse, defaultCourse);
    console.log("copy  default-course.webp ← course-6.webp");
  }

  console.log(`\nEconomia nesta passagem: ${(saved / 1024 / 1024).toFixed(1)} MB em ${results.length} arquivos.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
