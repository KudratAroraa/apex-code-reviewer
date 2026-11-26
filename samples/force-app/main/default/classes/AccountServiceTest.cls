/**
 * Tests for AccountService.
 * Sample file: debug statements and system-mode queries are normal in tests,
 * so the reviewer should find nothing here.
 */
@isTest
private class AccountServiceTest {

    @isTest
    static void marksHighValueAccountsAsHot() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;
        insert new Opportunity(Name = 'Big deal', AccountId = acc.Id, Amount = 250000,
            StageName = 'Closed Won', CloseDate = Date.today());

        Test.startTest();
        AccountService.updateRatings(new List<Account>{ acc });
        Test.stopTest();

        Account result = [SELECT Rating FROM Account WHERE Id = :acc.Id];
        System.debug(result);
        System.assertEquals('Hot', result.Rating);
    }
}
