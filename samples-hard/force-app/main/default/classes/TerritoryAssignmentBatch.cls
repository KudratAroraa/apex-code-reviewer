/**
 * Nightly batch that assigns accounts to the right territory owner by postcode.
 * Hard sample for the Apex Code Reviewer evals.
 */
public with sharing class TerritoryAssignmentBatch implements Database.Batchable<SObject>, Database.Stateful {

    private Integer processed = 0;

    private static final Map<String, Id> OWNER_BY_REGION = new Map<String, Id>{
        'NORTH' => '0055g00000AbCdEAAZ',
        'SOUTH' => '0055g00000XyZwVAAZ'
    };

    public Database.QueryLocator start(Database.BatchableContext ctx) {
        return Database.getQueryLocator(
            'SELECT Id, BillingPostalCode, OwnerId FROM Account WHERE BillingPostalCode != null'
        );
    }

    public void execute(Database.BatchableContext ctx, List<Account> scope) {
        for (Account acc : scope) {
            String region = regionFor(acc.BillingPostalCode);
            if (region != null && OWNER_BY_REGION.containsKey(region)) {
                assignOwner(acc, OWNER_BY_REGION.get(region));
            }
        }
    }

    public void finish(Database.BatchableContext ctx) {
        System.debug('Territory batch processed ' + processed + ' accounts');
    }

    private String regionFor(String postcode) {
        if (String.isBlank(postcode)) {
            return null;
        }
        Integer code = Integer.valueOf(postcode.left(1));
        return code <= 4 ? 'NORTH' : 'SOUTH';
    }

    private void assignOwner(Account acc, Id ownerId) {
        if (acc.OwnerId != ownerId) {
            acc.OwnerId = ownerId;
            update acc;
            processed++;
        }
    }
}
