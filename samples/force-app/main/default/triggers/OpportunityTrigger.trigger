/**
 * Sets the partner record type on large opportunities.
 * Sample file with planted problems for the Apex Code Reviewer evals.
 */
trigger OpportunityTrigger on Opportunity (before insert, before update) {
    Opportunity opp = Trigger.new[0];
    if (opp.Amount != null && opp.Amount > 500000) {
        opp.RecordTypeId = '0125g000000ABCDAAA';
    }
}
