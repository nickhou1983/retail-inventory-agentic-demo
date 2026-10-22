import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventBus } from './bus/event-bus.js';
import { InventoryService } from './inventory/inventory-service.js';
import { OrderService } from './order/order-service.js';
import { metrics } from './observability/metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createAppContext() {
  const eventBus = new EventBus();
  const inventoryService = new InventoryService();
  const orderService = new OrderService(eventBus, inventoryService);

  eventBus.subscribe('order.cancelled', async (event) => {
    await inventoryService.restockFromCancellation(event);
  });

  return { eventBus, inventoryService, orderService, metrics };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ctx = createAppContext();
  const port = Number(process.env.PORT ?? 3000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (req.method === 'GET' && url.pathname === '/') {
      const htmlPath = path.join(__dirname, '../public/dashboard.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          inventory: ctx.inventoryService.listStock(),
          orders: ctx.orderService.listOrders(),
          auditLogs: ctx.inventoryService.getAuditLogs(),
          dlq: ctx.eventBus.getDeadLetterQueue(),
          metrics: ctx.metrics.snapshot(),
        })
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const orderId = data.orderId ?? `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
          const order = await ctx.orderService.createOrder(
            orderId,
            data.userId ?? 'USER-VIP-88',
            data.sku ?? 'SKU-IPHONE16-PRO',
            Number(data.quantity ?? 2)
          );
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(order));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/orders/') && url.pathname.endsWith('/cancel')) {
      const parts = url.pathname.split('/');
      const orderId = parts[3];
      try {
        const cancelled = await ctx.orderService.cancelOrder(orderId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cancelled));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, () => {
    console.log(`[Retail Inventory Demo] Dashboard running at http://localhost:${port}`);
  });
}
