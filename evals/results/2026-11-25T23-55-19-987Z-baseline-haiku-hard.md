# Eval results (baseline-haiku-hard), 2026-11-25T23:56:42.501Z

Claude Code **without** the plugin, given the rule list and output format in the prompt.

Sample set: `samples-hard`. Answer key: 8 issues the scanner can find, 5 hidden issue(s) that need reading the code, 1 scanner false alarm(s) that should be dismissed, 1 clean file(s). Reports for each run: `evals/results/2026-11-25T23-55-19-987Z-baseline-haiku-hard-runs`.

| run | model | valid_report | scanner_issues | hidden_issues | false_positives | decoys_wrongly_confirmed | clean_file_findings | turns | seconds | api_equivalent_usd | missed | extras |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | claude-haiku-5-5 | yes | 7/8 | 5/5 | 1 | 0/1 | 0 | 12 | 82 | 0.02 | TerritoryAssignmentBatch.cls hardcoded-id | LegacyInvoiceImporter.cls:57 empty-catch |

`api_equivalent_usd` is what the run would cost on the Claude API. Runs made with a Claude subscription login are not charged per token.
