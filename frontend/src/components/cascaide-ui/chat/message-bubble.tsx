import { memo, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Wrench, ChevronDown, Loader2, Brain, Bot, CheckCircle2 } from 'lucide-react';
import { toolRegistry } from './message-list';
import type { CanonicalMessage, CanonicalToolCall } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAPIS       = '#26619C';
const LAPIS_LIGHT = 'rgba(38,97,156,0.08)';
const LAPIS_BORDER = 'rgba(38,97,156,0.35)';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message:           CanonicalMessage;
  userId:            string | undefined;
  delegationStatus?: 'pending' | 'complete' | null;
  onToolComplete:    (toolCallId: string, result: string) => Promise<void>;
  toolResults:       Record<string, CanonicalMessage>;
}

interface ToolBlockProps {
  value:             CanonicalToolCall[];
  delegationStatus?: 'pending' | 'complete' | null;
  onToolComplete:    (toolCallId: string, result: string) => Promise<void>;
  toolResults:       Record<string, CanonicalMessage>;
}

// ---------------------------------------------------------------------------
// AssistantAvatar
// ---------------------------------------------------------------------------

const AssistantAvatar = () => (
  <div
    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
    style={{ backgroundColor: LAPIS }}
  >
    <Bot className="w-3.5 h-3.5 text-white" />
  </div>
);

// ---------------------------------------------------------------------------
// ReasoningBlock — collapsible, lapis accented
// ---------------------------------------------------------------------------

