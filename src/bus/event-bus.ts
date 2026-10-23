import { DeadLetterMessage, OrderCancelledEvent } from '../types.js';
import { metrics } from '../observability/metrics.js';

export type EventHandler<T = OrderCancelledEvent> = (event: T) => Promise<void>;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private deadLetterQueue: DeadLetterMessage[] = [];

  constructor(
    private readonly maxRetries = 3,
    private readonly onDeadLetter?: (event: OrderCancelledEvent) => void
  ) {}

  subscribe(topic: string, handler: EventHandler): void {
    const existing = this.handlers.get(topic) ?? [];
    existing.push(handler);
    this.handlers.set(topic, existing);
  }

  async publish(topic: string, event: OrderCancelledEvent): Promise<void> {
    const topicHandlers = this.handlers.get(topic) ?? [];
    for (const handler of topicHandlers) {
      let lastError: unknown = undefined;
      let succeeded = false;
      let attempt = 0;
      while (attempt <= this.maxRetries) {
        try {
          await handler(event);
          succeeded = true;
          break;
        } catch (err) {
          lastError = err;
          if (attempt === this.maxRetries) {
            break;
          }
          metrics.increment('inventory_restock_retry_total');
          await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
          attempt += 1;
        }
      }

      if (!succeeded) {
        const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
        this.deadLetterQueue.push({
          topic: 'inventory.restock.dlq',
          payload: event,
          errorMessage,
          attempts: attempt + 1,
          failedAt: new Date().toISOString(),
        });
        metrics.increment('event_bus_unhandled_errors_total');
        metrics.increment('inventory_restock_dlq_alerts_total');
        this.onDeadLetter?.(event);
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
