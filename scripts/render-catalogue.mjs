#!/usr/bin/env node
// render-catalogue.mjs
// Usage:
// $ node ./scripts/render-catalogue.mjs product-catalogue.toml catalogue.html LR
// ok: catalogue.html
// $ open catalogue.html
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parse as parseToml } from "toml";

const argv = process.argv.slice(2);
const inPath = argv[0] || "catalogue.toml";
const outPath = argv[1] || "catalogue.html";
const direction = (argv[2] || "LR").toUpperCase(); // LR, TB, RL, BT

const safeId = (prefix, id) => `${prefix}_${String(id).replace(/[^A-Za-z0-9_]/g, "_")}`;

const esc = (s) =>
  String(s ?? "")
    .replace(/\r?\n/g, "\\n") // keep literal \n for Mermaid line breaks
    .replace(/["'[\]]/g, ""); // strip quotes and bracket chars

const fmtQualifiers = (q) => {
  if (!q || typeof q !== "object") return "";
  const entries = Object.entries(q).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return entries.length ? `\\nqualifiers: ${entries.join(", ")}` : "";
};

const buildMermaid = (doc) => {
  const bundles = doc.bundles ?? [];
  const activities = doc.activities ?? [];

  const lines = [];
  lines.push(`flowchart ${direction}`);

  lines.push("%% Bundles");
  for (const b of bundles) {
    const id = safeId("b", b.id);
    const core =
      `${b.id}\\n${b.name}` +
      (b.allocation ? `\\nalloc: ${b.allocation}` : "") +
      (b.auth ? `\\nauth: ${b.auth}` : "") +
      (b.cap != null ? `\\ncap: ${b.cap}` : "") +
      (b.timeout ? `\\ntimeout: ${b.timeout}` : "") +
      fmtQualifiers(b.qualifiers);
    lines.push(`${id}["${esc(core)}"]:::bundle`);
  }

  lines.push("%% Activities");
  for (const a of activities) {
    const id = safeId("a", a.id);
    const core = `${a.id}\\n${a.name}\\n`;
    lines.push(`${id}["${esc(core)}"]`);
  }

  lines.push("%% Edges: bundle -> activity");
  for (const a of activities) {
    const aId = safeId("a", a.id);
    for (const bId of a.bundles ?? []) {
      const bNode = safeId("b", bId);
      lines.push(`${bNode} --> ${aId}`);
    }
  }

  lines.push("%% Styling");
  lines.push("classDef bundle stroke:#0d9488,fill:#ecfeff,stroke-width:1px;");
  lines.push("classDef actual stroke:#334155,fill:#e2e8f0,stroke-width:1px;");
  lines.push("classDef demo stroke:#7c2d12,fill:#fff7ed,stroke-width:1px;");

  return lines.join("\n");
};

const wrapHtml = (title, mermaidCode) => `<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<title>${esc(title)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
         Helvetica, Arial; margin: 16px; }
  .container { max-width: 1200px; margin: 0 auto; }
  .meta { color: #475569; font-size: 14px; margin-bottom: 8px; }
  .mermaid { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
</style>
</head>
<body>
<div class='container'>
  <div class='meta'>Rendered: ${new Date().toISOString()}</div>
  <pre class='mermaid'>
${mermaidCode}
  </pre>
</div>
<script type='module'>
  import mermaid from
    'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, securityLevel: 'strict' });
</script>
</body>
</html>`;

try {
  const raw = await readFile(inPath, "utf8");
  const doc = parseToml(raw);
  const mermaid = buildMermaid(doc);
  const html = wrapHtml(`Catalogue ${esc(doc.version || "")} – ${basename(inPath)}`, mermaid);
  await writeFile(outPath, html, "utf8");
  console.log(`ok: ${outPath}`);
} catch (err) {
  console.error("error:", err.message);
  process.exit(1);
}
