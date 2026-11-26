# Eval results

Each eval writes a `.md` table for people to read and a `.json` file with the same scores. Folders ending in `-runs` hold the `apex-review.json` that Claude wrote in each run, so every score can be checked or re-scored.

All runs used 3 repeats unless marked "1 run". Times are in UTC.

## Basic set (`samples/`, 13 problems)

| Setup | File |
|---|---|
| Opus, plugin v1 | `2026-11-25T01-58-03-724Z-plugin.md` |
| Haiku, plugin v1 | `2026-11-25T02-01-12-501Z-plugin-haiku.md` |
| Opus, no plugin | `2026-11-25T02-04-07-829Z-baseline.md` |
| Haiku, no plugin | `2026-11-25T02-07-18-416Z-baseline-haiku.md` |
| Haiku, plugin v2 | `2026-11-25T04-20-16-074Z-v2-plugin-haiku.md` |

## Hard set (`samples-hard/`, 13 problems)

| Setup | File | Run reports |
|---|---|---|
| Haiku, plugin v1 | `2026-11-25T04-02-28-241Z-plugin-haiku-hard.md` | `recovered-plugin-haiku-hard-runs/` |
| Haiku, no plugin | `2026-11-25T04-02-28-297Z-baseline-haiku-hard.md` | `recovered-baseline-haiku-hard-runs/` |
| Opus, plugin v1 | `2026-11-25T04-02-28-345Z-plugin-hard.md` | `recovered-plugin-hard-runs/` |
| Opus, no plugin | `2026-11-25T04-02-28-393Z-baseline-hard.md` | `...-baseline-hard-runs/` |
| Haiku, plugin v2 | `2026-11-25T04-08-29-064Z-v2-plugin-haiku-hard.md` | `...-v2-plugin-haiku-hard-runs/` |
| Opus, plugin v2 | `2026-11-25T04-14-33-811Z-v2-plugin-hard.md` | `...-v2-plugin-hard-runs/` |

The first three hard-set results were re-scored with the corrected answer key from the reports Claude had already written, so they were not run again. Those reports are the `recovered-*-runs` folders. The scores from the original key are in `answer-key-v1/`.

## Live check runs (1 run each, recorded for the evidence screenshots)

| Setup | File |
|---|---|
| Haiku, plugin v2, hard set | `2026-11-25T23-34-22-910Z-plugin-haiku-hard.md` |
| Haiku, no plugin, hard set | `2026-11-25T23-55-19-987Z-baseline-haiku-hard.md` |
