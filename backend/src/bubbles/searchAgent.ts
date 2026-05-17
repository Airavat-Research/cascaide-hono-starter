
/* 
searchAgentNode.ts

These are the nodes for a search agent that implements Reasoning + Action loop. 
It uses a search tool that uses tavily (get your API key by checking out https://docs.tavily.com/documentation/quickstart)
It uses gemini out of the box, but you can modify it by changing the `exec` step to use a different provider.

There are two patterns displayed here: 

- using the createReactAgent factory to create the agent and tool nodes
- creating the agent and tool nodes manually by writing the prep, exec, and post steps

*/

/*
createReactAgent factory

This is the easiest way to create agent and tool nodes. Use it if you need a vanilla agent. 
It's fast and easy to set up, however, you give up some control.
We personally prefer writing `prep`, `exec`, `post` steps because you can do a lot with basic programming flow.

Here is how it works:

 * Each agent is declared by calling the factory with its config.
 * The resulting .nodes object is spread directly into the registry —
 * producing the exact shape expected by the graphs.
 *
 *   searchAgentNode: { name, prep, exec, post, isStreaming, isUINode, env }
 *   searchToolNode:  { name, prep, exec, post, isStreaming, isUINode, env }

import { tavily } from '@tavily/core';
import { createReactAgent } from '@cascaide-ts/helpers';

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

const SYSTEM_PROMPT = `
You are an expert technical AI assistant equipped with web search capabilities.
You have access to the following tools:
1. search_tool
   Use for general web searches, finding documentation, or retrieving facts.
   Pass a clear, concise query.
`.trim();

export const nodes = {
  ...createReactAgent('search', {
    provider:     'gemini-genai',
    model:        'gemini-3-flash-preview',
    systemPrompt: SYSTEM_PROMPT,
    isStreaming:  true,
    env:          'server',
    tools: [
      {
        name:        'search_tool',
        description: 'Searches the web using the input query.',
        parameters: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'The natural language query' },
          },
          required: ['query'],
        },
        execute: async (args: Record<string, any>) => {
            const { query } = args;
            const res = await tvly.search(query, {
              searchDepth: 'basic',
              maxResults:  5,
              topic:       'general',
            });
            return res.results;
          },
      },
    ],
  }).nodes,
};
*/


/*

Manually creating the agent and tool nodes

This is how we prefer you write nodes.
It is admittedly has more boilerplate, but you can perform complex branching logic, HITL features, etc. using basic programming flow.
A coding agent can quickly scaffold it up, and then you can inject your custom logic.

The three steps are:

- `prep` : read from state and initialContext to prepare the data for execution
- `exec` : execute some logic on the prepared data (an LLM call, custom logic, etc)
- `post` : write the results to the state as `updates` and spawn the next nodes (if any)

As you can see, each has a well defined role.

*/


