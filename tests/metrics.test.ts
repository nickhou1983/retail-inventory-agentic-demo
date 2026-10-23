import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsCollector } from '../src/observability/metrics.js';

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
    const metrics = new MetricsCollector();

    assert.throws(() => metrics.recordRiskCancellationRestockDuration(-1), RangeError);
    assert.throws(() => metrics.recordRiskCancellationRestockDuration(Number.NaN), RangeError);
    assert.equal(metrics.get('inventory_risk_restock_duration_count'), 0);
  });
});
