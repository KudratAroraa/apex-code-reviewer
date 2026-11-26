# Apex review: `force-app`

## Summary

I reviewed 8 Apex files: 6 classes, one of them a test class, and 2 triggers. There are **13 confirmed findings**: **6 high**, **5 medium** and **2 low**. 12 came from the scanner and 1 came from reading the code: a query in a helper method that is called from inside a loop in `CaseEscalationService`. No scanner findings were dismissed. **The code is not ready to deploy.** Four of the high findings break governor limits once more than 100–150 records are processed. One is a SOQL injection hole in a user-facing search page. The Opportunity trigger silently skips every record after the first. `LeadConversionService`, `ContactTrigger` and `AccountServiceTest` had no findings.

## Confirmed findings

| Severity | File | Line | Rule | Explanation |
|---|---|---|---|---|
| high | `classes/AccountService.cls` | 9 | `soql-in-loop` | Opportunity query runs once per account; >100 accounts hits the query limit. |
| high | `classes/AccountService.cls` | 19 | `dml-in-loop` | `update acc` runs once per account; >150 accounts hits the DML limit. |
| high | `classes/CaseEscalationService.cls` | 10 | `soql-in-loop` | `countOpenCases()` is called in the loop and queries on every call (line 19). *Found by review.* |
| high | `classes/InvoiceSyncService.cls` | 19 | `dml-in-loop` | `Database.update(inv, false)` runs once per invoice. |
| high | `classes/ContactSearchController.cls` | 14 | `soql-injection` | User input `searchTerm` is joined into the query text (lines 11–12). |
| high | `triggers/OpportunityTrigger.trigger` | 6 | `trigger-not-bulkified` | Only `Trigger.new[0]` is processed; the rest of the batch is skipped. |
| medium | `classes/AccountService.cls` | 5 | `missing-sharing` | No sharing keyword on the class. |
| medium | `classes/AccountService.cls` | 9 | `soql-without-user-mode` | Query ignores the user's object and field permissions. |
| medium | `classes/AccountService.cls` | 25 | `soql-without-user-mode` | `getTopAccounts` query ignores the user's permissions. |
| medium | `classes/InvoiceSyncService.cls` | 7 | `hardcoded-id` | Finance queue ID only exists in one org. |
| medium | `triggers/OpportunityTrigger.trigger` | 8 | `hardcoded-id` | Record type ID differs between orgs. |
| low | `classes/ContactSearchController.cls` | 15 | `empty-catch` | `QueryException` is swallowed silently. |
| low | `classes/AccountService.cls` | 21 | `debug-statement` | `System.debug` left in production code. |

All paths are under `force-app/main/default/`.

## Fixes for high severity findings

### AccountService.cls lines 9 and 19: query and DML in loop

Before:
```apex
for (Account acc : accounts) {
    List<Opportunity> opps = [SELECT Id, Amount FROM Opportunity
                              WHERE AccountId = :acc.Id AND IsClosed = true];
    Decimal total = 0;
    for (Opportunity opp : opps) { total += opp.Amount == null ? 0 : opp.Amount; }
    acc.Rating = total > 100000 ? 'Hot' : 'Warm';
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
update as user accounts;
```

### CaseEscalationService.cls line 10: helper query called in loop

Before:
```apex
for (Account acc : accounts) {
    if (countOpenCases(acc.Id) > 5) { ... }
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
    Integer n = openCases.get(acc.Id);
    if (n != null && n > 5) {
        acc.Escalated__c = true;
        toEscalate.add(acc);
    }
}
```

### InvoiceSyncService.cls line 19: DML in loop

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
List<Database.SaveResult> results = Database.update(invoices, false, AccessLevel.USER_MODE);
// inspect results for failures
```

### ContactSearchController.cls line 14: SOQL injection

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

### OpportunityTrigger.trigger line 6: trigger not bulkified

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

## Dismissed findings

None. Every scanner finding held up when I read the code.

## Notes

- **DML in system mode:** `AccountService` line 19, `CaseEscalationService` line 15 and `InvoiceSyncService` line 19 save records without enforcing the user's permissions. Consider `update as user`, as `LeadConversionService` line 31 does.
- **Ignored save results:** `InvoiceSyncService` uses `Database.update(..., false)` and discards the `SaveResult`, so failed updates are lost silently.
- **Blank search input:** in `ContactSearchController`, a null `searchTerm` makes the query search for the literal text `null`. Check for blank input before querying.
- **No bulk test:** `AccountServiceTest` tests only one account. Add a 200-record test so limit problems are caught.
- **Clean files:** `LeadConversionService` and `ContactTrigger` follow best practice.
