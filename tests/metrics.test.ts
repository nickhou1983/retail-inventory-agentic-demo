import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InventoryService } from '../src/inventory/inventory-service.js';
import { MetricsCollector, metrics } from '../src/observability/metrics.js';

describe('Inventory observability metrics', () => {
  it('records optimistic-lock retries by SKU and in aggregate', () => {
    const metrics = new MetricsCollector();

    metrics.recordOptimisticLockRetry('SKU-IPHONE16-PRO');
    metrics.recordOptimisticLockRetry('SKU-IPHONE16-PRO');
    metrics.recordOptimisticLockRetry('SKU-WATCH-ULTRA2');

    const snapshot = metrics.snapshot();
    assert.equal(snapshot.inventory_optimistic_lock_retry_total, 3);
    assert.equal(snapshot['inventory_optimistic_lock_retry_total{sku="SKU-IPHONE16-PRO"}'], 2);
    assert.equal(snapshot['inventory_optimistic_lock_retry_total{sku="SKU-WATCH-ULTRA2"}'], 1);
  });

  it('records per-SKU restock latency distributions and resets them', () => {
    const metrics = new MetricsCollector();

    metrics.observeRestockLatency('SKU-IPHONE16-PRO', 5);
    metrics.observeRestockLatency('SKU-IPHONE16-PRO', 30);
    metrics.observeRestockLatency('SKU-IPHONE16-PRO', 1500);
    metrics.observeRestockLatency('SKU-IPHONE16-PRO', -1);

    const snapshot = metrics.snapshot();
    assert.equal(snapshot['inventory_restock_latency_ms_count{sku="SKU-IPHONE16-PRO"}'], 3);
    assert.equal(snapshot['inventory_restock_latency_ms_sum{sku="SKU-IPHONE16-PRO"}'], 1535);
    assert.equal(snapshot['inventory_restock_latency_ms_bucket{sku="SKU-IPHONE16-PRO",le="10"}'], 1);
    assert.equal(snapshot['inventory_restock_latency_ms_bucket{sku="SKU-IPHONE16-PRO",le="50"}'], 2);
    assert.equal(snapshot['inventory_restock_latency_ms_bucket{sku="SKU-IPHONE16-PRO",le="+Inf"}'], 3);

    metrics.reset();
    assert.equal(metrics.snapshot().inventory_optimistic_lock_retry_total, 0);
    assert.equal(
      metrics.snapshot()['inventory_restock_latency_ms_count{sku="SKU-IPHONE16-PRO"}'],
      undefined
    );
  });

  it('records latency for inventory restock attempts', async () => {
    metrics.reset();
    const inventory = new InventoryService();

    try {
      await inventory.restockFromCancellation({
        eventId: 'event-1',
        idempotencyKey: 'cancel:ORD-1:SKU-IPHONE16-PRO',
        orderId: 'ORD-1',
        sku: 'SKU-IPHONE16-PRO',
        quantity: 1,
        occurredAt: new Date().toISOString(),
      });

      assert.equal(
        metrics.snapshot()['inventory_restock_latency_ms_count{sku="SKU-IPHONE16-PRO"}'],
        1
      );
    } finally {
      metrics.reset();
    }
  });
});
