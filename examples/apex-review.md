# Apex review: `force-app`

## Summary

I reviewed 8 Apex files (6 classes, including 1 test class, and 2 triggers) and confirmed **13 findings: 6 high, 5 medium and 2 low**. I dismissed none of the scanner's findings. One high finding came from reading the code rather than from the scanner: a query in a helper method that runs once per loop iteration in `CaseEscalationService`. **The code is not ready to deploy.** Four files can hit governor limits or skip records when they process data in bulk, and the contact search can be manipulated through SOQL injection. `LeadConversionService` and `ContactTrigger` are clean.

## Confirmed findings

| Severity | File | Line | Rule | Explanation |
|---|---|---|---|---|
| high | classes/AccountService.cls | 9 | soql-in-loop | The Opportunity query runs once per account, so more than 100 accounts exceed the query limit. |
| high | classes/AccountService.cls | 19 | dml-in-loop | `update acc` runs once per account, so more than 150 accounts exceed the DML limit. |
| high | classes/CaseEscalationService.cls | 10 | soql-in-loop | `countOpenCases()` runs a query and is called once per account inside the loop (found by reading the code). |
| high | classes/ContactSearchController.cls | 14 | soql-injection | User input `searchTerm` is joined straight into the query text. |
| high | classes/InvoiceSyncService.cls | 19 | dml-in-loop | `Database.update(inv, false)` runs once per invoice. |
| high | triggers/OpportunityTrigger.trigger | 6 | trigger-not-bulkified | Only `Trigger.new[0]` is processed. Other records in the batch are skipped. |
| medium | classes/AccountService.cls | 5 | missing-sharing | The class has no sharing keyword. |
| medium | classes/AccountService.cls | 9 | soql-without-user-mode | The query ignores the user's permissions. |
| medium | classes/AccountService.cls | 25 | soql-without-user-mode | `getTopAccounts` returns revenue data without checking the user's permissions. |
| medium | classes/InvoiceSyncService.cls | 7 | hardcoded-id | The finance queue ID is specific to one org. |
| medium | triggers/OpportunityTrigger.trigger | 8 | hardcoded-id | The record type ID is specific to one org. |
| low | classes/ContactSearchController.cls | 15 | empty-catch | The `QueryException` is caught and silently ignored. |
| low | classes/AccountService.cls | 21 | debug-statement | A `System.debug` call is left in the code. |

## Fixes for high severity findings

### AccountService.cls: lines 9 and 19 (soql-in-loop, dml-in-loop)

Before:
```apex
for (Account acc : accounts) {
    List<Opportunity> opps = [SELECT Id, Amount FROM Opportunity
                              WHERE AccountId = :acc.Id AND IsClosed = true];
    ...
    update acc;
}
```
After:
```apex
Map<Id, Decimal> totals = new Map<Id, Decimal>();
for (AggregateResult ar : [SELECT AccountId, SUM(Amount) total FROM Opportunity
                           WHERE AccountId IN :accounts AND IsClosed = true
                           WITH USER_MODE GROUP BY AccountId]) {
    totals.put((Id) ar.get('AccountId'), (Decimal) ar.get('total'));
}
for (Account acc : accounts) {
    Decimal total = totals.containsKey(acc.Id) && totals.get(acc.Id) != null ? totals.get(acc.Id) : 0;
    acc.Rating = total > 100000 ? 'Hot' : 'Warm';
}
update accounts;
```

### CaseEscalationService.cls: line 10 (soql-in-loop through a helper method)

Before:
```apex
for (Account acc : accounts) {
    if (countOpenCases(acc.Id) > 5) { ... }   // each call runs a query
}
```
After:
```apex
Map<Id, Integer> openCases = new Map<Id, Integer>();
for (AggregateResult ar : [SELECT AccountId, COUNT(Id) cnt FROM Case
                           WHERE AccountId IN :accounts AND IsClosed = false
                           WITH USER_MODE GROUP BY AccountId]) {
    openCases.put((Id) ar.get('AccountId'), (Integer) ar.get('cnt'));
}
for (Account acc : accounts) {
    if (openCases.containsKey(acc.Id) && openCases.get(acc.Id) > 5) { ... }
}
```

### ContactSearchController.cls: line 14 (soql-injection)

Before:
```apex
String query = 'SELECT Id, FirstName, LastName, Email FROM Contact '
    + 'WHERE LastName LIKE \'%' + searchTerm + '%\' WITH USER_MODE LIMIT 50';
results = Database.query(query);
```
After:
```apex
String pattern = '%' + searchTerm + '%';
results = [SELECT Id, FirstName, LastName, Email FROM Contact
           WHERE LastName LIKE :pattern WITH USER_MODE LIMIT 50];
```

### InvoiceSyncService.cls: line 19 (dml-in-loop)

Before:
```apex
for (Invoice__c inv : invoices) {
    inv.Sync_Status__c = 'Queued';
    inv.OwnerId = FINANCE_QUEUE_ID;
    Database.update(inv, false);
}
```
After:
```apex
for (Invoice__c inv : invoices) {
    inv.Sync_Status__c = 'Queued';
    inv.OwnerId = financeQueueId;
}
Database.SaveResult[] results = Database.update(invoices, false);
// check results and log any failures
```

### OpportunityTrigger.trigger: line 6 (trigger-not-bulkified)

Before:
```apex
Opportunity opp = Trigger.new[0];
if (opp.Amount != null && opp.Amount > 500000) {
    opp.RecordTypeId = '0125g000000ABCDAAA';
}
```
After:
```apex
Id partnerRt = Schema.SObjectType.Opportunity
    .getRecordTypeInfosByDeveloperName().get('Partner').getRecordTypeId();
for (Opportunity opp : Trigger.new) {
    if (opp.Amount != null && opp.Amount > 500000) {
        opp.RecordTypeId = partnerRt;
    }
}
```
(Replace `'Partner'` with the record type's actual developer name.)

## Dismissed findings

None. I checked every scanner finding against the code and confirmed it.

## Notes

- `InvoiceSyncService.cls` line 19: `Database.update(..., false)` throws away the `SaveResult`, so failed invoice updates are lost without a trace. Check the results and log or retry failures.
- `AccountService.cls` line 19 and `CaseEscalationService.cls` line 15: these updates run in system mode. Consider `update as user` to match the user-mode queries used elsewhere in the project.
- `ContactSearchController.cls` line 12: when `searchTerm` is null, the query becomes `LIKE '%null%'`. Check for blank input before querying.
- `LeadConversionService.cls` and `ContactTrigger.trigger` follow best practice. I found no issues in them.
