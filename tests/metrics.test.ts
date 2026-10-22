import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsCollector } from '../src/observability/metrics.js';

describe('MetricsCollector inventory restock counters', () => {
  it('exposes all restock counters at zero before events are recorded', () => {
    const metrics = new MetricsCollector();
    const snapshot = metrics.snapshot();

    for (const name of [
      'inventory_restock_success_total',
      'inventory_restock_duplicate_skipped_total',
      'inventory_restock_retry_total',
      'inventory_restock_dlq_total',
    ]) {
      assert.equal(snapshot[name], 0);
    }
  });

  it('increments restock counters and resets them with the other counters', () => {
    const metrics = new MetricsCollector();
    metrics.increment('inventory_restock_success_total', 2);
    metrics.increment('inventory_restock_dlq_total');

    assert.equal(metrics.get('inventory_restock_success_total'), 2);
    assert.equal(metrics.get('inventory_restock_dlq_total'), 1);

    metrics.reset();

    assert.equal(metrics.get('inventory_restock_success_total'), 0);
    assert.equal(metrics.get('inventory_restock_dlq_total'), 0);
  });
});