const ReasoningBlock = memo(({ value }: { value: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!value) return null;

  return (
    <div className="py-3 max-w-4xl mx-auto">
      <div className="flex gap-3 items-start">
        {/* Spacer to align with assistant messages */}
        <div className="w-7 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div
            className="rounded-xl overflow-hidden transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.45)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid rgba(255,255,255,0.65)`,
              boxShadow: '0 2px 8px rgba(38,97,156,0.06)',
            }}
          >
            <button
              onClick={() => setIsOpen(prev => !prev)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/30"
            >
              <Brain className="w-3.5 h-3.5 flex-shrink-0" style={{ color: LAPIS }} />
              <span
                className="text-xs font-semibold uppercase tracking-wider flex-1"
                style={{ color: LAPIS }}
              >
                Reasoning
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200`}
                style={{
                  color: LAPIS,
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>

            {isOpen && (
              <div
                className="px-3 pb-3 pt-0 border-t"
                style={{
                  borderColor: LAPIS_BORDER,
                  background: LAPIS_LIGHT,
                }}
              >
                <p className="text-xs text-slate-600 font-mono mt-2 whitespace-pre-wrap leading-relaxed">
                  {value}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
ReasoningBlock.displayName = 'ReasoningBlock';

// ---------------------------------------------------------------------------
// TextBlock — assistant prose with avatar
// ---------------------------------------------------------------------------

const TextBlock = memo(({ value }: { value: string }) => (
  <div className="py-3 max-w-4xl mx-auto">
    <div className="flex gap-3 items-start">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="text-[15px] leading-relaxed text-slate-800">
          <MarkdownContent content={value} />
        </div>
      </div>
    </div>
  </div>
));
TextBlock.displayName = 'TextBlock';

// ---------------------------------------------------------------------------
// messageRegistry
// ---------------------------------------------------------------------------

const createMessageRegistry = (toolBlockProps: Omit<ToolBlockProps, 'value'>) => ({
  thinking:   ({ value }: { value: string })           => <ReasoningBlock value={value} />,
  content:    ({ value }: { value: string })           => <TextBlock value={value} />,
  tool_calls: ({ value }: { value: CanonicalToolCall[] }) => <ToolBlock value={value} {...toolBlockProps} />,
});

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export const MessageBubble = memo(({
  message,
  userId,
  delegationStatus,
  onToolComplete,
  toolResults,
}: MessageBubbleProps) => {
  const isUser = message.role === 'user' && !message.tool_result;

  const registry = useMemo(
    () => createMessageRegistry({ delegationStatus, onToolComplete, toolResults }),
    [delegationStatus, onToolComplete, toolResults]
  );

  const blocks = useMemo(() => {
    if (isUser) return null;

    const entries: [string, any][] = [
      ['thinking',   message.thinking],
      ['content',    message.content],
      ['tool_calls', message.tool_calls],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');

    return entries
      .map(([key, value]) => {
        const Block = registry[key as keyof typeof registry];
        if (!Block) return null;
        return <Block key={key} value={value as any} />;
      })
      .filter(Boolean);
  }, [message, registry, isUser]);

  if (!isUser && (!blocks || blocks.length === 0)) return null;

  return (
    <>
      {isUser ? (
        /* ── User bubble — gray pill, unchanged ── */
        <div className="py-3 max-w-4xl mx-auto">
          <div className="flex justify-end">
            <div className="bg-gray-100 rounded-2xl px-4 py-3 max-w-full sm:max-w-2xl">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs font-medium mt-0.5">
                  U
                </div>
                <div className="text-[15px] leading-relaxed text-gray-900 pt-0.5 break-all">
                  <MarkdownContent content={message.content ?? ''} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        blocks
      )}
    </>
  );
}, (prev, next) => {
  if (prev.userId !== next.userId) return false;
  if (prev.delegationStatus !== next.delegationStatus) return false;
  if (prev.toolResults !== next.toolResults) return false;
  return JSON.stringify(prev.message) === JSON.stringify(next.message);
});

MessageBubble.displayName = 'MessageBubble';

// ---------------------------------------------------------------------------
// ToolBlock
// ---------------------------------------------------------------------------

const ToolBlock = memo(({
  value,
  delegationStatus,
  onToolComplete,
  toolResults,
}: ToolBlockProps) => {
  const [openToolCalls, setOpenToolCalls] = useState<Record<number, boolean>>({});

  const toggleOpen = useCallback((index: number) => {
    setOpenToolCalls(prev => ({ ...prev, [index]: !prev[index] }));
  }, []);

  // If every tool call is a delegation call, nothing will render — skip the
  // avatar + wrapper entirely to avoid the ghost empty row.
  const visibleToolCalls = value.filter(tc => !tc.name.startsWith('delegate_to_'));
  if (visibleToolCalls.length === 0) return null;

  return (
    <div className="py-3 max-w-4xl mx-auto">
      <div className="flex gap-3 items-start">
        {/* Avatar spacer — aligns tool blocks under the assistant avatar column */}
        <AssistantAvatar />
        <div className="flex-1 min-w-0 space-y-2">
          {value.map((toolCall, idx) => {
            const savedResult = toolResults[toolCall.id] ?? null;
            return (
              <ToolCallRenderer
                key={toolCall.id ?? idx}
                toolCall={toolCall}
                delegationStatus={delegationStatus}
                onComplete={(result: string) => onToolComplete(toolCall.id, result)}
                isFinished={!!savedResult}
                savedResult={savedResult?.tool_result?.content ?? null}
                isOpen={openToolCalls[idx] || false}
                onToggle={() => toggleOpen(idx)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

ToolBlock.displayName = 'ToolBlock';

// ---------------------------------------------------------------------------
// ToolCallRenderer
// ---------------------------------------------------------------------------

const ToolCallRenderer = memo(({
  toolCall,
  delegationStatus,
  onComplete,
  isFinished,
  savedResult,
  isOpen,
  onToggle,
}: {
  toolCall:          CanonicalToolCall;
  delegationStatus?: 'pending' | 'complete' | null;
  onComplete:        (result: string) => void;
  isFinished:        boolean;
  savedResult:       string | null;
  isOpen:            boolean;
  onToggle:          () => void;
}) => {
  const { id, name, args } = toolCall;

  if (name.startsWith('delegate_to_')) return null;

  const RegisteredTool = toolRegistry[name];

  if (RegisteredTool) {
    if (!args || Object.keys(args).length === 0) {
      return (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: LAPIS }} />
          <span>Loading…</span>
        </div>
      );
    }
    return (
      <RegisteredTool
        args={args}
        onComplete={onComplete}
        isFinished={isFinished}
        savedResult={savedResult}
      />
    );
  }

  // ── Generic tool call — system event card ──
  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.38)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.60)',
        borderLeft: `3px solid ${LAPIS}`,
        boxShadow: '0 2px 10px rgba(38,97,156,0.07)',
      }}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/30"
      >
        <Wrench className="w-3.5 h-3.5 flex-shrink-0" style={{ color: LAPIS }} />

        <span className="font-mono text-xs font-medium text-slate-700 flex-1 truncate">
          {name}
        </span>

        {/* Status badge */}
        {isFinished ? (
          <span
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              color: LAPIS,
              backgroundColor: LAPIS_LIGHT,
              border: `1px solid ${LAPIS_BORDER}`,
            }}
          >
            <CheckCircle2 className="w-2.5 h-2.5" />
            executed
          </span>
        ) : (
          <span
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              color: '#64748b',
              backgroundColor: 'rgba(100,116,139,0.08)',
              border: '1px solid rgba(100,116,139,0.20)',
            }}
          >
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            running
          </span>
        )}

        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
          style={{
            color: '#94a3b8',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Expanded args */}
      {isOpen && (
        <div
          className="px-3 pb-3 pt-0 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.50)' }}
        >
          <pre
            className="text-[11px] text-slate-600 font-mono mt-2 overflow-x-auto whitespace-pre-wrap leading-relaxed rounded-lg p-2.5"
            style={{ background: LAPIS_LIGHT }}
          >
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
});

ToolCallRenderer.displayName = 'ToolCallRenderer';

// ---------------------------------------------------------------------------
// MarkdownContent — unchanged
// ---------------------------------------------------------------------------

export const MarkdownContent = memo(({ content }: { content: string }) => (
  <div className="markdown-content text-slate-800">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeHighlight, rehypeKatex]}
      components={{
        h1: ({ children }) => <h1 className="text-2xl font-bold mt-5 mb-3 border-b border-gray-200 pb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-semibold mt-4 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-semibold mt-3 mb-2">{children}</h3>,
        p:  ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1.5 ml-4 my-3">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1.5 ml-4 my-3">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        a:  ({ children, href }) => (
          <a href={href} className="hover:underline" style={{ color: LAPIS }} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        img: ({ src, alt }) => (
          <span className="block my-4">
            <img src={src} alt={alt || 'image'} className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm" loading="lazy" />
            {alt && <span className="text-xs text-gray-500 mt-1 block text-center">{alt}</span>}
          </span>
        ),
        code: ({ className, children }: any) => {
          if (!className) {
            return (
              <code
                className="px-1.5 py-0.5 rounded text-sm font-mono"
                style={{ background: LAPIS_LIGHT, color: LAPIS }}
              >
                {children}
              </code>
            );
          }
          return children;
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-4 border border-gray-200 rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th>,
        td: ({ children }) => <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 border-t border-gray-100">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
));

MarkdownContent.displayName = 'MarkdownContent';