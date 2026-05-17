import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server'; // If running on Node/Docker
import workflowRoutes from './routes/action';

const app = new Hono().basePath('/api');

// 1. CORS: Hono's native middleware
app.use('*', cors({
  origin:  'http://localhost:5173',
  credentials: true,
}));

// 2. Health Check
app.get('/health', (c) => {
  return c.json({ status: 'Hono Backend is running smoothly!' }, 200);
});

// 3. Mount Routes
app.route('/workflow', workflowRoutes);

const PORT = 4000;
console.log(`🚀 Hono Server running on http://localhost:${PORT}`);

serve({
  fetch: app.fetch,
  port: PORT,
});
