/**
 * Backs the product catalogue page: keyword search, family filter and sorting.
 * Hard sample for the Apex Code Reviewer evals.
 */
public with sharing class ProductCatalogController {

    private static final Set<String> SORTABLE = new Set<String>{ 'Name', 'ProductCode', 'CreatedDate' };

    @AuraEnabled(cacheable=true)
    public static List<Product2> search(String keyword, String sortField) {
        String safeSort = SORTABLE.contains(sortField) ? sortField : 'Name';
        String soql = 'SELECT Id, Name, ProductCode, Family FROM Product2 WHERE IsActive = true';
        if (String.isNotBlank(keyword)) {
            soql += ' AND Name LIKE \'%' + keyword + '%\'';
        }
        soql += ' ORDER BY ' + safeSort + ' LIMIT 200';
        return Database.query(soql);
    }

    @AuraEnabled(cacheable=true)
    public static List<Product2> byFamily(String family) {
        Map<String, Object> binds = new Map<String, Object>{ 'family' => family };
        return Database.queryWithBinds(
            'SELECT Id, Name, ProductCode FROM Product2 WHERE Family = :family',
            binds,
            AccessLevel.USER_MODE
        );
    }

    @AuraEnabled
    public static Product2 getDetails(Id productId) {
        try {
            return [SELECT Id, Name, Description, Family FROM Product2 WHERE Id = :productId];
        } catch (QueryException e) {
            return null;
        }
    }
}
