import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";

const rootDir = process.cwd();
const webPublic = path.join(rootDir, "web/public");
const outputFile = path.join(webPublic, "submit.bundle.js");

async function bundle() {
  console.log("Bundling ES modules for tests...");

  // Get only the new ES modules in utils and services
  const utilsFiles = await glob("web/public/lib/utils/**/*.js", { absolute: true });
  const servicesFiles = await glob("web/public/lib/services/**/*.js", { absolute: true });
  const allFiles = [...utilsFiles.sort(), ...servicesFiles.sort(), path.join(webPublic, "submit.js")];

  let bundleContent = "// AUTO-GENERATED BUNDLE FOR TESTS\n\n";

  for (const file of allFiles) {
    if (!fs.existsSync(file)) {
      console.warn(`File not found: ${file}`);
      continue;
    }

    let content = fs.readFileSync(file, "utf8");

    // Remove imports: e.g., import { foo } from './bar.js';
    // Matches both single line and multi-line imports
    content = content.replace(/^import\s+[\s\S]*?from\s+['"].*?['"];?/gm, "");

    // Remove exports:
    // 1. export default ...
    content = content.replace(/^export\s+default\s+/gm, "");
    // 2. export const/function/class ... -> const/function/class ...
    content = content.replace(/^export\s+(const|let|var|function|class|async\s+function)\s+/gm, "$1 ");
    // 3. export { ... };
    content = content.replace(/^export\s+\{[\s\S]*?\};?/gm, "");

    bundleContent += `// --- Source: ${path.relative(webPublic, file)} ---\n`;
    bundleContent += content + "\n\n";
  }

  fs.writeFileSync(outputFile, bundleContent);
  console.log(`Successfully bundled ${allFiles.length} files into ${outputFile}`);
}

bundle().catch((err) => {
  console.error("Bundling failed:", err);
  process.exit(1);
});
