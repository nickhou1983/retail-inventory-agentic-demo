import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus/event-bus.js';
import { InventoryService } from '../src/inventory/inventory-service.js';
import { createAppContext } from '../src/server.js';
import { metrics } from '../src/observability/metrics.js';
import type { InventoryItem, OrderCancelledEvent } from '../src/types.js';

function stock(sku: string, availableQty: number, reservedQty: number): InventoryItem {
  return {
    sku,
    name: sku,
    availableQty,
    reservedQty,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

function cancellationEvent(orderId: string, sku: string, quantity: number): OrderCancelledEvent {
  return {
    eventId: `evt-${orderId}-${sku}`,
    idempotencyKey: `cancel:${orderId}:${sku}`,
    orderId,
    sku,
    quantity,
    occurredAt: new Date().toISOString(),
  };
}

function createEventContext(items: InventoryItem[]) {
  const eventBus = new EventBus();
  const inventoryService = new InventoryService(items);
  eventBus.subscribe('order.cancelled', async (event) => {
    await inventoryService.restockFromCancellation(event);
  });
  return { eventBus, inventoryService };
}

describe('Order cancellation and inventory restock', () => {
  it('restocks cancelled inventory within the local SLA', async () => {
    const { orderService, inventoryService } = createAppContext();
    const order = await orderService.createOrder('ORD-SLA', 'USER-01', 'SKU-IPHONE16-PRO', 2);
    assert.equal(order.status, 'CONFIRMED');

    const startedAt = performance.now();
    const cancelled = await orderService.cancelOrder('ORD-SLA');
    const elapsedMs = performance.now() - startedAt;

    assert.equal(cancelled.status, 'CANCELLED');
    assert.ok(elapsedMs < 500, `cancellation took ${elapsedMs.toFixed(1)}ms`);
    assert.deepEqual(
      {
        availableQty: inventoryService.getStock('SKU-IPHONE16-PRO')?.availableQty,
        reservedQty: inventoryService.getStock('SKU-IPHONE16-PRO')?.reservedQty,
      },
      { availableQty: 10, reservedQty: 0 }
    );
  });

  it('conserves stock across multiple partial cancellations for one order', async () => {
    const { eventBus, inventoryService } = createEventContext([
      stock('SKU-PHONE', 5, 3),
      stock('SKU-WATCH', 7, 4),
    ]);
    const events = [
      cancellationEvent('ORD-PARTIAL', 'SKU-PHONE', 1),
      cancellationEvent('ORD-PARTIAL', 'SKU-WATCH', 2),
    ];

    const initialTotals = inventoryService.listStock().map(({ sku, availableQty, reservedQty }) => [
      sku,
      availableQty + reservedQty,
    ]);
    await Promise.all(events.map((event) => eventBus.publish('order.cancelled', event)));

    assert.deepEqual(
      inventoryService.listStock().map(({ sku, availableQty, reservedQty }) => [
        sku,
        availableQty + reservedQty,
      ]),
      initialTotals
    );
    assert.deepEqual(
      events.map(({ sku }) => {
        const item = inventoryService.getStock(sku)!;
        return [item.availableQty, item.reservedQty];
      }),
      [
        [6, 2],
        [9, 2],
      ]
    );
  });

  it('applies a replayed cancellation event once and records duplicate skips', async () => {
    const { eventBus, inventoryService } = createEventContext([stock('SKU-REPLAY', 8, 2)]);
    const outcomes: Array<{ applied: boolean; reason?: string }> = [];
    eventBus.subscribe('order.cancelled', async (event) => {
      outcomes.push(await inventoryService.restockFromCancellation(event));
    });
    const event = cancellationEvent('ORD-REPLAY', 'SKU-REPLAY', 2);

    await eventBus.publish('order.cancelled', event);
    await eventBus.publish('order.cancelled', event);
    await eventBus.publish('order.cancelled', event);

    assert.deepEqual(
      outcomes.map(({ applied, reason }) => ({ applied, reason })),
      [
        { applied: true, reason: undefined },
        { applied: false, reason: 'DUPLICATE_EVENT' },
        { applied: false, reason: 'DUPLICATE_EVENT' },
      ]
    );
    assert.deepEqual(
      {
        availableQty: inventoryService.getStock('SKU-REPLAY')?.availableQty,
        reservedQty: inventoryService.getStock('SKU-REPLAY')?.reservedQty,
      },
      { availableQty: 10, reservedQty: 0 }
    );
    assert.deepEqual(
      inventoryService.getAuditLogs().map(({ status }) => status),
      ['RESTOCKED', 'DUPLICATE_SKIPPED', 'DUPLICATE_SKIPPED']
    );
  });

  it('preserves a hot SKU balance across 30 concurrent cancellations, reservations, and transient timeouts', async () => {
    const { eventBus, inventoryService } = createEventContext([stock('SKU-HOT', 30, 30)]);
    inventoryService.injectTransientDbTimeouts(2);
    const events = Array.from({ length: 30 }, (_, index) =>
      cancellationEvent(`ORD-HOT-${index}`, 'SKU-HOT', 1)
    );

    await Promise.all([
      Promise.all(events.map((event) => eventBus.publish('order.cancelled', event))),
      Promise.all(Array.from({ length: 30 }, () => inventoryService.reserveStock('SKU-HOT', 1))),
    ]);

    assert.deepEqual(
      {
        availableQty: inventoryService.getStock('SKU-HOT')?.availableQty,
        reservedQty: inventoryService.getStock('SKU-HOT')?.reservedQty,
        version: inventoryService.getStock('SKU-HOT')?.version,
      },
      { availableQty: 30, reservedQty: 30, version: 61 }
    );
    assert.equal(eventBus.getDeadLetterQueue().length, 0);
  });

  it('routes exhausted transient failures to the DLQ and raises its alert metric', async () => {
    metrics.reset();
    const { eventBus, inventoryService } = createEventContext([stock('SKU-DLQ', 0, 1)]);
    inventoryService.injectTransientDbTimeouts(10);
    const event = cancellationEvent('ORD-DLQ', 'SKU-DLQ', 1);

    await eventBus.publish('order.cancelled', event);

    const [deadLetter] = eventBus.getDeadLetterQueue();
    assert.ok(deadLetter);
    assert.equal(deadLetter.topic, 'inventory.restock.dlq');
    assert.equal(deadLetter.payload.idempotencyKey, event.idempotencyKey);
    assert.ok(deadLetter.attempts > 1);
    assert.equal(metrics.get('inventory_restock_dlq_alerts_total'), 1);
    assert.equal(inventoryService.getAuditLogs().at(-1)?.status, 'DLQ_ROUTED');
  });
});
