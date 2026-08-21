import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { annotations } from './api/annotations';

const app = new Hono<{
  Bindings: {
    DB: D1Database;
  };
}>();

// Middleware
app.use('*', cors());

// API Routes
app.route('/api/annotations', annotations);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// 404 handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
