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
import { callLLM, CanonicalToolCall, ToolParam,
buildErrorToolResultMessage,
buildToolResultMessage, buildTools,
CanonicalMessage, LLMProvider,
toProviderHistory
} from '@cascaide-ts/helpers';



  type SearchAgentPrepOut = {
    history: any[]; 
    cascadeId: string;
  };
  
  
  export const recursiveSearchAgentNode: StreamingServerNodeDefinition<SearchAgentPrepOut> = {
    name: 'recursiveSearchAgentNode',
    isUINode: false,
    env: 'server',
    isStreaming: true,
  
    async prep(cascadeContext: WorkflowContext, initialContext: any): Promise<SearchAgentPrepOut> {
        const cascadeId = initialContext.cascadeId;
        const dataArray = cascadeContext[cascadeId];
        const canonicalHistory = dataArray.flatMap((item: any) => item.history || []);


        const history = toProviderHistory('gemini-genai', canonicalHistory);    

      
        return { history, cascadeId };
      },
  
    async exec(prepOutput: SearchAgentPrepOut, controller?: CascadeController): Promise<StreamConfig> {
      const { history } = prepOutput;


      const systemPrompt = `
            You are an expert technical AI assistant equipped with web search capabilities.
            You have access to the following tools:
            1. search_tool
            Use for general web searches, finding documentation, or retrieving facts.
            Pass a clear, concise query.
            2. delegate_to_self
            Use this tool to break down tasks into subtasks and delegate to a fresh AI agent

            Basis how complex the query is the sub agents may be allowed recurively delegate to newer agent instances.

      `.trim();


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
                {
                    name:        'delegate_to_self',
                    description: 'Break down a search task and delegate to instances of yourself',
                    parameters: {
                      type: 'object' as const,
                      properties: {
                        subtask: { type: 'string', description: 'The search subtask for the new instances to work on, be descriptive about answer expectations' },
                      },
                      required: ['subtask'],
                    },
                  },
              ];

      const geminiTools = buildTools('gemini-genai', searchToolParams);
      const {stream, provider} = await callLLM('gemini-genai', 'gemini-3.1-flash-lite', systemPrompt, history, geminiTools, true);
      return { stream, provider };
    },
  
    async post(execOutput: StreamingExecOutput): Promise<PostResult> {
      const { assistantMessage, uiAssistantMessage, history, cascadeId, userId } = execOutput;

      const pendingToolCalls = assistantMessage.tool_calls ?? [] as CanonicalToolCall[]



      const isDifferent = uiAssistantMessage !== undefined &&
      JSON.stringify(assistantMessage) !== JSON.stringify(uiAssistantMessage);
  
      return {
        updates: {
          [cascadeId as string]: {
            history:    [assistantMessage as CanonicalMessage],
            status:     pendingToolCalls.length > 0 ? 'calling_tool' : 'complete',
            lastUpdate: Date.now(),

          },
        } as Updates,
        ...(isDifferent ? {
          uiUpdates: {
            [cascadeId as string]: { history: [uiAssistantMessage as CanonicalMessage], status: pendingToolCalls.length > 0 ? 'calling_tool' : 'complete' },
          },
        } : {}),
        spawns: pendingToolCalls.length > 0
          ? {  // we spawn the hardcoded searchToolNode if there are tool calls
              ['recursiveSearchToolNode']: {
                history:            [assistantMessage],
                toolCallsToExecute: pendingToolCalls,
                cascadeId,
              },
            } as Spawns
          : undefined,

      } as PostResult ;

  }
  };


import { v7 as uuidv7 } from 'uuid';
import { tavily } from "@tavily/core";


const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

const MAX_DEPTH = 2;