import type {
  StreamingServerNodeDefinition,
  WorkflowContext,
  StreamConfig,
  StreamingExecOutput,
  PostResult,
  CascadeController,
  Updates,
  ServerNodeDefinition,
  Spawns,
} from '@cascaide-ts/core';
import {  CanonicalToolCall, ToolParam,
buildErrorToolResultMessage,
buildToolResultMessage, buildTools,
CanonicalMessage, LLMProvider,
toProviderHistory,
callLLM
} from '@cascaide-ts/helpers';


  /*
  A note on types (or lack thereof)

  `NodeDefinition`s use generics because we do not want to tell you what you can and cannot pass through.
  Good news is you can pass anything, bad news is you can pass anything. Anything serializable, that is.

  Therefore, it is recommended to type what you pass through for safety.

  You will observe `Canonical` shapes and helpers throughout. This is purely for convenience, you do not
  need to follow or use them. You can use whatever AI message shape you want. As long as you adhere to the
  node definition types themselves, it will work fine.

  Another quirk you might have noticed is history being any[].
  Cascaide is more general than an agent builder, it can execute arbitrary graphs as long as all inputs and outputs are serializeable.

  So you could imagine a workflow with no AI in sight, with each node writing state updates in history, or even leaving history empty 
  and writing arbitrary keys. As long as you type the individual nodes, the data being written is visible to collaborators.
  Rule of thumb: when in doubt, inspect the state, either using the client-side devtools or the controller from within a node.

  For the brave: you can use non-serializables I/O, but not in any node that needs persistence/crosses client server boundary.
  Fun to experiment with, less so in prod. In future versions we will create guardrails, if interesting patterns emerge.


  */

  type SearchAgentPrepOut = {
    history: any[]; //Todo : type should be geminiMessage[], as we convert before passing
    cascadeId: string;
  };
  
  
  export const searchAgentNode: StreamingServerNodeDefinition<SearchAgentPrepOut> = {
    name: 'searchAgentNode',
    isUINode: false,
    env: 'server',
    isStreaming: true,
  
    async prep(cascadeContext: WorkflowContext, initialContext: any): Promise<SearchAgentPrepOut> {
        const cascadeId = initialContext.cascadeId;
        const dataArray = cascadeContext[cascadeId];
        const canonicalHistory = dataArray.flatMap((item: any) => item.history || []);

        /* 
           
           This history is in canonical shape (unless another canonical shape is forced
           by using a custom mapper, which are not doing in this example).
           So, we will convert to provider specific shape, using gemini-genai here.

        */
        const history = toProviderHistory('gemini-genai', canonicalHistory);    

      
        return { history, cascadeId };
      },
  
    async exec(prepOutput: SearchAgentPrepOut, controller?: CascadeController): Promise<StreamConfig> {
      const { history } = prepOutput;

      /*
          We are not using the controller in this example. Every `exec` gets one, and it allows you
          to control the graph execution from within nodes (delegation, recursion, pausing the node for some condition, etc.)

          See: recursiveReactAgent.ts for concrete examples
      */

      const systemPrompt = `
            
      You are an expert technical AI assistant equipped with web search capabilities.
            You have access to the following tools:
            1. search_tool
            Use for general web searches, finding documentation, or retrieving facts.
            Pass a clear, concise query.

      `.trim();

      /*
             We will construct the tools here. We will write the tool definitions in `ToolParam` shape and 
             convert it into provider specific shape using `buildTools` helper.
      */

        const searchToolParams: ToolParam[] = [
                {
                  name:        'search_tool',
                  description: 'Searches the web using the input query.',
                  parameters: {
                    type: 'object' as const,
                    properties: {
                      query: { type: 'string', description: 'The natural language query' },
                    },
                    required: ['query'],
                  },
                },
              ];

      const geminiTools = buildTools('gemini-genai', searchToolParams);
      const {stream, provider} = await callLLM('gemini-genai', 'gemini-3.1-flash-lite', systemPrompt, history, geminiTools,  true);
      return { stream, provider };
    },
  
    async post(execOutput: StreamingExecOutput): Promise<PostResult> {
      const { assistantMessage, uiAssistantMessage, history, cascadeId, userId } = execOutput;

      const pendingToolCalls = assistantMessage.tool_calls ?? [] as CanonicalToolCall[]

      /*
        if you had a filter set up in `StreamConfig`, the two `assistantMessage`s would differ.
        By passing an optional `uiUpdate`, you can censor what the client side sees even when hydrating 
        the cascade in new user sessions. Otherwise, the client would be censored only during the stream,
        and upon hydrating the cascade later, the full sensitive `Update` will hit the client.

      */

      const isDifferent = uiAssistantMessage !== undefined &&
      JSON.stringify(assistantMessage) !== JSON.stringify(uiAssistantMessage);
  
      return {
        updates: {
          [cascadeId as string]: {
            history:    [assistantMessage as CanonicalMessage],
            status:     pendingToolCalls.length > 0 ? 'calling_tool' : 'complete',
            lastUpdate: Date.now(),
            //you can add more fields if you want, it will be written to the cascade state
            // what's mandatory is history and status
          },
        } as Updates,
        ...(isDifferent ? {
          uiUpdates: {
            [cascadeId as string]: { history: [uiAssistantMessage as CanonicalMessage], status: pendingToolCalls.length > 0 ? 'calling_tool' : 'complete' },
          },
        } : {}),
        spawns: pendingToolCalls.length > 0
          ? {  // we spawn the hardcoded searchToolNode if there are tool calls
              ['searchToolNode']: {
                history:            [assistantMessage],
                toolCallsToExecute: pendingToolCalls,
                cascadeId,
              },
            } as Spawns
          : undefined,

          /*
             Some behaviours worth noting when spawning nodes

              - no cascadeId => this spawn is not part of a cascade, ephemeral, no persistence.
                Useful when you need one of fire and forget nodes, that do not need to be persisted.
                They are ghosts -> cannot write to state, but could spawn new nodes.
                This is mostly used to spawn observer UI nodes to watch cascades and/or initiate new ones.

              - no userId => safe to omit. the new node will inherit from the parent.
                Then why is it available in `initialContext` and `post`?
                userIds enter the nodes because you might need it for retrieving memories, or other scoped operations.
          */
      };

  }
  };


  type SearchToolPrepOut = {
    toolCallsToExecute : CanonicalToolCall[];
    cascadeId: string;
  }

  type SearchToolExecOut = {
    results: CanonicalMessage[];
    cascadeId: string;
  }
  import { tavily } from "@tavily/core";


  const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });



  export const searchToolNode: ServerNodeDefinition<SearchToolPrepOut, SearchToolExecOut> = {
    name: 'searchToolNode',
    isUINode: false,
    env: 'server',
    isStreaming: false,

    async prep(cascadeContext: WorkflowContext, initialContext: any): Promise<SearchToolPrepOut> {
        const { toolCallsToExecute, cascadeId } = initialContext
        /*
            We simply pass what the `exec` step requires, not much preparation needed.
        */
        return { toolCallsToExecute: toolCallsToExecute ?? [], cascadeId};

    },

    async exec(prepOutput: SearchToolPrepOut, controller?: CascadeController ) : Promise<SearchToolExecOut> {

        const {toolCallsToExecute, cascadeId} = prepOutput;
        const results = await executeToolCalls(toolCallsToExecute, {
            search_tool: async ({ query }) => { return await tvly.search(query, {
                searchDepth: "basic",
                maxResults: 5,
                topic: "general"
              });}
          }, 'gemini-genai');
          const toolResultMessages = results.map(({ toolResult }) => toolResult);

        return {results: toolResultMessages, cascadeId}

    },

    async post(execOutput: SearchToolExecOut) : Promise<PostResult> {

        const {results, cascadeId} = execOutput;
        return {
            updates: {
              [cascadeId as string]: {
                history:    results,
                status:     'complete',
                //you can add more fields if you want, it will be written to the cascade state
                // what's mandatory is history and status
              },
            } as Updates,
            spawns :{
                ['searchAgentNode'] :  {
                    history:            results,
                    cascadeId,
                  },
                } as Spawns
            }


    }
  }

  






  export type ManualToolExecute = (args: Record<string, any>) => Promise<unknown>;
  export type ManualToolExecuteMap = Record<string, ManualToolExecute>;



  export async function executeToolCalls(
    calls: CanonicalToolCall[],
    executeMap: ManualToolExecuteMap,
    provider: LLMProvider,
  ): Promise<{ toolCall:CanonicalToolCall; toolResult: CanonicalMessage }[]> {
    return Promise.all(
      calls.map(async (toolCall) => {
        const executeFn = executeMap[toolCall.name];
  
        if (!executeFn) {
          return {
            toolCall,
            toolResult: buildErrorToolResultMessage(provider, toolCall, `Unknown tool: ${toolCall.name}`),
          };
        }
  
        try {
          const rawResult = await executeFn(toolCall.args);
          return {
            toolCall,
            toolResult: buildToolResultMessage(provider, toolCall, rawResult),
          };
        } catch (err: any) {
          return {
            toolCall,
            toolResult: buildErrorToolResultMessage(provider, toolCall, err.message),
          };
        }
      })
    );
  }