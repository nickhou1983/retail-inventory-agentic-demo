import { DeadLetterMessage, OrderCancelledEvent } from '../types.js';
import { metrics } from '../observability/metrics.js';

export type EventHandler<T = OrderCancelledEvent> = (event: T) => Promise<void>;

/**
 * In-Memory Event Bus for Order & Inventory Microservices
 *
 * [ARCHITECTURAL GAP #2 - FOR LIVE DEMO]:
 * Currently `publish()` only executes handlers once and logs an error on failure.
 * It lacks:
 * 1. Exponential backoff retry on transient DB timeout errors (`maxRetries`)
 * 2. Dead-Letter Queue (`inventory.restock.dlq`) routing after max retries
 * 3. Alert metric increments when messages land in DLQ
 */
export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private deadLetterQueue: DeadLetterMessage[] = [];

  subscribe(topic: string, handler: EventHandler): void {
    const existing = this.handlers.get(topic) ?? [];
    existing.push(handler);
    this.handlers.set(topic, existing);
  }

  async publish(topic: string, event: OrderCancelledEvent): Promise<void> {
    const topicHandlers = this.handlers.get(topic) ?? [];
    for (const handler of topicHandlers) {
      try {
        // [GAP #2]: No retry loop and no Dead-Letter Queue routing when handler throws!
        await handler(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[EventBus] Handler failed for topic=${topic}, orderId=${event.orderId}: ${message}`);
        metrics.increment('event_bus_unhandled_errors_total');
      }
    }
  }

  getDeadLetterQueue(): DeadLetterMessage[] {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }
}
