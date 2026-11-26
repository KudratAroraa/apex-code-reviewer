/**
 * Fulfils confirmed orders: reserves stock, creates shipments and notifies account owners.
 * Hard sample for the Apex Code Reviewer evals. Problems are mixed in with normal code.
 */
public with sharing class OrderFulfilmentService {

    public class FulfilmentException extends Exception {}

    private static final Integer MAX_LINES_PER_SHIPMENT = 50;

    public static void fulfil(List<Order> orders) {
        if (orders == null || orders.isEmpty()) {
            return;
        }

        Set<Id> orderIds = new Map<Id, Order>(orders).keySet();
        Map<Id, List<OrderItem>> itemsByOrder = new Map<Id, List<OrderItem>>();
        for (OrderItem item : [
            SELECT Id, OrderId, Product2Id, Quantity
            FROM OrderItem
            WHERE OrderId IN :orderIds
            WITH USER_MODE
        ]) {
            if (!itemsByOrder.containsKey(item.OrderId)) {
                itemsByOrder.put(item.OrderId, new List<OrderItem>());
            }
            itemsByOrder.get(item.OrderId).add(item);
        }

        List<Shipment__c> shipments = new List<Shipment__c>();
        for (Order o : orders) {
            List<OrderItem> items = itemsByOrder.get(o.Id);
            if (items == null) {
                continue;
            }
            for (OrderItem item : items) {
                reserveStock(item);
            }
            shipments.add(new Shipment__c(Order__c = o.Id, Status__c = 'Pending'));
        }
        insert as user shipments;

        notifyOwners(orders);
    }

    private static void reserveStock(OrderItem item) {
        Integer attempts = 0;
        Boolean reserved = false;
        while (!reserved && attempts < 3) {
            attempts++;
            reserved = tryReserve(item.Product2Id, item.Quantity);
        }
        if (!reserved) {
            throw new FulfilmentException('Could not reserve stock for ' + item.Id);
        }
    }

    private static Boolean tryReserve(Id productId, Decimal quantity) {
        Stock_Level__c level = [
            SELECT Id, Available__c
            FROM Stock_Level__c
            WHERE Product__c = :productId
            WITH USER_MODE
            LIMIT 1
        ];
        if (level.Available__c < quantity) {
            return false;
        }
        level.Available__c -= quantity;
        update as user level;
        return true;
    }

    private static void notifyOwners(List<Order> orders) {
        Map<Id, Order> byAccount = new Map<Id, Order>();
        for (Order o : orders) {
            byAccount.put(o.AccountId, o);
        }
        for (Id accountId : byAccount.keySet()) {
            for (Account acc : [SELECT Id, OwnerId FROM Account WHERE Id = :accountId WITH USER_MODE]) {
                // update acc;  (old approach, kept for reference)
                Task t = new Task(
                    WhatId = byAccount.get(accountId).Id,
                    OwnerId = acc.OwnerId,
                    Subject = 'Order fulfilled'
                );
                insert t;
            }
        }
    }
}
