# Eval results (baseline-haiku-hard), 2026-11-25T02:19:04.005Z

Claude Code **without** the plugin, given the rule list and output format in the prompt.

Sample set: `samples-hard`. Answer key: 7 issues the scanner can find, 4 hidden issue(s) that need reading the code, 2 scanner false alarm(s) that should be dismissed, 2 clean file(s).

| run | model | valid_report | scanner_issues | hidden_issues | false_positives | decoys_wrongly_confirmed | clean_file_findings | turns | seconds | api_equivalent_usd | missed | extras |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | claude-haiku-5-5 | yes | 6/7 | 4/4 | 3 | 0/2 | 2 | 13 | 86 | 0.02 | TerritoryAssignmentBatch.cls hardcoded-id | LegacyInvoiceImporter.cls:54 soql-injection, LegacyInvoiceImporter.cls:57 empty-catch, ProductCatalogController.cls:17 soql-without-user-mode |
| 2 | claude-haiku-5-5 | yes | 6/7 | 4/4 | 3 | 0/2 | 1 | 10 | 98 | 0.02 | TerritoryAssignmentBatch.cls hardcoded-id | ProductCatalogController.cls:17 soql-without-user-mode, TerritoryAssignmentBatch.cls:15 soql-without-user-mode, LegacyInvoiceImporter.cls:54 soql-injection |
| 3 | claude-haiku-5-5 | yes | 7/7 | 4/4 | 4 | 0/2 | 2 | 12 | 103 | 0.02 | - | LegacyInvoiceImporter.cls:54 soql-injection, LegacyInvoiceImporter.cls:57 empty-catch, ProductCatalogController.cls:17 soql-without-user-mode, TerritoryAssignmentBatch.cls:16 soql-without-user-mode |

`api_equivalent_usd` is what the run would cost on the Claude API. Runs made with a Claude subscription login are not charged per token.
