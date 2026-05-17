import { Send, Sparkles } from "lucide-react";
import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type AgentType =
  | 'hotelSupervisorNode'
  | 'searchAgentNode'
  | 'recursiveSearchAgentNode';

interface InputBarProps {
  input: string;
  isProcessing: boolean;
  userId: string;
  compact?: boolean;
  selectedAgent: AgentType;
  onAgentChange: (agent: AgentType, starterPrompt: string) => void;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const LAPIS = '#26619C';
const LAPIS_DARK = '#1F4E8C';

const AGENTS = [
  {
    id: 'hotelSupervisorNode' as AgentType,
    label: 'Hotel Booking Supervisor',
    description:
      'Orchestrates multiple sub-agents to search, compare, and book hotels. Two HITL steps.',
    starter: 'Find and help me book available hotels for next weekend, 2 guests',
  },
  {
    id: 'searchAgentNode' as AgentType,
    label: 'ReAct Search',
    description:
      'A reasoning + acting agent that searches the web iteratively. Great for factual lookups, current events, and research questions.',
    starter: 'What are the most popular AI models and their stregths and weaknesses?+',
  },
  {
    id: 'recursiveSearchAgentNode' as AgentType,
    label: 'Recursive ReAct Search',
    description:
      'Breaks complex queries into sub-questions and searches recursively. Use this for in-depth research that needs multiple angles.',
    starter: 'Give me a detailed report on the causes of World War 2, examined from the perspective of opposing sides',
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export function InputBar({
  input,
  isProcessing,
  userId,
  compact = false,
  selectedAgent,
  onAgentChange,
  onChange,
  onSend,
  onKeyPress,
}: InputBarProps) {
  const [focused, setFocused] = useState(false);

  // Selects an agent and pre-fills the input with its starter prompt,
  // then immediately sends it.
  const handleAgentCard = (agent: (typeof AGENTS)[number]) => {
    onAgentChange(agent.id, agent.starter);
    onChange(agent.starter);
    // Small delay so the parent state settles before sending
    setTimeout(() => onSend(), 0);
  };

  return (
    <div className={compact ? 'w-full' : 'w-full max-w-3xl'}>

      {/* ── Input card ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl transition-all duration-200"
        style={{
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: focused
            ? `1.5px solid ${LAPIS}55`
            : '1.5px solid rgba(255,255,255,0.70)',
          boxShadow: focused
            ? `0 8px 32px rgba(38,97,156,0.13), 0 2px 8px rgba(38,97,156,0.08)`
            : '0 4px 24px rgba(38,97,156,0.07), 0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex gap-3 items-end p-3">
          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => onChange(e.target.value)}
              onKeyPress={onKeyPress}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={
                compact
                  ? 'Ask away...'
                  : 'Ask about hotels, destinations, availability…'
              }
              disabled={isProcessing || !userId}
              rows={1}
              className={`
                w-full resize-none bg-transparent
                text-slate-800 placeholder-slate-400
                focus:outline-none
                disabled:cursor-not-allowed disabled:text-slate-400
                leading-relaxed text-[15px]
                ${compact ? 'py-1.5' : 'py-2'}
              `}
              style={{
                minHeight: compact ? '36px' : '44px',
                maxHeight: compact ? '150px' : '200px',
                height: 'auto',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height =
                  Math.min(target.scrollHeight, compact ? 150 : 200) + 'px';
              }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={onSend}
            disabled={!input.trim() || isProcessing || !userId}
            className={`
              flex items-center gap-2 font-medium text-sm text-white rounded-xl
              transition-all duration-200 active:scale-[0.97]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
              flex-shrink-0
              ${compact ? 'px-4 py-2' : 'px-5 py-2.5'}
            `}
            style={{
              backgroundColor: LAPIS,
              boxShadow: '0 4px 14px rgba(38,97,156,0.30)',
            }}
            onMouseEnter={(e) => {
              if (!(e.currentTarget as HTMLButtonElement).disabled)
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = LAPIS_DARK;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = LAPIS;
            }}
            title="Send Message"
          >
            <Send className="w-4 h-4" />
            {!compact && <span>Send</span>}
          </button>
        </div>
      </div>

      {/* ── Keyboard hint ──────────────────────────────────────────────────── */}
      <p className="mt-2 text-center text-xs text-slate-400">
        Press{' '}
        <kbd
          className="font-mono px-1.5 py-0.5 rounded text-[10px]"
          style={{
            background: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(38,97,156,0.15)',
            color: '#475569',
          }}
        >
          Enter
        </kbd>{' '}
        to send,{' '}
        <kbd
          className="font-mono px-1.5 py-0.5 rounded text-[10px]"
          style={{
            background: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(38,97,156,0.15)',
            color: '#475569',
          }}
        >
          Shift + Enter
        </kbd>{' '}
        for new line
      </p>

      {/* ── Agent cards — full mode only ───────────────────────────────────── */}
      {!compact && (
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {AGENTS.map((agent) => {
            const isSelected = selectedAgent === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => handleAgentCard(agent)}
                disabled={isProcessing || !userId}
                className="
                  group text-left rounded-xl px-4 py-3
                  transition-all duration-200
                  disabled:opacity-40 disabled:cursor-not-allowed
                  active:scale-[0.98]
                "
                style={{
                  background: isSelected
                    ? `rgba(38,97,156,0.08)`
                    : 'rgba(255,255,255,0.45)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: isSelected
                    ? `1.5px solid ${LAPIS}55`
                    : '1.5px solid rgba(255,255,255,0.65)',
                  boxShadow: '0 2px 10px rgba(38,97,156,0.05)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.border = `1.5px solid ${LAPIS}44`;
                  el.style.background = 'rgba(255,255,255,0.65)';
                  el.style.boxShadow = '0 4px 16px rgba(38,97,156,0.10)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.border = isSelected
                    ? `1.5px solid ${LAPIS}55`
                    : '1.5px solid rgba(255,255,255,0.65)';
                  el.style.background = isSelected
                    ? `rgba(38,97,156,0.08)`
                    : 'rgba(255,255,255,0.45)';
                  el.style.boxShadow = '0 2px 10px rgba(38,97,156,0.05)';
                }}
              >
                {/* Label row */}
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles size={11} style={{ color: LAPIS }} className="flex-shrink-0" />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: LAPIS }}
                  >
                    {agent.label}
                  </span>
                </div>
                {/* Description */}
                <p className="text-[12px] text-slate-500 leading-snug mb-1.5 line-clamp-2">
                  {agent.description}
                </p>
                {/* Starter prompt preview */}
                <p className="text-[13px] text-slate-600 leading-snug line-clamp-2 italic">
                  "{agent.starter}"
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}