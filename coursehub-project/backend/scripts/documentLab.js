/**
 * Laboratório de documentos: renderiza todos os templates oficiais,
 * termos e relatórios com fixtures (sem banco). Gera HTML + PDF e
 * serve uma galeria em http://localhost:4177
 *
 *   npm run documents:lab
 *   npm run documents:lab -- --once
 */
const fs = require("fs/promises");
const http = require("http");
const path = require("path");
const { renderHtmlToPdf, closeBrowser } = require("../services/documents/documentRendererService");
const { buildCatalog } = require("./documentLab/catalog");

const OUTPUT_DIR = path.join(__dirname, "..", "storage", "document-lab");
const PORT = Number(process.env.DOCUMENT_LAB_PORT) || 4177;
const once = process.argv.includes("--once");

function isPdf(buffer) {
  return buffer.length > 4 && buffer.slice(0, 4).toString() === "%PDF";
}

function galleryHtml(results) {
  const okCount = results.filter((item) => item.ok).length;
  const cards = results
    .map(
      (item) => `
      <a class="card ${item.ok ? "ok" : "fail"}" href="${item.id}.pdf" target="preview">
        <span class="group">${item.group}</span>
        <strong>${item.title}</strong>
        <span class="meta">${item.ok ? `${item.pdfBytes} bytes` : item.error}</span>
      </a>`
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laboratório de documentos — CourseHub</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Inter, Segoe UI, sans-serif; background: #f4f6fb; color: #1a2233; }
    header { background: #0a2a57; color: white; padding: 20px 28px; }
    header .hub { color: #f46c3c; }
    header p { margin: 6px 0 0; opacity: 0.85; font-size: 14px; }
    .layout { display: grid; grid-template-columns: 320px 1fr; min-height: calc(100vh - 88px); }
    aside { padding: 16px; overflow: auto; border-right: 1px solid #d7dce5; background: white; }
    .card { display: block; text-decoration: none; color: inherit; border: 1px solid #d7dce5; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
    .card.ok { border-left: 4px solid #16a34a; }
    .card.fail { border-left: 4px solid #dc2626; }
    .card .group { display: block; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #55627a; }
    .card .meta { display: block; margin-top: 4px; font-size: 12px; color: #55627a; }
    iframe { width: 100%; height: calc(100vh - 88px); border: 0; background: #e8edf5; }
  </style>
</head>
<body>
  <header>
    <h1>Course<span class="hub">Hub</span> · laboratório de documentos</h1>
    <p>${okCount}/${results.length} templates geraram PDF válido. Fixtures locais — não usa o banco da escola.</p>
  </header>
  <div class="layout">
    <aside>${cards}</aside>
    <iframe name="preview" src="${results.find((item) => item.ok)?.id || "financial_contract"}.pdf" title="Pré-visualização"></iframe>
  </div>
</body>
</html>`;
}

async function run() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const catalog = await buildCatalog();
  const results = [];

  for (const item of catalog) {
    try {
      const html = item.render();
      await fs.writeFile(path.join(OUTPUT_DIR, `${item.id}.html`), html, "utf8");

      const pdf = await renderHtmlToPdf(html);
      if (!isPdf(pdf)) {
        throw new Error("O renderer não devolveu um PDF.");
      }

      await fs.writeFile(path.join(OUTPUT_DIR, `${item.id}.pdf`), pdf);
      results.push({
        id: item.id,
        group: item.group,
        title: item.title,
        ok: true,
        pdfBytes: pdf.length,
      });
      console.log(`ok  ${item.id} (${pdf.length} bytes)`);
    } catch (error) {
      results.push({
        id: item.id,
        group: item.group,
        title: item.title,
        ok: false,
        error: error.message,
      });
      console.error(`fail ${item.id}: ${error.message}`);
    }
  }

  await fs.writeFile(path.join(OUTPUT_DIR, "index.html"), galleryHtml(results), "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2), "utf8");

  const failed = results.filter((item) => !item.ok);
  await closeBrowser();

  if (failed.length > 0 && once) {
    process.exitCode = 1;
  }

  if (once) {
    console.log(`\nGaleria gravada em ${OUTPUT_DIR}`);
    return;
  }

  const server = http.createServer(async (req, res) => {
    const requested = decodeURIComponent((req.url || "/").split("?")[0]);
    const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
    const absolute = path.join(OUTPUT_DIR, relative);

    if (!absolute.startsWith(OUTPUT_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const file = await fs.readFile(absolute);
      const ext = path.extname(absolute);
      const types = {
        ".html": "text/html; charset=utf-8",
        ".pdf": "application/pdf",
        ".json": "application/json",
      };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      res.end(file);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(PORT, () => {
    console.log(`\nLaboratório em http://localhost:${PORT}`);
  });
}

run().catch(async (error) => {
  console.error(error);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
