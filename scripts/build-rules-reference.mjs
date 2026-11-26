// Generates skills/apex-review/references/rules.md from the rule definitions in
// src/rules.ts, so the skill's reference can never drift from the code.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), "rules-")), "rules.mjs");
await build({ entryPoints: [join(root, "src/rules.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "warning" });
const { RULES } = await import(pathToFileURL(out).href);

const lines = [
  "# Apex review rules",
  "",
  "Generated from `src/rules.ts` by `npm run docs`. Do not edit by hand.",
  "",
  "| Rule ID | Severity | Category | Title |",
  "|---|---|---|---|",
  ...RULES.map((r) => `| \`${r.id}\` | ${r.severity} | ${r.category} | ${r.title} |`),
  "",
];
for (const r of RULES) {
  lines.push(`## \`${r.id}\`: ${r.title}`, "", `**Severity:** ${r.severity} · **Category:** ${r.category}`, "", `**Why it matters.** ${r.why}`, "", `**How to fix.** ${r.fix}`, "");
}
writeFileSync(join(root, "skills/apex-review/references/rules.md"), lines.join("\n"));
console.log(`Wrote ${RULES.length} rules to skills/apex-review/references/rules.md`);
