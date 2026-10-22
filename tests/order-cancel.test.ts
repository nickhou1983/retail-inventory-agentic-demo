import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../src/server.js';

/**
 * Baseline Test Suite
 *
 * [ARCHITECTURAL GAP #4 - FOR LIVE DEMO]:
 * Currently only verifies order creation and status transition to CANCELLED.
 * Missing tests for:
 * 1. Real-time stock release within 30s upon order cancellation
 * 2. Idempotency protection when duplicate `OrderCancelledEvent` messages arrive
 * 3. Retry & Dead-Letter Queue (`inventory.restock.dlq`) routing on DB timeouts
 * 4. Concurrent order cancellation race conditions
 */
describe('Retail Order & Inventory Baseline Suite', () => {
  it('reserves inventory when an order is created and updates status on cancel', async () => {
    const { orderService, inventoryService } = createAppContext();

    const before = inventoryService.getStock('SKU-IPHONE16-PRO')!;
    assert.equal(before.availableQty, 10);

    const order = await orderService.createOrder('ORD-1001', 'USER-01', 'SKU-IPHONE16-PRO', 2);
    assert.equal(order.status, 'CONFIRMED');

    const afterOrder = inventoryService.getStock('SKU-IPHONE16-PRO')!;
    assert.equal(afterOrder.availableQty, 8);
    assert.equal(afterOrder.reservedQty, 2);

    const cancelled = await orderService.cancelOrder('ORD-1001');
    assert.equal(cancelled.status, 'CANCELLED');
  });
});
