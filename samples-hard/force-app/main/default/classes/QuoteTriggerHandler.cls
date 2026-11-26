/**
 * Trigger handler for Quote. Applies the partner discount to new quotes.
 * Hard sample for the Apex Code Reviewer evals.
 */
public with sharing class QuoteTriggerHandler {

    private static final Decimal PARTNER_DISCOUNT = 10;

    public static void beforeInsert(List<Quote> newQuotes) {
        Quote quote = newQuotes[0];
        if (quote.Partner_Deal__c == true) {
            quote.Discount = PARTNER_DISCOUNT;
        }
    }

    public static void afterUpdate(List<Quote> newQuotes, Map<Id, Quote> oldMap) {
        List<Opportunity> toUpdate = new List<Opportunity>();
        for (Quote q : newQuotes) {
            Quote previous = oldMap.get(q.Id);
            if (q.Status == 'Accepted' && previous.Status != 'Accepted') {
                toUpdate.add(new Opportunity(Id = q.OpportunityId, StageName = 'Negotiation'));
            }
        }
        if (!toUpdate.isEmpty()) {
            update as user toUpdate;
        }
    }
}
