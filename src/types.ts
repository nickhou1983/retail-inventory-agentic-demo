export type OrderStatus = 'CONFIRMED' | 'CANCELLED';

export interface Order {
  orderId: string;
  userId: string;
  sku: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface OrderCancelledEvent {
  eventId: string;
  idempotencyKey: string; // e.g., "cancel:ORD-1001:SKU-IPHONE16-PRO"
  orderId: string;
  sku: string;
  quantity: number;
  occurredAt: string;
}

export interface InventoryItem {
  sku: string;
  name: string;
  availableQty: number;
  reservedQty: number;
  version: number; // Optimistic lock version
  updatedAt: string;
}

export interface RestockAuditEntry {
  auditId: string;
  orderId: string;
  sku: string;
  quantity: number;
  idempotencyKey: string;
  beforeQty: number;
  afterQty: number;
  status: 'RESTOCKED' | 'DUPLICATE_SKIPPED' | 'FAILED' | 'DLQ_ROUTED';
  timestamp: string;
}

export interface DeadLetterMessage {
  topic: string;
  payload: OrderCancelledEvent;
  errorMessage: string;
  attempts: number;
  failedAt: string;
}
