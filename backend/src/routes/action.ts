import { Hono } from 'hono';
import { 
  createPersistenceHandler,
  createHonoWorkflowHandler
} from '@cascaide-ts/server-hono';
import { PostgresPersistor } from '@cascaide-ts/postgres-js';

// Import our async getters instead of static exports
import { getServerWorkflowConfig } from '../graphs/server/config';
import { getDb } from '../lib/pglite'; 

const router = new Hono();

// --- ACTION ROUTE ---
router.post('/action', async (c) => {
  // 1. Fetch a fresh config ON EVERY REQUEST to prevent state sharing
  const config = await getServerWorkflowConfig();
  const handler = createHonoWorkflowHandler(config);
  
  // 2. Execute the handler, passing the Hono Context 'c'
  return handler(c);
});

// --- PERSISTENCE ROUTE ---
router.post('/persistence', async (c) => {
  // 1. Fetch a fresh DB instance and persistor ON EVERY REQUEST
  const sql = await getDb();
  const persistor = new PostgresPersistor(sql);
  const handler = createPersistenceHandler(persistor);
  
  // 2. Execute the handler, passing the Hono Context 'c'
  return handler(c);
});

export default router;