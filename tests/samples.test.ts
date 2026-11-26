// Checks the scanner against the answer key for the sample project.
// If these pass, the rules are correct, so any miss in the evals is Claude's review.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listApexFiles, scanApexFile } from "../src/files";

const base = new URL("../samples/force-app/main/default", import.meta.url).pathname;
const key = JSON.parse(readFileSync(new URL("../samples/answer-key.json", import.meta.url), "utf8"));

describe("sample project ground truth", () => {
  const files = listApexFiles(".", base);
  const results = Object.fromEntries(files.map((f) => [f.path, scanApexFile(f.path, base).findings]));

  it("finds all 8 sample files", () => {
    expect(files).toHaveLength(8);
  });

  it("finds every scanner issue in the answer key on an expected line", () => {
    for (const issue of key.issues.filter((i: { found_by: string }) => i.found_by === "scanner")) {
      const hit = results[issue.file]?.find((f) => f.rule_id === issue.rule_id && issue.lines.includes(f.line));
      expect(hit, `${issue.file} ${issue.rule_id}`).toBeDefined();
    }
  });

  it("reports nothing that is not in the answer key", () => {
    const expected = key.issues.filter((i: { found_by: string }) => i.found_by === "scanner").length;
    const total = Object.values(results).flat().length;
    expect(total).toBe(expected);
  });

  it("reports nothing on the clean files", () => {
    for (const file of key.clean_files) expect(results[file], file).toEqual([]);
  });

  it("cannot see the indirect query, which is left to Claude", () => {
    expect(results["classes/CaseEscalationService.cls"]).toEqual([]);
  });
});

describe("file safety", () => {
  it("refuses to scan files that are not Apex", () => {
    expect(() => scanApexFile("../answer-key.json", base)).toThrow(/Only .cls and .trigger/);
  });
});

describe("hard sample set", () => {
  const hardBase = new URL("../samples-hard/force-app/main/default", import.meta.url).pathname;
  const hardKey = JSON.parse(readFileSync(new URL("../samples-hard/answer-key.json", import.meta.url), "utf8"));
  const findings = listApexFiles(".", hardBase).flatMap((f) => scanApexFile(f.path, hardBase).findings.map((x) => ({ ...x, file: f.path })));
  const has = (i: { file: string; rule_id: string; lines: number[] }) =>
    findings.some((f) => f.file === i.file && f.rule_id === i.rule_id && i.lines.includes(f.line));

  it("finds every issue the scanner is expected to find", () => {
    for (const issue of hardKey.issues.filter((i: { found_by: string }) => i.found_by === "scanner")) expect(has(issue), `${issue.file} ${issue.rule_id}`).toBe(true);
  });

  it("misses the hidden issues, which are left to Claude", () => {
    for (const issue of hardKey.issues.filter((i: { found_by: string }) => i.found_by === "review")) expect(has(issue), `${issue.file} ${issue.rule_id}`).toBe(false);
  });

  it("raises the two known false alarms that Claude should dismiss", () => {
    for (const decoy of hardKey.decoys) expect(has(decoy), `${decoy.file} ${decoy.rule_id}`).toBe(true);
    expect(findings).toHaveLength(hardKey.issues.filter((i: { found_by: string }) => i.found_by === "scanner").length + hardKey.decoys.length);
  });

  it("ignores the commented-out DML, the escaped query and the documented empty catch", () => {
    const legacy = findings.filter((f) => f.file === "classes/LegacyInvoiceImporter.cls").map((f) => f.rule_id);
    expect(legacy).not.toContain("soql-injection");
    expect(legacy).not.toContain("empty-catch");
    expect(findings.some((f) => f.file === "classes/OrderFulfilmentService.cls" && f.line === 81)).toBe(false);
  });
});
