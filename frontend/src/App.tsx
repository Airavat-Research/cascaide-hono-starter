
import { WorkflowProvider } from '@cascaide-ts/react';
import { clientWorkflowConfig } from '@/graphs/client/config';
import { WorkflowRenderer } from '@cascaide-ts/react';

export default function App() {
  return (
    <WorkflowProvider 
      initialNodeId="chat_init"
      initialNodeName="chat"
      config={clientWorkflowConfig}
      // Pro-tip: If you configured the Vite proxy, you can change these 
      // to just '/api/workflow/...' to avoid CORS issues entirely!
      actionRelayEndpoint='http://localhost:4000/api/workflow/action'
      persistenceEndpoint='http://localhost:4000/api/workflow/persistence'
    >
      <WorkflowRenderer />
    </WorkflowProvider>
  );
}

