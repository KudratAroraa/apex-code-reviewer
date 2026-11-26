/**
 * Escalates accounts that have too many open cases.
 * Sample file: looks clean to pattern rules, but the helper query runs once per account.
 */
public with sharing class CaseEscalationService {

    public static void escalate(List<Account> accounts) {
        List<Account> toEscalate = new List<Account>();
        for (Account acc : accounts) {
            if (countOpenCases(acc.Id) > 5) {
                acc.Escalated__c = true;
                toEscalate.add(acc);
            }
        }
        update toEscalate;
    }

    private static Integer countOpenCases(Id accountId) {
        return [SELECT COUNT() FROM Case WHERE AccountId = :accountId AND IsClosed = false WITH USER_MODE];
    }
}
