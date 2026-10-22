import { Order } from '../types.js';
import { EventBus } from '../bus/event-bus.js';
import { InventoryService } from '../inventory/inventory-service.js';
import { metrics } from '../observability/metrics.js';

/**
 * Retail Order Service
 *
 * [ARCHITECTURAL GAP #1 - FOR LIVE DEMO]:
 * When a user cancels an order in `cancelOrder()`, the order status is updated to `CANCELLED`,
 * but it does NOT publish an `OrderCancelledEvent` to `EventBus`.
 * As a result, reserved stock remains locked until the legacy hourly batch job runs!
 */
export class OrderService {
  private orders = new Map<string, Order>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly inventoryService: InventoryService
  ) {}

  async createOrder(orderId: string, userId: string, sku: string, quantity: number): Promise<Order> {
    await this.inventoryService.reserveStock(sku, quantity);
    const order: Order = {
      orderId,
      userId,
      sku,
      quantity,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };
    this.orders.set(orderId, order);
    metrics.increment('orders_created_total');
    return order;
  }

  async cancelOrder(orderId: string, reason = 'User cancelled within 5m window'): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (order.status === 'CANCELLED') {
      return order;
    }

    order.status = 'CANCELLED';
    order.cancelledAt = new Date().toISOString();
    order.cancelReason = reason;
    metrics.increment('orders_cancelled_total');

    // [GAP #1]: Missing real-time `OrderCancelledEvent` publication to `this.eventBus`!
    // Legacy behavior: Waits for hourly cron reconciliation to release reserved stock.

    return order;
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  listOrders(): Order[] {
    return Array.from(this.orders.values());
  }
}
