// Evaluation harness: runs Claude Code headless on a fresh copy of the sample project
// and scores the apex-review.json it writes against samples/answer-key.json.
//
// Usage:
//   npm run eval                                  3 runs with the plugin, default model
//   npm run eval -- --runs 3 --model haiku        pick the model
//   npm run eval -- --baseline                    Claude Code without the plugin, same
//                                                 rule list and output format in the prompt
//   npm run eval -- --set hard                    use the harder sample set in samples-hard/
//   npm run eval -- --rescore <runs folder>       score saved reports again, e.g. after fixing the answer key
//
// Runs use your Claude Code login. Results are saved in evals/results/ as JSON and Markdown.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const RUNS = Number(opt("runs", 3));
const MODEL = opt("model", "");
const BASELINE = args.includes("--baseline");
const SET = opt("set", "basic");
const SAMPLES = SET === "hard" ? "samples-hard" : "samples";
const LABEL = opt("label", BASELINE ? "baseline" : "plugin") + (MODEL ? `-${MODEL}` : "") + (SET === "hard" ? "-hard" : "");

const key = JSON.parse(readFileSync(join(root, SAMPLES, "answer-key.json"), "utf8"));
key.decoys ??= [];
key.acceptable ??= [];
const RESCORE = opt("rescore", "");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(root, "evals/results");
// Each run's report and metadata are kept so results can be scored again later.
const runsDir = RESCORE ? join(root, RESCORE) : join(outDir, `${stamp}-${LABEL}-runs`);

// The baseline gets the same rules and output format, but no tools, skill or method.
const BASELINE_PROMPT = `Review the Salesforce Apex code in force-app for governor limit, security and code quality problems.
Use only these rule IDs: soql-in-loop, dml-in-loop, soql-injection, trigger-not-bulkified, hardcoded-id, missing-sharing, soql-without-user-mode, empty-catch, debug-statement. Do not report soql-without-user-mode or debug-statement in @isTest classes.
Write apex-review.json in the project root with this shape:
{"reviewed_path": "force-app", "files_reviewed": 0, "findings": [{"file": "path", "line": 0, "rule_id": "", "severity": "high|medium|low", "source": "review", "status": "confirmed", "explanation": "", "fix": ""}], "notes": []}
Do not change any Apex file.`;

function runOnce(n) {
  const dir = mkdtempSync(join(tmpdir(), "apex-eval-"));
  cpSync(join(root, SAMPLES, "force-app"), join(dir, "force-app"), { recursive: true });
  const cli = [
    "-p", BASELINE ? BASELINE_PROMPT : "/apex-code-reviewer:review-apex force-app",
    "--output-format", "json",
    "--permission-mode", "acceptEdits",
    "--allowedTools", "Read", "Glob", "Grep", "Write", "mcp__plugin_apex-code-reviewer_apex",
  ];
  if (!BASELINE) cli.push("--plugin-dir", root);
  if (MODEL) cli.push("--model", MODEL);

  const started = Date.now();
  let meta = {};
  try {
    meta = JSON.parse(execFileSync("claude", cli, { cwd: dir, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 15 * 60 * 1000 }));
  } catch (err) {
    meta = { is_error: true, result: String(err.message).slice(0, 300) };
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const reportPath = join(dir, "apex-review.json");
  let report = null;
  try {
    report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  } catch {
    report = null;
  }
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `run-${n}.json`), JSON.stringify({ seconds, meta: slimMeta(meta), report }, null, 2));
  return { n, seconds, meta, report, ...score(report) };
}

function slimMeta(meta) {
  const { num_turns, total_cost_usd, modelUsage, is_error, subtype } = meta;
  return { num_turns, total_cost_usd, model: Object.keys(modelUsage ?? {})[0] ?? null, is_error, subtype };
}

function loadSaved(n) {
  const saved = JSON.parse(readFileSync(join(runsDir, `run-${n}.json`), "utf8"));
  const meta = { ...saved.meta, modelUsage: saved.meta.model ? { [saved.meta.model]: {} } : undefined };
  return { n, seconds: saved.seconds, meta, report: saved.report, ...score(saved.report) };
}

