import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsCollector, metrics } from '../src/observability/metrics.js';
import { InventoryService } from '../src/inventory/inventory-service.js';

describe('MetricsCollector inventory observability', () => {
  it('tracks reconciliation mismatches and risk restock duration samples', () => {
    const metrics = new MetricsCollector();

    metrics.recordInventoryReconciliationMismatch();
    metrics.recordRiskCancellationRestockDuration(12);
    metrics.recordRiskCancellationRestockDuration(18);

    assert.equal(metrics.get('inventory_reconciliation_mismatch_total'), 1);
    assert.equal(metrics.get('inventory_risk_restock_duration_ms_sum'), 30);
    assert.equal(metrics.get('inventory_risk_restock_duration_count'), 2);
    assert.equal(metrics.snapshot().inventory_reconciliation_mismatch_total, 1);
  });

  it('rejects invalid risk restock duration samples', () => {
    const collector = new MetricsCollector();

    assert.throws(() => collector.recordRiskCancellationRestockDuration(-1), RangeError);
    assert.throws(() => collector.recordRiskCancellationRestockDuration(Number.NaN), RangeError);
    assert.equal(collector.get('inventory_risk_restock_duration_count'), 0);
  });

  it('reports current conservation mismatches only once per incident', async () => {
    metrics.reset();
    const inventory = new InventoryService([
      {
        sku: 'SKU-1',
        name: 'Test item',
        availableQty: 10,
        reservedQty: 0,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);

    assert.equal(inventory.reconcileInventory().status, 'healthy');
    await inventory.restockFromCancellation({
      eventId: 'event-1',
      idempotencyKey: 'cancel:order-1:SKU-1',
      orderId: 'order-1',
      sku: 'SKU-1',
      quantity: 1,
      occurredAt: new Date().toISOString(),
    });

    assert.equal(inventory.reconcileInventory().status, 'unhealthy');
    assert.equal(inventory.reconcileInventory().status, 'unhealthy');
    assert.equal(metrics.get('inventory_reconciliation_mismatch_total'), 1);
    metrics.reset();
  });

  it('records latency for a successful risk cancellation restock', async () => {
    metrics.reset();
    const inventory = new InventoryService([
      {
        sku: 'SKU-1',
        name: 'Test item',
        availableQty: 9,
        reservedQty: 1,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);

    await inventory.restockFromCancellation({
      eventId: 'event-risk',
      idempotencyKey: 'cancel:order-risk:SKU-1',
      orderId: 'order-risk',
      sku: 'SKU-1',
      quantity: 1,
      occurredAt: new Date(Date.now() - 20).toISOString(),
      cancellationType: 'RISK',
    });

    assert.equal(metrics.get('inventory_risk_restock_duration_count'), 1);
    assert.ok(metrics.get('inventory_risk_restock_duration_ms_sum') >= 20);
    metrics.reset();
  });
});
