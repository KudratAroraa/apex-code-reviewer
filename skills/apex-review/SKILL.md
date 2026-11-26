---
name: apex-review
description: Review Salesforce Apex code (.cls classes and .trigger files) for governor limit, security and code quality problems, with exact line numbers, explanations and fixes. Use when the user asks to review, audit, check or scan Apex code, a Salesforce trigger or class, a force-app folder or an SFDX project, or asks whether Apex code is bulk-safe, secure or ready to deploy.
---

# Apex code review

You are reviewing Salesforce Apex code the way a senior Salesforce developer reviews a pull request before deployment. The `apex` MCP tools find exact pattern matches. Your job is to confirm them, find what the patterns cannot see and explain everything clearly.

## Method

1. **Find the files.** Call `list_apex_files` on the folder the user gave, or `.` for the whole project.
2. **Scan every file.** Call `scan_apex_file` on each file. Scan files in parallel when you can.
3. **Read every non-test file in full** with the Read tool, including files with no findings. The scanner only sees patterns inside one block of code. Reading the code is how you catch:
   - a query or DML statement inside a helper method that is **called from inside a loop** (report it as `soql-in-loop` or `dml-in-loop` on the line of the call inside the loop),
   - findings the scanner raised that are not real problems in context.
4. **Decide on each scanner finding.** Mark it `confirmed`, or `dismissed` with a one-line reason. Dismiss only with a concrete reason from the code.
5. **Write the report files** described below, then give the user a short summary in chat.

## Rules

Use only these rule IDs for findings. Call `explain_rule` if you need the full explanation for one. The complete reference is in [references/rules.md](references/rules.md).

| Rule ID | Severity | Problem |
|---|---|---|
| `soql-in-loop` | high | Query runs once per loop iteration |
| `dml-in-loop` | high | Records saved once per loop iteration |
| `soql-injection` | high | Dynamic query built by joining strings |
| `trigger-not-bulkified` | high | Trigger handles only the first record |
| `hardcoded-id` | medium | Record ID written into the code |
| `missing-sharing` | medium | Class has no sharing keyword |
| `soql-without-user-mode` | medium | Query ignores the user's permissions |
| `empty-catch` | low | Error caught and silently ignored |
| `debug-statement` | low | `System.debug` left in code |

Test classes (`@isTest`) are expected to use system-mode queries and debug statements, so do not report those rules in test classes. A catch block that contains only a comment explaining why the error is ignored is a deliberate choice, not an `empty-catch`. If you notice a real concern that none of these rules covers, put it in `notes`, not in `findings`.

The scanner's list is a starting point, not the whole review. While reading each file, check every query and every save against the rules yourself, including dynamic queries and code the scanner did not flag.

## Report files

Write two files in the project root unless the user names another location. Do not change any Apex file unless the user asks you to.

**`apex-review.json`**, exactly this shape:

```json
{
  "reviewed_path": "force-app",
  "files_reviewed": 8,
  "findings": [
    {
      "file": "force-app/main/default/classes/AccountService.cls",
      "line": 19,
      "rule_id": "dml-in-loop",
      "severity": "high",
      "source": "scanner",
      "status": "confirmed",
      "explanation": "update acc runs once per account, so 151 accounts exceed the DML limit.",
      "fix": "Collect the accounts in a list and run one update after the loop."
    }
  ],
  "notes": ["Optional observations that are not rule findings."]
}
```

- `source` is `scanner` when the finding came from `scan_apex_file`, or `review` when you found it by reading the code.
- `status` is `confirmed` or `dismissed`. Include dismissed scanner findings so the decision is visible, with the reason in `explanation`.
- `file` is the path as returned by `list_apex_files`.

**`apex-review.md`** for people to read:

1. A one-paragraph summary: files reviewed, confirmed findings by severity, and whether the code is ready to deploy.
2. A table of confirmed findings sorted by severity: severity, file, line, rule, explanation.
3. For each high severity finding, a short before and after code example of the fix.
4. Dismissed findings and notes, if any.

## In chat

Give a short summary: number of files, confirmed findings by severity, the most important problem to fix first, and the paths of the two report files. Offer to apply the fixes.
