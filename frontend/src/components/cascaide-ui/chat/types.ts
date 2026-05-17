
export interface CanonicalToolCall {
    id:   string;
    name: string;
    args: Record<string, any>; // always a parsed object, never a JSON string
  }
  
  export interface CanonicalToolResult {
    tool_call_id: string;
    name?:        string;   // required by Gemini, optional elsewhere
    content:      string;   // always stringified
  }
  
  export interface CanonicalMessage {
    role:     'user' | 'assistant' | 'tool';
    content?: string;    // text response, always a plain string
    thinking?: string;  // reasoning / thinking, always a plain string
  
    // Present on assistant messages when the LLM wants to call tools
    tool_calls?: CanonicalToolCall[];
  
    // Present on tool messages (one message per result)
    tool_result?: CanonicalToolResult;
  
    /**
     * Provider-specific data with no canonical equivalent.
     * Preserved as-is for same-provider replay. Dropped on provider switch.
     *
     * Known extension keys:
     *   anthropic.signature       — thinking block signature (extended thinking)
     *   gemini.thoughtSignature   — Gemini's thought signature
     *   gemini.parts              — full raw parts array for faithful Gemini replay
     *   openai_responses.output   — full raw output items array for Responses API replay
     */
    extensions?: {
      anthropic?:        Record<string, any>;
      gemini?:           Record<string, any>;
      openai_responses?: Record<string, any>;
      openai_chat?:      Record<string, any>;
      [key: string]:     Record<string, any> | undefined;
    };
  }

  export interface ToolParam {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  }
  
  export type NormalizedToolCall = CanonicalToolCall;
  
  export type LLMProvider = 'anthropic' | 'openai-responses' | 'gemini-genai' | 'openai';

  export type SpawnContext<T = Record<string, any>> = {
    cascadeId?: string;
    history: any[];
    userId?: string;
  } & T;
  
  export type Spawns = Record<string, SpawnContext>;
  
  