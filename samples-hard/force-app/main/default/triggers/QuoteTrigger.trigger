/**
 * Routes Quote trigger events to the handler class.
 * Hard sample for the Apex Code Reviewer evals.
 */
trigger QuoteTrigger on Quote (before insert, after update) {
    if (Trigger.isBefore && Trigger.isInsert) {
        QuoteTriggerHandler.beforeInsert(Trigger.new);
    }
    if (Trigger.isAfter && Trigger.isUpdate) {
        QuoteTriggerHandler.afterUpdate(Trigger.new, Trigger.oldMap);
    }
}
