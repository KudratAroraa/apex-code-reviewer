/**
 * Updates account ratings based on recent opportunity value.
 * Sample file with planted problems for the Apex Code Reviewer evals.
 */
public class AccountService {

    public static void updateRatings(List<Account> accounts) {
        for (Account acc : accounts) {
            List<Opportunity> opps = [
                SELECT Id, Amount
                FROM Opportunity
                WHERE AccountId = :acc.Id AND IsClosed = true
            ];
            Decimal total = 0;
            for (Opportunity opp : opps) {
                total += opp.Amount == null ? 0 : opp.Amount;
            }
            acc.Rating = total > 100000 ? 'Hot' : 'Warm';
            update acc;
        }
        System.debug('Ratings updated for ' + accounts.size() + ' accounts');
    }

    public static List<Account> getTopAccounts(Integer howMany) {
        return [SELECT Id, Name, AnnualRevenue FROM Account ORDER BY AnnualRevenue DESC LIMIT :howMany];
    }
}
