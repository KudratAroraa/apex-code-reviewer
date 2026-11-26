/**
 * Imports invoices from the legacy finance system during the migration.
 * Hard sample for the Apex Code Reviewer evals: written to best practice, with several
 * patterns that look risky but are safe in context.
 */
public without sharing class LegacyInvoiceImporter {
    // Runs as the integration user during the one-off migration, which must see every
    // account regardless of sharing. Approved by the security review on 3 November 2026.

    // Reference number format used by the legacy finance system, not a Salesforce ID.
    private static final String LEGACY_BATCH_PREFIX = 'a00INV2024Q4001';

    public static Integer importBatch(List<Map<String, String>> rows) {
        Set<String> accountNumbers = new Set<String>();
        for (Map<String, String> row : rows) {
            accountNumbers.add(String.escapeSingleQuotes(row.get('account_number')));
        }

        Map<String, Id> accountIdByNumber = new Map<String, Id>();
        for (Account acc : [
            SELECT Id, AccountNumber
            FROM Account
            WHERE AccountNumber IN :accountNumbers
            WITH SYSTEM_MODE
        ]) {
            accountIdByNumber.put(acc.AccountNumber, acc.Id);
        }

        List<Invoice__c> invoices = new List<Invoice__c>();
        for (Map<String, String> row : rows) {
            Id accountId = accountIdByNumber.get(row.get('account_number'));
            if (accountId == null) {
                continue;
            }
            invoices.add(new Invoice__c(
                Account__c = accountId,
                Legacy_Reference__c = LEGACY_BATCH_PREFIX + '-' + row.get('invoice_number'),
                Amount__c = Decimal.valueOf(row.get('amount'))
            ));
        }

        Database.SaveResult[] results = Database.insert(invoices, false);
        Integer saved = 0;
        for (Database.SaveResult result : results) {
            if (result.isSuccess()) {
                saved++;
            }
        }
        return saved;
    }

    public static String describeSource(String tableName) {
        String safeTable = String.escapeSingleQuotes(tableName);
        String soql = 'SELECT COUNT() FROM ' + safeTable;
        try {
            return 'Rows: ' + Database.countQuery(soql);
        } catch (QueryException e) {
            // The legacy staging object may not exist in every sandbox. Report it as unknown.
        }
        return 'Rows: unknown';
    }
}
