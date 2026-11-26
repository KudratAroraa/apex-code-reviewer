/**
 * Marks qualified leads and assigns them to their region's queue.
 * Sample file written to best practice: the reviewer should find nothing.
 */
public with sharing class LeadConversionService {

    public static void assignQualified(List<Lead> leads) {
        Set<String> regions = new Set<String>();
        for (Lead l : leads) {
            if (l.Region__c != null) {
                regions.add(l.Region__c);
            }
        }

        Map<String, Id> queueByRegion = new Map<String, Id>();
        for (Group g : [
            SELECT Id, DeveloperName
            FROM Group
            WHERE Type = 'Queue' AND DeveloperName IN :regions
            WITH USER_MODE
        ]) {
            queueByRegion.put(g.DeveloperName, g.Id);
        }

        List<Lead> toUpdate = new List<Lead>();
        for (Lead l : leads) {
            if (l.Status == 'Qualified' && queueByRegion.containsKey(l.Region__c)) {
                toUpdate.add(new Lead(Id = l.Id, OwnerId = queueByRegion.get(l.Region__c)));
            }
        }
        update as user toUpdate;
    }
}
