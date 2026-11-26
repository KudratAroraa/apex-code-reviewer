/**
 * Backs a contact search page. Users type part of a surname.
 * Sample file with planted problems for the Apex Code Reviewer evals.
 */
public with sharing class ContactSearchController {

    public String searchTerm { get; set; }
    public List<Contact> results { get; private set; }

    public void search() {
        String query = 'SELECT Id, FirstName, LastName, Email FROM Contact '
            + 'WHERE LastName LIKE \'%' + searchTerm + '%\' WITH USER_MODE LIMIT 50';
        try {
            results = Database.query(query);
        } catch (QueryException e) {
        }
    }
}
