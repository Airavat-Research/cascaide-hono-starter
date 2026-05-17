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
import { callLLM, CanonicalToolCall,
ToolParam,
buildTools,
CanonicalMessage,
toProviderHistory
} from '@cascaide-ts/helpers';


  type bookingAgentPrepOut = {
    history: any[]; //Todo : type should be geminiMessage[], as we convert before passing
    cascadeId: string;
  };
  
  
  export const bookingAgentNode: StreamingServerNodeDefinition<bookingAgentPrepOut> = {
    name: 'bookingAgentNode',
    isUINode: false,
    env: 'server',
    isStreaming: true,
  
    async prep(cascadeContext: WorkflowContext, initialContext: any): Promise<bookingAgentPrepOut> {
        const cascadeId = initialContext.cascadeId;
        const dataArray = cascadeContext[cascadeId];
        const canonicalHistory = dataArray.flatMap((item: any) => item.history || []);

        const history = toProviderHistory('gemini-genai', canonicalHistory);    

      
        return { history, cascadeId };
      },
  
    async exec(prepOutput: bookingAgentPrepOut, controller?: CascadeController): Promise<StreamConfig> {
      const { history } = prepOutput;
      const systemPrompt = `
      ### ROLE
      You are the Payment Processor Agent. Your job is to finalize bookings by generating payment links for hotels.
      
      ### GOALS
      1. Extract the 'hotel' and 'room type' from the Supervisor's query string.
      2. Call the 'processBookingPayment' tool with these details.
      3. Provide the user with the Booking ID .
      
      ### RULES
      - NEVER simulate a successful booking without calling the tool.
      - Always proceed to book the hotel after you recieve the hotel name and room type
      
      ### RESPONSE FORMAT
      - "I've reserved your room at [hotel name]."
       `.trim();

        const bookingToolParams: ToolParam[] = [
            {
                name: 'processBookingPayment',
                description: `Generates a payment link for hotel booking.`,
                parameters: {
                  type: 'object' as const,
                  properties: {
                    "hotelName": {
                        "type": "string",
                        "description": "The name of the hotel to be booked."
                      },
                      "roomType": {
                        "type": "string",
                        "description": "the room type that needs to be booked."
                      }
                    },
                    "required": ["hotelName", "roomType"]
                },
              },
            ];

      const geminiTools = buildTools('gemini-genai', bookingToolParams);
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
          ? {  // we spawn the hardcoded bookingToolNode if there are tool calls
              ['bookingUiNode']: {
                history:            [assistantMessage],
                toolCallsToExecute: pendingToolCalls,
                cascadeId,
              },
            } as Spawns
          : undefined,
      };

  }
  };


