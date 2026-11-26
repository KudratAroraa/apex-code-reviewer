// Prints the scanner's findings for every sample file. Used while writing the answer key.
// Build first: npx esbuild src/files.ts --bundle --platform=node --format=esm --outfile=dist/scan-lib.js
import { listApexFiles, scanApexFile } from "../dist/scan-lib.js";

const base = new URL("../samples", import.meta.url).pathname;
for (const f of listApexFiles(".", base)) {
  const r = scanApexFile(f.path, base);
  console.log(`${f.path}${f.is_test ? " (test)" : ""}: ${r.findings.length}`);
  for (const x of r.findings) console.log(`   ${String(x.line).padStart(3)}  ${x.severity.padEnd(6)} ${x.rule_id}`);
}
