import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { Bot, Loader2, Sparkles } from 'lucide-react';
import { useCascade } from '@cascaide-ts/react';
import { MessageBubble } from './message-bubble';
import { CanonicalMessage } from './types';
import { Spawns } from './types';

// ---------------------------------------------------------------------------+
// TOOL REGISTRY
// ---------------------------------------------------------------------------
import { HotelOptions } from './tool-ui/hotel-tool';

export type ToolComponentProps = {
  args:        Record<string, any>;
  onComplete:  (result: string) => void;
  isFinished:  boolean;
  savedResult: string | null;
};

export const toolRegistry: Record<string, React.ComponentType<ToolComponentProps>> = {
  present_hotel_options: HotelOptions,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAPIS        = '#26619C';
const LAPIS_LIGHT  = 'rgba(38,97,156,0.08)';
const LAPIS_BORDER = 'rgba(38,97,156,0.25)';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------
type DelegationStatus = 'pending' | 'complete';
type Delegation = {
  subCascadeId: string;
  toolCallId:   string;
  agentName:    string;
  status:       DelegationStatus;
};

const ALLOWED_AGENTS = ['availabilityAgentNode', 'bookingAgentNode'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getDelegationAgentName = (toolName: string): string | null => {
  if (!toolName.startsWith('delegate_to_')) return null;
  const agentName = toolName.replace('delegate_to_', '') + 'Node';
  const isAllowed = ALLOWED_AGENTS.includes(agentName);
  return isAllowed ? agentName : null;
};

const getAgentLabel = (agentName: string) =>
  agentName.includes('availability') ? 'Availability Agent' : 'Booking Agent';

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------
export const MessageList = memo(({
  displayHistory,
  userId,
  addActiveNode,
  handleToolResponse,
}: {
  displayHistory:     CanonicalMessage[];
  userId?:             string | undefined;
  addActiveNode?:      any;
  handleToolResponse?: any; 
}) => {
  const [delegations, setDelegations] = useState<Map<string, Delegation>>(new Map());
  const completedToolCallIds = useRef<Set<string>>(new Set());

  const getDelegationStatus = (toolCallId: string): DelegationStatus | null =>
    delegations.get(toolCallId)?.status ?? null;

  // ── Delegation detection ─────────────────────────────────────────────────
  useEffect(() => {
    const processDelegations = async () => {
      if (displayHistory.length === 0) return;

      const lastAssistantIndex = displayHistory.findLastIndex(
        msg => msg.role === 'assistant' && msg.tool_calls?.length
      );

      if (lastAssistantIndex === -1) return;

      const lastAssistantMessage = displayHistory[lastAssistantIndex];

      const delegationCalls = (lastAssistantMessage.tool_calls ?? []).filter(
        tc => getDelegationAgentName(tc.name) !== null
      );

      for (const toolCall of delegationCalls) {
        if (delegations.has(toolCall.id)) continue;

        const hasToolResult = displayHistory.slice(lastAssistantIndex + 1).some(
          msg => msg.role === 'tool' && msg.tool_result?.tool_call_id === toolCall.id
        );

        if (hasToolResult) {
          completedToolCallIds.current.add(toolCall.id);
          setDelegations(prev => {
            const next = new Map(prev);
            next.set(toolCall.id, {
              subCascadeId: '',
              toolCallId:   toolCall.id,
              agentName:    '',
              status:       'complete',
            });
            return next;
          });
          continue;
        }

        const agentName = getDelegationAgentName(toolCall.name);
        const subtask   = toolCall.args.query as string;

        if (!agentName || !subtask) continue;

        const newSubCascadeId = `sub_cascade_${uuidv4()}`;
        setDelegations(prev => {
          const next = new Map(prev);
          next.set(toolCall.id, {
            subCascadeId: newSubCascadeId,
            toolCallId:   toolCall.id,
            agentName,
            status:       'pending',
          });
          return next;
        });

        const spawns: Spawns = {
          [agentName]: {
            cascadeId:          newSubCascadeId,
            history:            [{ role: 'user', content: subtask }] as CanonicalMessage[],
            originalToolCallId: toolCall.id,
            userId,
          },
        };

        try {
          await addActiveNode(spawns);
        } catch (err) {}
      }
    };

    processDelegations();
  }, [displayHistory.length, displayHistory[displayHistory.length - 1]]);

  // ── Handle sub-cascade completion ────────────────────────────────────────
  const handleDelegationComplete = useCallback((toolCallId: string, result: string) => {
    completedToolCallIds.current.add(toolCallId);

    const toolMsg: CanonicalMessage = {
      role:        'tool',
      tool_result: {
        tool_call_id: toolCallId,
        content:      result || 'Sub-cascade completed successfully.',
      },
    };

    handleToolResponse(toolMsg);

    setDelegations(prev => {
      const next     = new Map(prev);
      const existing = next.get(toolCallId);
      if (existing) next.set(toolCallId, { ...existing, status: 'complete' });
      return next;
    });
  }, [handleToolResponse]);

  // Cleanup completed delegations once all parallel ones finish
  useEffect(() => {
    const values = Array.from(delegations.values());
    if (values.length === 0) return;
    if (values.some(d => d.status === 'pending')) return;

    setDelegations(prev => {
      const next = new Map(prev);
      for (const [id, d] of next) {
        if (d.status === 'complete') next.delete(id);
      }
      return next;
    });
  }, [delegations]);

  const showAILoading = useMemo(() => {
    if (displayHistory.length === 0) return false;
    if (delegations.size !== 0) return false;
    const last = displayHistory[displayHistory.length - 1];
    if (last?.role !== 'assistant') return true;
    return !last.content && !last.thinking && !last.tool_calls?.length;
  }, [displayHistory.length, displayHistory[displayHistory.length - 1], delegations.size]);

  const activeDelegations = useMemo(
    () => Array.from(delegations.values()).filter(d => d.status === 'pending'),
    [delegations]
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="max-w-4xl mx-auto">

        {displayHistory.map((msg, idx) => {
          if (msg.role === 'tool') return null;

          const toolResults: Record<string, CanonicalMessage> = {};
          msg.tool_calls?.forEach(tc => {
            const result = displayHistory.slice(idx + 1).find(
              m => m.role === 'tool' && m.tool_result?.tool_call_id === tc.id
            );
            if (result) toolResults[tc.id] = result;
          });

          const delegationCall = msg.tool_calls?.find(
            tc => getDelegationAgentName(tc.name) !== null
          );

          return (
            <div key={`${idx}-${msg.role}`}>
              <MessageBubble
                message={msg}
                userId={userId}
                delegationStatus={delegationCall ? getDelegationStatus(delegationCall.id) : null}
                onToolComplete={async (toolCallId, result) => {
                  await handleToolResponse({
                    role: 'tool',
                    tool_result: { tool_call_id: toolCallId, content: result },
                  } satisfies CanonicalMessage);
                }}
                toolResults={toolResults}
              />
            </div>
          );
        })}

        {/* ── AI thinking indicator ── */}
        {showAILoading && (
          <div className="py-3 max-w-4xl mx-auto">
            <div className="flex items-start gap-3">

              {/* Lapis bot avatar */}
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                style={{ backgroundColor: LAPIS }}
              >
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>

              {/* Thinking pill */}
              <div
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                style={{
                  background: 'rgba(255,255,255,0.50)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  border: `1px solid rgba(255,255,255,0.65)`,
                  boxShadow: '0 2px 10px rgba(38,97,156,0.07)',
                }}
              >
                <Loader2
                  className="w-3.5 h-3.5 animate-spin flex-shrink-0"
                  style={{ color: LAPIS }}
                />
                <span className="text-sm text-slate-500 font-medium">Thinking…</span>

                {/* Animated dots */}
                <div className="flex items-center gap-1 ml-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1 h-1 rounded-full animate-bounce"
                      style={{
                        backgroundColor: LAPIS,
                        opacity: 0.5,
                        animationDelay: `${i * 150}ms`,
                        animationDuration: '900ms',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Active delegation cards ── */}
        {activeDelegations.map(delegation => (
          <CascadeMonitor
            key={delegation.subCascadeId}
            subCascadeId={delegation.subCascadeId}
            toolCallId={delegation.toolCallId}
            agentName={delegation.agentName}
            onComplete={handleDelegationComplete}
          />
        ))}
      </div>
    </div>
  );
});

MessageList.displayName = 'MessageList';

// ---------------------------------------------------------------------------
// CascadeMonitor
// ---------------------------------------------------------------------------
const CascadeMonitor = memo(({
  subCascadeId,
  toolCallId,
  agentName,
  onComplete,
}: {
  subCascadeId: string;
  toolCallId:   string;
  agentName:    string;
  onComplete:   (toolCallId: string, result: string) => void;
}) => {
  const { cascadeState, isComplete } = useCascade(subCascadeId);

  useEffect(() => {
    if (!isComplete || !cascadeState) return;

    const history: CanonicalMessage[] = cascadeState.history ?? [];

    if (!history.length) return;

    const lastAssistant = [...history].reverse().find(msg => msg.role === 'assistant');

    let result = 'Sub-cascade completed.';

    if (lastAssistant) {
      if (lastAssistant.content?.trim()) {
        result = lastAssistant.content;
      } else if (lastAssistant.tool_calls?.length) {
        const calls = lastAssistant.tool_calls.map(tc => tc.name).join(', ');
        result = `Sub-cascade completed via tools: ${calls}`;
      }
    }

    onComplete(toolCallId, result);
  }, [isComplete, cascadeState, agentName, toolCallId, onComplete]);

  const label = getAgentLabel(agentName);

  return (
    <div className="py-3 max-w-4xl mx-auto">
      <div className="flex items-start gap-3">

        {/* Agent avatar */}
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
          style={{ backgroundColor: LAPIS }}
        >
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>

        {/* Agent card */}
        <div
          className="flex-1 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.45)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: `1px solid rgba(255,255,255,0.65)`,
            borderLeft: `3px solid ${LAPIS}`,
            boxShadow: '0 2px 12px rgba(38,97,156,0.08)',
          }}
        >
          {/* Label row */}
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: LAPIS }}
            >
              {label}
            </span>

            {/* Animated "working" badge */}
            <span
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ml-auto"
              style={{
                color: LAPIS,
                backgroundColor: LAPIS_LIGHT,
                border: `1px solid ${LAPIS_BORDER}`,
              }}
            >
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              working
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="h-0.5 w-full overflow-hidden"
            style={{ backgroundColor: LAPIS_LIGHT }}
          >
            <div
              className="h-full rounded-full animate-pulse"
              style={{
                width: '60%',
                backgroundColor: LAPIS,
                opacity: 0.5,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

CascadeMonitor.displayName = 'CascadeMonitor';