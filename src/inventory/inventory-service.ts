import { InventoryItem, OrderCancelledEvent, RestockAuditEntry } from '../types.js';
import { metrics } from '../observability/metrics.js';

interface InventoryReconciliationResult {
  status: 'healthy' | 'unhealthy' | 'unknown';
  mismatches: Array<{
    sku: string;
    expectedQty: number | null;
    observedQty: number | null;
  }>;
}

/**
 * Retail Inventory Service
 *
 * [ARCHITECTURAL GAP #3 & ACT IV RACE-CONDITION TRAP - FOR LIVE DEMO]:
 * 1. Missing `idempotencyKey` deduplication: If the same `OrderCancelledEvent` is delivered twice,
 *    stock is incremented twice!
 * 2. Missing Optimistic Locking (`version` CAS check) & Concurrency Control:
 *    `restockFromCancellation` performs an unsafe async read-then-write (`await delay` -> overwrite),
 *    causing lost updates or double restocks under concurrent requests.
 * 3. Missing structured audit trail (`auditLogs` is never populated).
 */
export class InventoryService {
  private items = new Map<string, InventoryItem>();
  private processedIdempotencyKeys = new Set<string>();
  private auditLogs: RestockAuditEntry[] = [];
  private simulateTimeoutCount = 0;
  private baselineTotals = new Map<string, number>();
  private mismatchedSkus = new Set<string>();

  constructor(initialItems?: InventoryItem[]) {
    const defaults: InventoryItem[] = initialItems ?? [
      {
        sku: 'SKU-IPHONE16-PRO',
        name: 'iPhone 16 Pro 256GB (大促爆款)',
        availableQty: 10,
        reservedQty: 0,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        sku: 'SKU-WATCH-ULTRA2',
        name: 'Apple Watch Ultra 2',
        availableQty: 25,
        reservedQty: 0,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    ];
    for (const item of defaults) {
      this.items.set(item.sku, { ...item });
      this.baselineTotals.set(item.sku, item.availableQty + item.reservedQty);
    }
  }

  /**
   * Injects transient DB timeouts for Chaos Testing (Agent B)
   */
  injectTransientDbTimeouts(times: number): void {
    this.simulateTimeoutCount = times;
  }

  async reserveStock(sku: string, quantity: number): Promise<InventoryItem> {
    const item = this.items.get(sku);
    if (!item) {
      throw new Error(`SKU ${sku} not found`);
    }
    if (item.availableQty < quantity) {
      throw new Error(`Insufficient stock for ${sku}: available=${item.availableQty}, requested=${quantity}`);
    }
    item.availableQty -= quantity;
    item.reservedQty += quantity;
    item.version += 1;
    item.updatedAt = new Date().toISOString();
    return { ...item };
  }

  /**
   * Consumes OrderCancelledEvent to release reserved stock back to availableQty.
   */
  async restockFromCancellation(event: OrderCancelledEvent): Promise<{
    applied: boolean;
    reason?: string;
    item: InventoryItem;
  }> {
    if (this.simulateTimeoutCount > 0) {
      this.simulateTimeoutCount -= 1;
      throw new Error(`InventoryDBTimeoutError: Connection timed out while restocking order ${event.orderId}`);
    }

    const item = this.items.get(event.sku);
    if (!item) {
      throw new Error(`SKU ${event.sku} not found`);
    }

    // [GAP #3A]: Missing idempotency check on `event.idempotencyKey`!
    // [GAP #3B - ACT IV RACE CONDITION]: Unsafe read-modify-write across async boundary without `version` CAS check!
    const snapshotAvailable = item.availableQty;
    const snapshotReserved = item.reservedQty;
    await new Promise((resolve) => setTimeout(resolve, 5));

    item.availableQty = snapshotAvailable + event.quantity;
    item.reservedQty = Math.max(0, snapshotReserved - event.quantity);
    item.updatedAt = new Date().toISOString();

    if (event.cancellationType === 'RISK') {
      const occurredAt = Date.parse(event.occurredAt);
      if (Number.isFinite(occurredAt) && occurredAt <= Date.now()) {
        metrics.recordRiskCancellationRestockDuration(Date.now() - occurredAt);
      }
    }

    // [GAP #3C]: Missing `this.auditLogs.push(...)` audit trail!

    return { applied: true, item: { ...item } };
  }

  reconcileInventory(): InventoryReconciliationResult {
    if (this.baselineTotals.size === 0) {
      return { status: 'unknown', mismatches: [] };
    }

    const mismatches: InventoryReconciliationResult['mismatches'] = [];
    for (const [sku, expectedQty] of this.baselineTotals) {
      const item = this.items.get(sku);
      const observedQty = item ? item.availableQty + item.reservedQty : null;
      if (
        !item ||
        observedQty === null ||
        observedQty !== expectedQty ||
        item.availableQty < 0 ||
        item.reservedQty < 0
      ) {
        mismatches.push({ sku, expectedQty, observedQty });
      }
    }
    for (const [sku, item] of this.items) {
      if (!this.baselineTotals.has(sku)) {
        mismatches.push({
          sku,
          expectedQty: null,
          observedQty: item.availableQty + item.reservedQty,
        });
      }
    }

    const currentMismatchedSkus = new Set(mismatches.map(({ sku }) => sku));
    for (const sku of currentMismatchedSkus) {
      if (!this.mismatchedSkus.has(sku)) {
        metrics.recordInventoryReconciliationMismatch();
      }
    }
    this.mismatchedSkus = currentMismatchedSkus;

    return {
      status: mismatches.length === 0 ? 'healthy' : 'unhealthy',
      mismatches,
    };
  }

  getStock(sku: string): InventoryItem | undefined {
    const item = this.items.get(sku);
    return item ? { ...item } : undefined;
  }

  listStock(): InventoryItem[] {
    return Array.from(this.items.values()).map((item) => ({ ...item }));
  }

  getAuditLogs(): RestockAuditEntry[] {
    return [...this.auditLogs];
  }
}
