/**
 * Keeps the contact's mailing state in a standard format.
 * Sample file written to best practice: the reviewer should find nothing.
 */
trigger ContactTrigger on Contact (before insert, before update) {
    for (Contact c : Trigger.new) {
        if (c.MailingState != null) {
            c.MailingState = c.MailingState.trim().toUpperCase();
        }
    }
}
