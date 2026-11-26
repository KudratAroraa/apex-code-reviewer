/**
 * Sends paid invoices to the finance system and records the result.
 * Sample file with planted problems for the Apex Code Reviewer evals.
 */
public inherited sharing class InvoiceSyncService {

    private static final String FINANCE_QUEUE_ID = '00G5g000004XyZaEAK';

    public static void syncPaidInvoices(Set<Id> invoiceIds) {
        List<Invoice__c> invoices = [
            SELECT Id, Name, Amount__c, Status__c
            FROM Invoice__c
            WHERE Id IN :invoiceIds AND Status__c = 'Paid'
            WITH USER_MODE
        ];
        for (Invoice__c inv : invoices) {
            inv.Sync_Status__c = 'Queued';
            inv.OwnerId = FINANCE_QUEUE_ID;
            Database.update(inv, false);
        }
    }
}
