/**
 * Telemetry & Metrics Collector
 *
 * Counters are initialized here so every metric is exposed in snapshots,
 * including before its first event.
 */
export class MetricsCollector {
  private counters: Record<string, number> = {
    orders_created_total: 0,
    orders_cancelled_total: 0,
    event_bus_unhandled_errors_total: 0,
    inventory_restock_success_total: 0,
    inventory_restock_duplicate_skipped_total: 0,
    inventory_restock_retry_total: 0,
    inventory_restock_dlq_total: 0,
  };

  increment(metricName: string, by = 1): void {
    this.counters[metricName] = (this.counters[metricName] ?? 0) + by;
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