function getDepth(cascadeId: string): number {
  const match = cascadeId.match(/^call(\d+)_/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

function makeSubCascadeId(parentCascadeId: string): string {
  const depth = getDepth(parentCascadeId);
  return `call${depth + 1}_${uuidv7()}`;
}


type SearchToolPrepOut = {
  searchCalls: CanonicalToolCall[];
  delegationCalls: CanonicalToolCall[];
  cascadeId: string;
  depth: number;
  userId: string;
}

type SearchToolExecOut = {
  results: CanonicalMessage[];
  cascadeId: string;
}


export const recursiveSearchToolNode: ServerNodeDefinition<SearchToolPrepOut, SearchToolExecOut> = {
  name: 'recursiveSearchToolNode',
  isUINode: false,
  env: 'server',
  isStreaming: false,

  async prep(cascadeContext: WorkflowContext, initialContext: any): Promise<SearchToolPrepOut> {
    const { toolCallsToExecute, cascadeId, userId } = initialContext;
    const all: CanonicalToolCall[] = toolCallsToExecute ?? [];

    const searchCalls     = all.filter(tc => tc.name === 'search_tool');
    const delegationCalls = all.filter(tc => tc.name === 'delegate_to_self');
    const depth           = getDepth(cascadeId);

    return { searchCalls, delegationCalls, cascadeId, depth , userId};
  },

  async exec(prepOutput: SearchToolPrepOut, controller?: CascadeController): Promise<SearchToolExecOut> {
    const { searchCalls, delegationCalls, cascadeId, depth, userId } = prepOutput;
  
    // ── 1. Regular searches ───────────────────────────────────────────────
    const searchResultsPromise = executeToolCalls(
      searchCalls,
      {
        search_tool: async ({ query }) => {
          return await tvly.search(query, {
            searchDepth: 'basic',
            maxResults: 5,
            topic: 'general',
          });
        },
      },
      'gemini-genai',
    );
  
    // ── 2. Pre-generate Sub-Cascade IDs ──────────────────────────────────
    // This satisfies your requirement to have them before the Promise.all
    const delegationTasks = delegationCalls.map(toolCall => ({
      toolCall,
      subCascadeId: makeSubCascadeId(cascadeId)
    }));
    if (delegationTasks.length > 0) {
      await controller!.spawn({
        ['tracker']: {
          history: delegationTasks,
          userId
        },
      });
    }
    

    // ── 3. Delegation execution ───────────────────────────────────────────
    const delegationResultsPromise = Promise.all(
      delegationTasks.map(async ({ toolCall, subCascadeId }): Promise<{ toolCall: CanonicalToolCall; toolResult: CanonicalMessage }> => {
  
        if (depth >= MAX_DEPTH) {
          return {
            toolCall,
            toolResult: buildErrorToolResultMessage(
              'gemini-genai',
              toolCall,
              `Max delegation depth (${MAX_DEPTH}) reached.`,
            ),
          };
        }
  
        // Use the pre-generated subCascadeId here
        await controller!.spawn({
          ['recursiveSearchAgentNode']: {
            cascadeId: subCascadeId,
            history: [
              {
                role: 'user',
                content: toolCall.args.subtask,
              } as CanonicalMessage,
            ],
            userId
          },
        });
  
        const subState = controller!.getCascadeState(subCascadeId);
        const subHistory: CanonicalMessage[] = subState?.history ?? [];
        const lastMessage = subHistory[subHistory.length - 1];
  
        if (!lastMessage) {
          return {
            toolCall,
            toolResult: buildErrorToolResultMessage(
              'gemini-genai',
              toolCall,
              `Sub-agent cascade ${subCascadeId} produced no messages.`,
            ),
          };
        }
  
        return {
          toolCall,
          toolResult: buildToolResultMessage('gemini-genai', toolCall, lastMessage),
        };
      }),
    );
  
    // ── 4. Final Merge ────────────────────────────────────────────────────
    const [searchResults, delegationResults] = await Promise.all([
      searchResultsPromise,
      delegationResultsPromise,
    ]);
  
    const toolResultMessages = [...searchResults, ...delegationResults]
      .map(({ toolResult }) => toolResult);
  
    return { results: toolResultMessages, cascadeId };
  },


  async post(execOutput: SearchToolExecOut): Promise<PostResult> {
    const { results, cascadeId } = execOutput;
    return {
      updates: {
        [cascadeId as string]: {
          history: results,
          status:  'complete',
        },
      } as Updates,
      spawns: {
        ['recursiveSearchAgentNode']: {
          history:  results,
          cascadeId,
        },
      } as Spawns,
    };
  },
};


export type ManualToolExecute = (args: Record<string, any>) => Promise<unknown>;
export type ManualToolExecuteMap = Record<string, ManualToolExecute>;

export async function executeToolCalls(
  calls: CanonicalToolCall[],
  executeMap: ManualToolExecuteMap,
  provider: LLMProvider,
): Promise<{ toolCall: CanonicalToolCall; toolResult: CanonicalMessage }[]> {
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