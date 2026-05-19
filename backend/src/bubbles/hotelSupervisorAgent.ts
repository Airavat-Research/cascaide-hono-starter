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
toProviderHistory,
LLMProvider,
buildErrorToolResultMessage,
buildToolResultMessage
} from '@cascaide-ts/helpers';

 type hotelSupervisorPrepOut = {
    history: any[]; //Todo : type should be providerMessage[], as we convert before passing
    cascadeId: string;
  };


  
  export const hotelSupervisorNode: StreamingServerNodeDefinition<hotelSupervisorPrepOut> = {
    name: 'hotelSupervisorNode',
    isUINode: false,
    env: 'server',
    isStreaming: true,
  
    async prep(cascadeContext: WorkflowContext, initialContext: any): Promise<hotelSupervisorPrepOut> {
        const cascadeId = initialContext.cascadeId;

        const dataArray = cascadeContext[cascadeId];
        const canonicalHistory = dataArray.flatMap((item: any) => item.history || []);

        const history = toProviderHistory('gemini-genai', canonicalHistory);    

      
        return { history, cascadeId };
      },
  
    async exec(prepOutput: hotelSupervisorPrepOut, controller?: CascadeController): Promise<StreamConfig> {
      const { history } = prepOutput;

      const systemPrompt = `
      ### ROLE
      You are a Hotel Booking Supervisor. Your job is to act as the central brain, routing user requests to the correct sub-agent and maintaining the state of the booking process.
      
      Do not ask follow ups. Simply delegate to the right agents and report back. Never ask follow up questions, the avabailability and booking agents have all the details.
      
      ### SUB-AGENTS
      1. Availability_Checker: Use this when the user asks about specific hotels or general availability.
      2. Payment_Processor: Use this after 'present_hotel_options' tool gives you the date and, hotel and room type to book
      
      ### OPERATIONAL RULES
      - If the user intent is vague, call Availability_Checker.
      - If details are missing for booking, prompt the user.
      - Use present_hotel_options to display the available hotels.
      
      **CRITICAL**: Always use present_hotel_options tool to present results.
      `.trim();
      /*
             We will construct the tools here. We will write the tool definitions in `ToolParam` shape and 
             convert it into provider specific shape using `buildTools` helper.
      */


        const hotelToolParams: ToolParam[] = [
        {
            name: 'delegate_to_availabilityAgent',
            description:
            'Delegates availability-related tasks. Use this for checking slots, finding open turfs, or answering questions about slot timings of the turfs.',
            parameters: {
            type: 'object',
            properties: {
                query: {
                type: 'string',
                description:
                    'The natural language instruction for the sub-agent. Example: "Check if Apex Arena has slots open after 6 PM today."',
                },
            },
            required: ['query'],
            },
        },

        {
            name: 'delegate_to_bookingAgent',
            description:
            'Delegates payment and booking finalization. Use this when the user is ready to pay for a specific turf and slot.',
            parameters: {
            type: 'object',
            properties: {
                query: {
                type: 'string',
                description:
                    'The natural language instruction for the payment agent. Example: "Process payment for Downtown Turf for the 7 PM - 8 PM slot."',
                },
            },
            required: ['query'],
            },
        },

        {
          name: 'present_hotel_options',
          description:
            'Presents a list of hotels with their main image, description, and available room types with pricing.',
          parameters: {
            type: 'object',
            properties: {
              hotels: {
                type: 'array',
                description: 'List of hotels to present to the user.',
                items: {
                  type: 'object',
                  properties: {
                    hotel_name: { type: 'string' },
                    hotel_image_url: { type: 'string' },
                    description: { type: 'string' },
                    available_rooms: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          room_type: { type: 'string' },
                          price: { type: 'number' },
                        },
                        required: ['room_type', 'price'],
                      },
                    },
                  },
                  required: ['hotel_name', 'hotel_image_url', 'description', 'available_rooms'],
                },
              },
            },
            required: ['hotels'],
          },
        } as unknown as ToolParam,
      ];

      const geminiTools = buildTools('gemini-genai', hotelToolParams);
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
            //you can add more fields if you want, it will be written to the cascade state
            // what's mandatory is history and status
          },
        } as Updates,
        ...(isDifferent ? {
          uiUpdates: {
            [cascadeId as string]: { history: [uiAssistantMessage as CanonicalMessage], status: pendingToolCalls.length > 0 ? 'calling_tool' : 'complete' },
          },
        } : {}),
        spawns: undefined,

      };

  }
  };


  type hotelToolPrepOut = {
    toolCallsToExecute : CanonicalToolCall[];
    cascadeId: string;
  }

  type hotelToolExecOut = {
    results: CanonicalMessage[];
    cascadeId: string;
  }
  import { tavily } from "@tavily/core";


  const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });



  export const hotelToolNode: ServerNodeDefinition<hotelToolPrepOut, hotelToolExecOut> = {
    name: 'hotelToolNode',
    isUINode: false,
    env: 'server',
    isStreaming: false,

    async prep(cascadeContext: WorkflowContext, initialContext: any): Promise<hotelToolPrepOut> {
        const { toolCallsToExecute, cascadeId } = initialContext

        return { toolCallsToExecute: toolCallsToExecute ?? [], cascadeId};

    },

    async exec(prepOutput: hotelToolPrepOut, controller?: CascadeController ) : Promise<hotelToolExecOut> {

        const {toolCallsToExecute, cascadeId} = prepOutput;
        const results = await executeToolCalls(toolCallsToExecute, {
            available_hotels: getHotels
          }, 'gemini-genai');
          const toolResultMessages = results.map(({ toolResult }) => toolResult);

        return {results: toolResultMessages, cascadeId}

    },

    async post(execOutput: hotelToolExecOut) : Promise<PostResult> {

        const {results, cascadeId} = execOutput;
        return {
            updates: {
              [cascadeId as string]: {
                history:    results,
                status:     'complete',

              },
            } as Updates,
            spawns :{
                ['hotelSupervisorNode'] :  {
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

  async function getHotels(): Promise<string> {
    const hostelData = [
      {
        id: "t1",
        hotel: "Sunview Beach Resort",
        available_rooms: [{'room type':'deluxe suite','perNightCost':4000},{'room type':'double bed','perNightCost':2000}],
        description:"Close to Papanasam Beach, this opulent property features comfortable rooms, an azure swimming pool, a private beach and a host of modern amenities.There is a sauna room available to cater to your wellness needs.",
        image_url:"https://gos3.ibcdn.com/13f68fb5-1551-4b5b-9cff-64296e2f85e0.jpeg"
      },
      {
        id: "t2",
        hotel: "Elixir Cliff Beach Resort",
        available_rooms: [{'room type':'deluxe seaview suite','perNightCost':6000}],
        description:"Overlooking the majestic Arabian Sea, this lavish property features stunning rooms, an incredible dining spot, an infinity pool and an extensive range of facilities.",
        image_url:"https://gos3.ibcdn.com/f20a131c53ed11eb90830242ac110002.jpg"
      },
      {
        id: "t3",
        hotel: "WEST BAY MARISOL",
        available_rooms: [{'room type':'standard','perNightCost':4000},{'room type':'deluxe','perNightCost':6000},{'room type':'executive','perNightCost':9000}],
        description:"The property offers a welcoming and comfortable environment, featuring a range of well-appointed rooms designed for both relaxation and convenience. With modern amenities, exceptional service, and a prime location, it caters to both business and leisure travelers. Guests can enjoy various on-site facilities, including dining options, recreational areas, and more, ensuring a memorable stay.",
        image_url:"https://gos3.ibcdn.com/2a3a165f-ec99-4644-97e2-af49828123e3.jpg"
      },
      {
        id: "t4",
        hotel: "Zostel Varkala",
        available_rooms: [{'room type':'mixed dorm','perNightCost':1000},{'room type':'standard','perNightCost':2000},{'room type':'A-Frame Cottage','perNightCost':5000}],
        description:"Set amid swaying coconut palms and facing the Arabian Sea, this scenic property is a 5-minute stroll from Varkala’s famed Black Sand Beach.The rooftop is equipped with patio loungers and inviting spots to work, dine, paint, or simply soak in the panoramic sea vistas.",
        image_url:"https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1a/23/20/5a/zostel-varkala-terrace.jpg?w=900&h=500&s=1"
      },
      {
        id: "t5",
        hotel: "Eva Beach Hotel",
        available_rooms: [{'room type':'DELUXE AC','perNightCost':4000},{'room type':'standard AC','perNightCost':3000}],
        description:"Located in Varkala Cliff, within 100 meters of Varkala Beach and 600 meters of Odayam Beach, Eva Beach Hotel provides accommodation with a terrace, free wifi throughout the property, and free private parking for guests who drive. Rooms are complete with a private bathroom, while certain rooms at the resort also offer a seating area.Popular points of interest near Eva Beach Hotel include Aaliyirakkm Beach, Varkala Cliff, and Janardhanaswamy Temple. The nearest airport is Thiruvananthapuram International, 41 km from the accommodation, and the property offers a paid airport shuttle service.",
        image_url:"https://gos3.ibcdn.com/0f02787c-de9e-493e-bf7f-ab0d50b8c17e.jpeg"
      }
    ];
  
    return JSON.stringify(hostelData, null, 2);
  }