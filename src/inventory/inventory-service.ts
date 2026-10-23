import { InventoryItem, OrderCancelledEvent, RestockAuditEntry } from '../types.js';
import { metrics } from '../observability/metrics.js';

export class InventoryService {
  private items = new Map<string, InventoryItem>();
  private processedIdempotencyKeys = new Set<string>();
  private auditLogs: RestockAuditEntry[] = [];
  private simulateTimeoutCount = 0;

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
      const availableQty = this.items.get(event.sku)?.availableQty ?? 0;
      this.recordAudit(event, 'FAILED', availableQty, availableQty);
      throw new Error(`InventoryDBTimeoutError: Connection timed out while restocking order ${event.orderId}`);
    }

    const item = this.items.get(event.sku);
    if (!item) {
      this.recordAudit(event, 'FAILED', 0, 0);
      throw new Error(`SKU ${event.sku} not found`);
    }

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = this.items.get(event.sku);
      if (!current) {
        throw new Error(`SKU ${event.sku} not found`);
      }
      if (this.processedIdempotencyKeys.has(event.idempotencyKey)) {
        this.recordAudit(event, 'DUPLICATE_SKIPPED', current.availableQty, current.availableQty);
        metrics.increment('inventory_restock_duplicate_skipped_total');
        return { applied: false, reason: 'DUPLICATE_EVENT', item: { ...current } };
      }
      if (event.quantity <= 0 || current.reservedQty < event.quantity) {
        this.recordAudit(event, 'FAILED', current.availableQty, current.availableQty);
        throw new Error(`Insufficient reserved stock for ${event.sku}`);
      }

      const snapshotVersion = current.version;
      await new Promise((resolve) => setTimeout(resolve, 5));

      const latest = this.items.get(event.sku);
      if (!latest) {
        throw new Error(`SKU ${event.sku} not found`);
      }
      if (latest.version !== snapshotVersion) {
        continue;
      }
      if (this.processedIdempotencyKeys.has(event.idempotencyKey)) {
        this.recordAudit(event, 'DUPLICATE_SKIPPED', latest.availableQty, latest.availableQty);
        metrics.increment('inventory_restock_duplicate_skipped_total');
        return { applied: false, reason: 'DUPLICATE_EVENT', item: { ...latest } };
      }
      if (latest.reservedQty < event.quantity) {
        this.recordAudit(event, 'FAILED', latest.availableQty, latest.availableQty);
        throw new Error(`Insufficient reserved stock for ${event.sku}`);
      }

      const beforeQty = latest.availableQty;
      latest.availableQty += event.quantity;
      latest.reservedQty -= event.quantity;
      latest.version += 1;
      latest.updatedAt = new Date().toISOString();
      this.processedIdempotencyKeys.add(event.idempotencyKey);
      this.recordAudit(event, 'RESTOCKED', beforeQty, latest.availableQty);
      metrics.increment('inventory_restock_success_total');

      return { applied: true, item: { ...latest } };
    }

    const availableQty = this.items.get(event.sku)?.availableQty ?? 0;
    this.recordAudit(event, 'FAILED', availableQty, availableQty);
    throw new Error(`Inventory version conflict for ${event.sku}`);
  }

  recordDeadLetter(event: OrderCancelledEvent): void {
    const availableQty = this.items.get(event.sku)?.availableQty ?? 0;
    this.recordAudit(event, 'DLQ_ROUTED', availableQty, availableQty);
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

  private recordAudit(
    event: OrderCancelledEvent,
    status: RestockAuditEntry['status'],
    beforeQty: number,
    afterQty: number
  ): void {
    this.auditLogs.push({
      auditId: `${event.eventId}:${this.auditLogs.length + 1}`,
      orderId: event.orderId,
      sku: event.sku,
      quantity: event.quantity,
      idempotencyKey: event.idempotencyKey,
      beforeQty,
      afterQty,
      status,
      timestamp: new Date().toISOString(),
    });
  }
}
