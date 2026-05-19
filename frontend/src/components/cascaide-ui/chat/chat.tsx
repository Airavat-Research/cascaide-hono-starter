import React, { useState, useMemo, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { useWorkflow, useCascade } from '@cascaide-ts/react';
import { v4 as uuidv4 } from 'uuid';
import { Sidebar } from './sidebar';
import { InputBar } from './input.tsx';
import { MessageList } from './message-list';
import { Spawns } from './types';
import { CanonicalMessage } from './types';
import { RightSidebar } from './rightSidebar';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatProps {
  nodeId: string;
}

type AgentType =
  | 'hotelSupervisorNode'
  | 'searchAgentNode'
  | 'recursiveSearchAgentNode';

const LAPIS = '#26619C';

// ── Main Component ───────────────────────────────────────────────────────────

export default function Chat({ nodeId }: ChatProps) {
  const [input, setInput] = useState('');
  const userId = 'guest-id';
  const userName = 'there';

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  const { addActiveNode } = useWorkflow(nodeId);

  const [chatId, setChatId] = useState<string>(uuidv4());

  const { cascadeState, isComplete } = useCascade(chatId);

  const [pendingUserMessage, setPendingUserMessage] = useState<CanonicalMessage | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<AgentType>('hotelSupervisorNode');

  const isProcessing = useMemo(
    () => !isComplete && !!cascadeState,
    [isComplete, cascadeState]
  );

  // ── Derive conversationMessages from cascade state ───────────────────────

  const conversationMessages = useMemo<CanonicalMessage[]>(() => {
    const base = (cascadeState?.history as CanonicalMessage[]) ?? [];

    if (!pendingUserMessage) return base;

    const alreadySynced = base.some(
      (m) => m.role === 'user' && m.content === pendingUserMessage.content
    );

    if (alreadySynced) {
      setTimeout(() => setPendingUserMessage(null), 0);
      return base;
    }

    return [...base, pendingUserMessage];
  }, [cascadeState?.history, pendingUserMessage]);

  const currentChatHasUserMessages = useMemo(
    () => conversationMessages.some((m) => m.role === 'user'),
    [conversationMessages]
  );

  // ── Sidebar ──────────────────────────────────────────────────────────────

  const toggleSidebarExpansion = useCallback(() => {
    setIsSidebarExpanded((prev) => !prev);
  }, []);

  const startNewChat = useCallback(() => {
    const newId = uuidv4();
    setChatId(newId);
    setPendingUserMessage(null);
    setInput('');
  }, []);

  const selectChat = useCallback(
    (id: string) => {
      if (id === chatId) return;
      setChatId(id);
      setPendingUserMessage(null);
      setInput('');
      // TODO: load selected chat history from persistent store
    },
    [chatId]
  );

  // Agent switch → start a fresh chat and pre-fill the starter prompt
  const handleAgentChange = useCallback(
    (agent: AgentType, starterPrompt: string) => {
      setSelectedAgent(agent);
      const newId = uuidv4();
      setChatId(newId);
      setPendingUserMessage(null);
      setInput(starterPrompt);
    },
    []
  );

  // ── Send user message ────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || isProcessing || !userId) return;

      const newUserMessage: CanonicalMessage = {
        role: 'user',
        content: message.trim(),
      };

      setPendingUserMessage(newUserMessage);
      setInput('');

      // const updatedHistory = [...conversationMessages, newUserMessage];

      const spawns: Spawns = {
        [selectedAgent]: {
          cascadeId: chatId,
          history: [newUserMessage],
          //In Lite mode, set history: updatedHistory,
          userId,
        },
      };

      await addActiveNode(spawns);
    },
    [isProcessing, userId, addActiveNode, chatId, selectedAgent, conversationMessages]
  );

  // ── Tool response ────────────────────────────────────────────────────────

  const handleToolResponse = useCallback(
    async (toolMessage: CanonicalMessage) => {
      setInput('');
      // const updatedHistory = [...conversationMessages, toolMessage];

      const spawns: Spawns = {
        hotelSupervisorNode: {
          cascadeId: chatId,
          history: [toolMessage],
          // in lite mode, set history: updatedHistory,
          userId,
        },
      };

      await addActiveNode(spawns);
    },
    [addActiveNode, chatId, conversationMessages]
  );

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(input);
      }
    },
    [input, handleSendMessage]
  );

  const isEmptyChat = !currentChatHasUserMessages;

  return (
    <div className="w-screen h-screen flex overflow-hidden">

      {/* Sidebar */}
      <Sidebar
        history={[]}
        currentChatId={chatId}
        onNewChat={startNewChat}
        onSelectChat={selectChat}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isExpanded={isSidebarExpanded}
        toggleExpansion={toggleSidebarExpansion}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Mobile menu button */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden absolute top-5 left-6 z-50 p-2.5 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.65)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.70)',
              boxShadow: '0 2px 12px rgba(38,97,156,0.10)',
            }}
          >
            <Menu className="w-5 h-5" style={{ color: LAPIS }} />
          </button>
        )}

        <div className="h-full w-full flex flex-col">
          {isEmptyChat ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
              <h1 className="text-5xl font-bold mb-8 text-slate-800">
                Hello <span style={{ color: LAPIS }}>{userName}</span>!
              </h1>

              {/* Agent picker + input live inside InputBar via the card grid */}
              <InputBar
                input={input}
                isProcessing={isProcessing}
                userId={userId}
                selectedAgent={selectedAgent}
                onAgentChange={handleAgentChange}
                onChange={setInput}
                onSend={() => handleSendMessage(input)}
                onKeyPress={handleKeyPress}
              />
            </div>
          ) : (
            <>
              <MessageList
                displayHistory={conversationMessages}
                userId={userId}
                addActiveNode={addActiveNode}
                handleToolResponse={handleToolResponse}
              />

              <div className="px-6 py-4">
                <div className="max-w-4xl mx-auto">
                  <InputBar
                    input={input}
                    isProcessing={isProcessing}
                    userId={userId}
                    compact
                    selectedAgent={selectedAgent}
                    onAgentChange={handleAgentChange}
                    onChange={setInput}
                    onSend={() => handleSendMessage(input)}
                    onKeyPress={handleKeyPress}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {selectedAgent === 'recursiveSearchAgentNode' && <div className="hidden lg:block h-full">
        <RightSidebar />
      </div>
}
      

      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}