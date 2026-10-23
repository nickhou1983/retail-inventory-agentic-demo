/**
 * Telemetry & Metrics Collector
 *
 * [ARCHITECTURAL GAP #5 - FOR LIVE DEMO]:
 * Currently only tracks basic order counters.
 * Missing:
 * - `inventory_restock_success_total`
 * - `inventory_restock_duplicate_skipped_total`
 * - `inventory_restock_retry_total`
 * - `inventory_restock_dlq_total`
 * - Alert evaluation when restock failure / DLQ exceeds threshold
 */
export class MetricsCollector {
  private counters: Record<string, number> = {
    orders_created_total: 0,
    orders_cancelled_total: 0,
    event_bus_unhandled_errors_total: 0,
    inventory_reconciliation_mismatch_total: 0,
    inventory_risk_restock_duration_ms_sum: 0,
    inventory_risk_restock_duration_count: 0,
  };

  increment(metricName: string, by = 1): void {
    this.counters[metricName] = (this.counters[metricName] ?? 0) + by;
  }

  recordInventoryReconciliationMismatch(): void {
    this.increment('inventory_reconciliation_mismatch_total');
  }

  recordRiskCancellationRestockDuration(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError('Restock duration must be a finite, non-negative number');
    }
    this.increment('inventory_risk_restock_duration_ms_sum', durationMs);
    this.increment('inventory_risk_restock_duration_count');
  }

  get(metricName: string): number {
    return this.counters[metricName] ?? 0;
  }

  snapshot(): Record<string, number> {
    return { ...this.counters };
  }

  reset(): void {
    for (const key of Object.keys(this.counters)) {
      this.counters[key] = 0;
    }
  }
}

export const metrics = new MetricsCollector();
