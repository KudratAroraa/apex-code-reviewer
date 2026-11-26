// The review rules. Each rule finds exact matches with line numbers and carries the
// explanation and fix that Claude and the generated reference file use.

import { type ApexSource, lineOf, lineText } from "./apex";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  rule_id: string;
  severity: Severity;
  line: number;
  snippet: string;
  message: string;
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  category: "governor limits" | "security" | "quality";
  why: string;
  fix: string;
  check: (src: ApexSource) => { offset: number; message: string }[];
}

const all = (re: RegExp, text: string) => [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))];

export const RULES: Rule[] = [
  {
    id: "soql-in-loop",
    title: "SOQL query inside a loop",
    severity: "high",
    category: "governor limits",
    why: "Salesforce allows 100 SOQL queries per transaction. A query inside a loop runs once per record, so the code fails with a LimitException as soon as more than about 100 records are processed, for example in a data load.",
    fix: "Collect the IDs you need before the loop, run one query with `WHERE Id IN :ids`, and store the results in a Map for lookups inside the loop.",
    check: (src) =>
      [...all(/\[\s*(SELECT|FIND)\b/i, src.code), ...all(/\bDatabase\.(query|queryWithBinds|countQuery)\s*\(/i, src.code)]
        .filter((m) => src.inLoop[m.index!])
        .map((m) => ({ offset: m.index!, message: "Database query runs once per loop iteration." })),
  },
  {
    id: "dml-in-loop",
    title: "DML statement inside a loop",
    severity: "high",
    category: "governor limits",
    why: "Salesforce allows 150 DML statements per transaction. Inserting, updating or deleting records one at a time inside a loop fails on bulk data and is much slower than one bulk operation.",
    fix: "Add the records to a List inside the loop and run a single insert, update, upsert or delete on the whole list after the loop.",
    check: (src) =>
      [
        ...all(/(^|[;{}\s])(insert|update|upsert|delete|undelete|merge)\s+[\w(]/im, src.code).map((m) => ({ m, at: m.index! + m[1].length })),
        ...all(/\bDatabase\.(insert|update|upsert|delete|undelete|merge)\s*\(/i, src.code).map((m) => ({ m, at: m.index! })),
      ]
        .filter(({ at }) => src.inLoop[at])
        .map(({ at }) => ({ offset: at, message: "Records are saved once per loop iteration." })),
  },
  {
    id: "soql-injection",
    title: "Dynamic SOQL built by string concatenation",
    severity: "high",
    category: "security",
    why: "Building a query string by joining in variable values lets an attacker change the query (SOQL injection), for example to read records they should not see.",
    fix: "Use a bind variable (`:name`) with `Database.queryWithBinds`, or at minimum wrap user input in `String.escapeSingleQuotes()`.",
    check: (src) => {
      const results: { offset: number; message: string }[] = [];
      for (const m of all(/\bDatabase\.query\s*\(([^;]*)\)\s*;/i, src.code)) {
        const arg = m[1].trim().split(",")[0].trim();
        const direct = /\+/.test(arg);
        // A variable that was built with + somewhere in the file without escaping.
        const varName = /^\w+$/.test(arg) ? arg : null;
        const builtUnsafely =
          varName !== null &&
          new RegExp(`\\b${varName}\\s*(\\+?=)[^;]*\\+\\s*[A-Za-z_]`).test(src.code) &&
          !new RegExp(`escapeSingleQuotes\\s*\\(`).test(src.code);
        if (direct || builtUnsafely) results.push({ offset: m.index!, message: "Query text is built by joining strings, which allows SOQL injection." });
      }
      return results;
    },
  },
  {
    id: "trigger-not-bulkified",
    title: "Trigger handles only the first record",
    severity: "high",
    category: "governor limits",
    why: "Triggers receive up to 200 records at once. Code that reads only `Trigger.new[0]` silently ignores every other record in a bulk insert or data load.",
    fix: "Loop over `Trigger.new` (or use `Trigger.newMap`) so every record in the batch is handled.",
    check: (src) =>
      all(/\bTrigger\.(new|old)\s*\[\s*0\s*\]/i, src.code).map((m) => ({ offset: m.index!, message: "Only the first record in the trigger batch is processed." })),
  },
  {
    id: "hardcoded-id",
    title: "Hardcoded Salesforce record ID",
    severity: "medium",
    category: "quality",
    why: "Record IDs are different in every org. A hardcoded ID works in the developer's sandbox and breaks after deployment to test or production.",
    fix: "Look the record up by a stable value such as DeveloperName, or store the value in Custom Metadata or a Custom Setting.",
    check: (src) =>
      src.strings
        .filter((s) => /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(s.value) && /^(0|a)[a-zA-Z0-9]{2}/.test(s.value) && /\d/.test(s.value.slice(3)))
        .map((s) => ({ offset: s.offset, message: `Hardcoded record ID '${s.value}'.` })),
  },
  {
    id: "missing-sharing",
    title: "Class does not declare a sharing mode",
    severity: "medium",
    category: "security",
    why: "A class without `with sharing` can run without the user's record sharing rules, so users may see or change records they are not allowed to.",
    fix: "Declare `with sharing` by default, or `inherited sharing` for utility classes. Use `without sharing` only on purpose, with a comment explaining why.",
    check: (src) => {
      if (src.isTest || src.isTrigger) return [];
      // Only the outer class: the first class declaration at brace depth zero.
      const m = /^[ \t]*(?:(?:public|global|private|virtual|abstract|with|without|inherited|sharing)\s+)*class\s+\w+[^{]*\{/im.exec(src.code);
      if (!m || /\b(with|without|inherited)\s+sharing\b/i.test(m[0])) return [];
      return [{ offset: m.index! + m[0].search(/\S/), message: "No sharing keyword on the class declaration." }];
    },
  },
  {
    id: "soql-without-user-mode",
    title: "Query does not enforce user permissions",
    severity: "medium",
    category: "security",
    why: "By default Apex queries ignore the running user's object and field permissions, so data the user cannot normally see can be returned and shown.",
    fix: "Add `WITH USER_MODE` to the query (or `WITH SECURITY_ENFORCED`), or pass `AccessLevel.USER_MODE` to Database methods.",
    check: (src) => {
      if (src.isTest) return [];
      const inline = all(/\[\s*SELECT\b[^\]]*\]/i, src.code)
        .filter((m) => !/\bWITH\s+(USER_MODE|SECURITY_ENFORCED|SYSTEM_MODE)\b/i.test(m[0]))
        .map((m) => ({ offset: m.index!, message: "Query runs in system mode without a permission check." }));
      // Dynamic queries: Database.query without AccessLevel.USER_MODE. If the query text in
      // the file's strings already says WITH USER_MODE, the permission check is in the text.
      const textHasMode = src.strings.some((s) => /\bWITH\s+(USER_MODE|SECURITY_ENFORCED|SYSTEM_MODE)\b/i.test(s.value));
      const dynamic = textHasMode
        ? []
        : all(/\bDatabase\.query\s*\(([^;]*)\)\s*;/i, src.code)
            .filter((m) => !/AccessLevel\.(USER_MODE|SYSTEM_MODE)/i.test(m[1]))
            .map((m) => ({ offset: m.index!, message: "Dynamic query runs in system mode without AccessLevel.USER_MODE." }));
      return [...inline, ...dynamic];
    },
  },
  {
    id: "empty-catch",
    title: "Empty catch block",
    severity: "low",
    category: "quality",
    why: "An empty catch block hides the error, so a failed save or callout goes unnoticed and is very hard to debug later.",
    fix: "Log the exception, rethrow it, or handle it properly. If ignoring it is intended, add a comment explaining why.",
    check: (src) =>
      all(/\bcatch\s*\([^)]*\)\s*\{\s*\}/i, src.code)
        // A comment inside the block counts as an intentional, documented ignore.
        .filter((m) => !/\/\/|\/\*/.test(src.raw.slice(m.index!, m.index! + m[0].length)))
        .map((m) => ({ offset: m.index!, message: "Exception is caught and silently ignored." })),
  },
  {
    id: "debug-statement",
    title: "System.debug left in code",
    severity: "low",
    category: "quality",
    why: "Debug statements add noise to logs and use CPU time in production, and can write sensitive values to the debug log.",
    fix: "Remove debug statements before deployment, or use a logging framework that can be switched off.",
    check: (src) =>
      src.isTest ? [] : all(/\bSystem\.debug\s*\(/i, src.code).map((m) => ({ offset: m.index!, message: "System.debug call." })),
  },
];

export const RULES_BY_ID = new Map(RULES.map((r) => [r.id, r]));

export function scan(src: ApexSource): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    const seen = new Set<number>();
    for (const hit of rule.check(src)) {
      const line = lineOf(src, hit.offset);
      if (seen.has(line)) continue; // one finding per rule per line
      seen.add(line);
      findings.push({ rule_id: rule.id, severity: rule.severity, line, snippet: lineText(src, line).slice(0, 160), message: hit.message });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
}
