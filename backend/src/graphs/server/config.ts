import { WorkflowHandlerConfig } from '@cascaide-ts/core';
import { PostgresPersistor } from '@cascaide-ts/postgres-js';
// 1. Change the import here:
import { getDb } from '../../lib/pglite';
import { serverWorkflowGraph } from './graph';

const MAX_EXECUTION_TIME = 1000000; 
const SAFE_BUFFER = 6000; 

export async function getServerWorkflowConfig(): Promise<WorkflowHandlerConfig> {
  // 2. Call getDb() instead:
  const sql = await getDb(); 
  const workflowpersistor = new PostgresPersistor(sql);

  return {
    workflowGraph: serverWorkflowGraph,
    persistor: workflowpersistor,
    maxExecutionTime: MAX_EXECUTION_TIME,
    safeBuffer: SAFE_BUFFER,
  };
}