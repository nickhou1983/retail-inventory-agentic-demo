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
    inventory_optimistic_lock_retry_total: 0,
  };
  private restockLatency = new Map<
    string,
    { count: number; sum: number; buckets: Record<number, number> }
  >();
  private readonly latencyBuckets = [10, 25, 50, 100, 250, 500, 1000];

  increment(metricName: string, by = 1): void {
    this.counters[metricName] = (this.counters[metricName] ?? 0) + by;
  }

  recordOptimisticLockRetry(sku: string): void {
    this.increment('inventory_optimistic_lock_retry_total');
    this.increment(`inventory_optimistic_lock_retry_total{sku="${this.escapeLabel(sku)}"}`);
  }

  observeRestockLatency(sku: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }

    const histogram = this.restockLatency.get(sku) ?? {
      count: 0,
      sum: 0,
      buckets: Object.fromEntries(this.latencyBuckets.map((bucket) => [bucket, 0])),
    };
    histogram.count += 1;
    histogram.sum += durationMs;
    for (const bucket of this.latencyBuckets) {
      if (durationMs <= bucket) {
        histogram.buckets[bucket] += 1;
      }
    }
    this.restockLatency.set(sku, histogram);
  }

  get(metricName: string): number {
    return this.counters[metricName] ?? 0;
  }

  snapshot(): Record<string, number> {
    const snapshot = { ...this.counters };
    for (const [sku, histogram] of this.restockLatency) {
      const label = this.escapeLabel(sku);
      for (const bucket of this.latencyBuckets) {
        snapshot[`inventory_restock_latency_ms_bucket{sku="${label}",le="${bucket}"}`] =
          histogram.buckets[bucket];
      }
      snapshot[`inventory_restock_latency_ms_bucket{sku="${label}",le="+Inf"}`] = histogram.count;
      snapshot[`inventory_restock_latency_ms_count{sku="${label}"}`] = histogram.count;
      snapshot[`inventory_restock_latency_ms_sum{sku="${label}"}`] = histogram.sum;
    }
    return snapshot;
  }

  reset(): void {
    for (const key of Object.keys(this.counters)) {
      this.counters[key] = 0;
    }
    this.restockLatency.clear();
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

export const metrics = new MetricsCollector();
