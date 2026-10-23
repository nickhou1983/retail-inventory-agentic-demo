import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../src/server.js';
import { OrderCancelledEvent } from '../src/types.js';

const sku = 'SKU-IPHONE16-PRO';

function cancellationEvent(orderId: string, quantity: number): OrderCancelledEvent {
  return {
    eventId: `${orderId}:cancelled`,
    idempotencyKey: `cancel:${orderId}:${sku}`,
    orderId,
    sku,
    quantity,
    occurredAt: new Date().toISOString(),
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      assert.fail(`Condition was not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('Retail Order & Inventory Cancellation', () => {
  it('reserves inventory and asynchronously restocks on cancellation within the unit-test SLA', async () => {
    const { orderService, inventoryService } = createAppContext();

    const before = inventoryService.getStock(sku)!;
    assert.equal(before.availableQty, 10);

    const order = await orderService.createOrder('ORD-1001', 'USER-01', sku, 2);
    assert.equal(order.status, 'CONFIRMED');

    const afterOrder = inventoryService.getStock(sku)!;
    assert.equal(afterOrder.availableQty, 8);
    assert.equal(afterOrder.reservedQty, 2);

    const startedAt = Date.now();
    const cancelled = await orderService.cancelOrder('ORD-1001');
    assert.equal(cancelled.status, 'CANCELLED');
    await waitFor(() => inventoryService.getStock(sku)!.availableQty === 10);
    assert.ok(Date.now() - startedAt < 500);
    assert.equal(inventoryService.getStock(sku)!.reservedQty, 0);
  });

  it('preserves stock while risk cancellations and a normal order interleave', async () => {
    const { orderService, inventoryService } = createAppContext();

    await Promise.all([
      orderService.createOrder('RISK-01', 'RISK', sku, 1),
      orderService.createOrder('RISK-02', 'RISK', sku, 1),
      orderService.createOrder('RISK-03', 'RISK', sku, 1),
      orderService.createOrder('USER-EXISTING', 'USER', sku, 2),
    ]);

    await Promise.all([
      orderService.cancelOrder('RISK-01', 'Risk batch cancellation'),
      orderService.cancelOrder('RISK-02', 'Risk batch cancellation'),
      orderService.cancelOrder('RISK-03', 'Risk batch cancellation'),
      orderService.createOrder('USER-CONCURRENT', 'USER', sku, 2),
    ]);

    await waitFor(() => {
      const stock = inventoryService.getStock(sku)!;
      return stock.availableQty === 6 && stock.reservedQty === 4;
    });
    const finalStock = inventoryService.getStock(sku)!;
    assert.equal(finalStock.availableQty + finalStock.reservedQty, 10);
    assert.equal(finalStock.availableQty, 6);
    assert.equal(finalStock.reservedQty, 4);
  });

  it('applies the same cancellation event only once across three deliveries', async () => {
    const { orderService, inventoryService } = createAppContext();
    await orderService.createOrder('RISK-REPLAY', 'RISK', sku, 2);

    const event = cancellationEvent('RISK-REPLAY', 2);
    const results = await Promise.all([
      inventoryService.restockFromCancellation(event),
      inventoryService.restockFromCancellation(event),
      inventoryService.restockFromCancellation(event),
    ]);

    assert.equal(results.filter((result) => result.applied).length, 1);
    assert.deepEqual(
      results.filter((result) => !result.applied).map((result) => result.reason),
      ['DUPLICATE_EVENT', 'DUPLICATE_EVENT']
    );
    assert.equal(inventoryService.getStock(sku)!.availableQty, 10);
    assert.equal(inventoryService.getStock(sku)!.reservedQty, 0);
    assert.equal(
      inventoryService.getAuditLogs().filter((entry) => entry.status === 'DUPLICATE_SKIPPED').length,
      2
    );
  });

  it('isolates insufficient reservations and exhausted DB timeouts in the dead-letter queue', async () => {
    const { eventBus, orderService, inventoryService, metrics } = createAppContext();
    const alertCount = metrics.get('inventory_restock_dlq_alerts_total');

    await assert.rejects(
      orderService.createOrder('OUT-OF-STOCK', 'USER', sku, 11),
      /Insufficient stock/
    );
    assert.equal(orderService.getOrder('OUT-OF-STOCK'), undefined);
    assert.equal(inventoryService.getStock(sku)!.availableQty, 10);

    await eventBus.publish('order.cancelled', cancellationEvent('UNRESERVED', 1));
    const insufficientDlq = eventBus.getDeadLetterQueue()[0]!;
    assert.equal(insufficientDlq.topic, 'inventory.restock.dlq');
    assert.equal(insufficientDlq.payload.orderId, 'UNRESERVED');
    assert.equal(insufficientDlq.attempts, 4);
    assert.equal(inventoryService.getStock(sku)!.availableQty, 10);

    await orderService.createOrder('DB-TIMEOUT', 'USER', sku, 1);
    inventoryService.injectTransientDbTimeouts(4);
    await eventBus.publish('order.cancelled', cancellationEvent('DB-TIMEOUT', 1));
    const timeoutDlq = eventBus.getDeadLetterQueue()[1]!;
    assert.equal(timeoutDlq.topic, 'inventory.restock.dlq');
    assert.equal(timeoutDlq.payload.orderId, 'DB-TIMEOUT');
    assert.equal(timeoutDlq.attempts, 4);
    assert.equal(inventoryService.getStock(sku)!.availableQty, 9);
    assert.equal(inventoryService.getStock(sku)!.reservedQty, 1);
    assert.equal(metrics.get('inventory_restock_dlq_alerts_total'), alertCount + 2);

    assert.deepEqual(
      inventoryService.getAuditLogs().filter((entry) => entry.status === 'DLQ_ROUTED').map((entry) => entry.orderId),
      ['UNRESERVED', 'DB-TIMEOUT']
    );
    assert.equal(inventoryService.getAuditLogs().filter((entry) => entry.status === 'FAILED').length, 8);

    await orderService.createOrder('HEALTHY-AFTER-DLQ', 'USER', sku, 1);
    await eventBus.publish('order.cancelled', cancellationEvent('HEALTHY-AFTER-DLQ', 1));
    assert.equal(inventoryService.getStock(sku)!.availableQty, 9);
    assert.equal(inventoryService.getStock(sku)!.reservedQty, 1);
    assert.equal(eventBus.getDeadLetterQueue().length, 2);
  });
});
