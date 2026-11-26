# Apex review rules

Generated from `src/rules.ts` by `npm run docs`. Do not edit by hand.

| Rule ID | Severity | Category | Title |
|---|---|---|---|
| `soql-in-loop` | high | governor limits | SOQL query inside a loop |
| `dml-in-loop` | high | governor limits | DML statement inside a loop |
| `soql-injection` | high | security | Dynamic SOQL built by string concatenation |
| `trigger-not-bulkified` | high | governor limits | Trigger handles only the first record |
| `hardcoded-id` | medium | quality | Hardcoded Salesforce record ID |
| `missing-sharing` | medium | security | Class does not declare a sharing mode |
| `soql-without-user-mode` | medium | security | Query does not enforce user permissions |
| `empty-catch` | low | quality | Empty catch block |
| `debug-statement` | low | quality | System.debug left in code |

## `soql-in-loop`: SOQL query inside a loop

**Severity:** high · **Category:** governor limits

**Why it matters.** Salesforce allows 100 SOQL queries per transaction. A query inside a loop runs once per record, so the code fails with a LimitException as soon as more than about 100 records are processed, for example in a data load.

**How to fix.** Collect the IDs you need before the loop, run one query with `WHERE Id IN :ids`, and store the results in a Map for lookups inside the loop.

## `dml-in-loop`: DML statement inside a loop

**Severity:** high · **Category:** governor limits

**Why it matters.** Salesforce allows 150 DML statements per transaction. Inserting, updating or deleting records one at a time inside a loop fails on bulk data and is much slower than one bulk operation.

**How to fix.** Add the records to a List inside the loop and run a single insert, update, upsert or delete on the whole list after the loop.

## `soql-injection`: Dynamic SOQL built by string concatenation

**Severity:** high · **Category:** security

**Why it matters.** Building a query string by joining in variable values lets an attacker change the query (SOQL injection), for example to read records they should not see.

**How to fix.** Use a bind variable (`:name`) with `Database.queryWithBinds`, or at minimum wrap user input in `String.escapeSingleQuotes()`.

## `trigger-not-bulkified`: Trigger handles only the first record

**Severity:** high · **Category:** governor limits

**Why it matters.** Triggers receive up to 200 records at once. Code that reads only `Trigger.new[0]` silently ignores every other record in a bulk insert or data load.

**How to fix.** Loop over `Trigger.new` (or use `Trigger.newMap`) so every record in the batch is handled.

## `hardcoded-id`: Hardcoded Salesforce record ID

**Severity:** medium · **Category:** quality

**Why it matters.** Record IDs are different in every org. A hardcoded ID works in the developer's sandbox and breaks after deployment to test or production.

**How to fix.** Look the record up by a stable value such as DeveloperName, or store the value in Custom Metadata or a Custom Setting.

## `missing-sharing`: Class does not declare a sharing mode

**Severity:** medium · **Category:** security

**Why it matters.** A class without `with sharing` can run without the user's record sharing rules, so users may see or change records they are not allowed to.

**How to fix.** Declare `with sharing` by default, or `inherited sharing` for utility classes. Use `without sharing` only on purpose, with a comment explaining why.

## `soql-without-user-mode`: Query does not enforce user permissions

**Severity:** medium · **Category:** security

**Why it matters.** By default Apex queries ignore the running user's object and field permissions, so data the user cannot normally see can be returned and shown.

**How to fix.** Add `WITH USER_MODE` to the query (or `WITH SECURITY_ENFORCED`), or pass `AccessLevel.USER_MODE` to Database methods.

## `empty-catch`: Empty catch block

**Severity:** low · **Category:** quality

**Why it matters.** An empty catch block hides the error, so a failed save or callout goes unnoticed and is very hard to debug later.

**How to fix.** Log the exception, rethrow it, or handle it properly. If ignoring it is intended, add a comment explaining why.

## `debug-statement`: System.debug left in code

**Severity:** low · **Category:** quality

**Why it matters.** Debug statements add noise to logs and use CPU time in production, and can write sensitive values to the debug log.

**How to fix.** Remove debug statements before deployment, or use a logging framework that can be switched off.