function score(report) {
  if (!report || !Array.isArray(report.findings)) {
    return { valid_report: false, scanner_found: 0, review_found: 0, false_positives: 0, decoys_confirmed: 0, clean_file_findings: 0, missed: key.issues.map(label) };
  }
  const confirmed = report.findings.filter((f) => f.status !== "dismissed");
  const used = new Set();
  const matchOf = (issue) =>
    confirmed.findIndex((f, i) => !used.has(i) && String(f.file).endsWith(issue.file) && f.rule_id === issue.rule_id && issue.lines.includes(Number(f.line)));
  const missed = [];
  let scanner = 0;
  let review = 0;
  for (const issue of key.issues) {
    const i = matchOf(issue);
    if (i === -1) {
      missed.push(label(issue));
      continue;
    }
    used.add(i);
    if (issue.found_by === "scanner") scanner++;
    else review++;
  }
  const isAcceptable = (f) => key.acceptable.some((a) => String(f.file).endsWith(a.file) && f.rule_id === a.rule_id && a.lines.includes(Number(f.line)));
  const extras = confirmed.filter((f, i) => !used.has(i) && !isAcceptable(f));
  const isDecoy = (f) => key.decoys.some((d) => String(f.file).endsWith(d.file) && f.rule_id === d.rule_id && d.lines.includes(Number(f.line)));
  return {
    valid_report: true,
    scanner_found: scanner,
    review_found: review,
    false_positives: extras.length,
    decoys_confirmed: extras.filter(isDecoy).length,
    clean_file_findings: confirmed.filter((f) => key.clean_files.some((c) => String(f.file).endsWith(c))).length,
    missed,
    extras: extras.map((f) => `${String(f.file).split("/").pop()}:${f.line} ${f.rule_id}`),
  };
}

function label(issue) {
  return `${issue.file.split("/").pop()} ${issue.rule_id}`;
}

const scannerTotal = key.issues.filter((i) => i.found_by === "scanner").length;
const reviewTotal = key.issues.length - scannerTotal;
const rows = [];
const total = RESCORE ? readdirSync(runsDir).filter((f) => /^run-\d+\.json$/.test(f)).length : RUNS;
for (let n = 1; n <= total; n++) {
  process.stdout.write(`${LABEL} run ${n}/${total} ... `);
  const r = RESCORE ? loadSaved(n) : runOnce(n);
  const model = Object.keys(r.meta.modelUsage ?? {})[0] ?? MODEL ?? "default";
  rows.push({
    run: n,
    model,
    valid_report: r.valid_report ? "yes" : "no",
    scanner_issues: `${r.scanner_found}/${scannerTotal}`,
    hidden_issues: `${r.review_found}/${reviewTotal}`,
    false_positives: r.false_positives,
    decoys_wrongly_confirmed: `${r.decoys_confirmed}/${key.decoys.length}`,
    clean_file_findings: r.clean_file_findings,
    turns: r.meta.num_turns ?? "-",
    seconds: r.seconds,
    api_equivalent_usd: r.meta.total_cost_usd != null ? Number(r.meta.total_cost_usd).toFixed(2) : "-",
    missed: r.missed.join(", ") || "-",
    extras: (r.extras ?? []).join(", ") || "-",
  });
  console.log(`${r.scanner_found + r.review_found}/${key.issues.length} found (${r.review_found}/${reviewTotal} hidden), ${r.false_positives} false positives, ${r.decoys_confirmed}/${key.decoys.length} decoys confirmed, ${r.seconds}s`);
}

const headers = Object.keys(rows[0]);
const md = [
  `# Eval results (${LABEL}), ${new Date().toISOString()}${RESCORE ? ` (re-scored from ${RESCORE})` : ""}`,
  "",
  BASELINE ? "Claude Code **without** the plugin, given the rule list and output format in the prompt." : "Claude Code **with** the Apex Code Reviewer plugin (`/apex-code-reviewer:review-apex force-app`).",
  "",
  `Sample set: \`${SAMPLES}\`. Answer key: ${scannerTotal} issues the scanner can find, ${reviewTotal} hidden issue(s) that need reading the code, ${key.decoys.length} scanner false alarm(s) that should be dismissed, ${key.clean_files.length} clean file(s). Reports for each run: \`${runsDir.replace(root, "").replace(/^\//, "")}\`.`,
  "",
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((r) => `| ${headers.map((h) => r[h]).join(" | ")} |`),
  "",
  "`api_equivalent_usd` is what the run would cost on the Claude API. Runs made with a Claude subscription login are not charged per token.",
  "",
].join("\n");

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${stamp}-${LABEL}.md`), md);
writeFileSync(join(outDir, `${stamp}-${LABEL}.json`), JSON.stringify(rows, null, 2));
console.log("\n" + md);
console.log(`Saved to evals/results/${stamp}-${LABEL}.md`);
