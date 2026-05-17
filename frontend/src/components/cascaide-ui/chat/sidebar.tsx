import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useRef, useMemo, ReactNode, useCallback } from 'react';
import {
  Rocket, Bot,
  ChevronLeft, ChevronRight, Loader2, Database, X as CloseIcon,
  Plus as PlusIcon,
  MessageSquare,
} from 'lucide-react';

export const Sidebar = ({
  history,
  currentChatId,
  onNewChat,
  onSelectChat,
  isOpen,
  onClose,
  isExpanded,
  toggleExpansion,
}: {
  history: any[];
  currentChatId: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  isExpanded: boolean;
  toggleExpansion: () => void;
}) => {
  const sortedHistory = useMemo(() => {
    const activeChat = history.find((c: any) => c.id === currentChatId);
    const hasUserMessage = activeChat?.messages.some((m: any) => m.role === 'user');
    const filterableHistory = history.filter((chat: any) =>
      chat.id !== currentChatId || hasUserMessage
    );
    return [...filterableHistory].sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [history, currentChatId]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:sticky top-0 h-screen
          flex flex-col
          transition-all duration-300 ease-in-out
          z-50 lg:z-auto
          bg-white/30 backdrop-blur-2xl
          border-r border-white/50
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isExpanded ? 'lg:w-64' : 'lg:w-[68px]'}
          w-64
          ${isExpanded ? 'p-4' : 'p-3'}
        `}
        style={{ boxShadow: '4px 0 24px rgba(38,97,156,0.08)' }}
      >
        {/* Header */}
        <div className={`flex items-center mb-3 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            {/* Brand label — fades in/out with expansion */}
            <div
              className="transition-all duration-200 overflow-hidden whitespace-nowrap"
              style={{
                maxWidth: isExpanded ? '160px' : '0px',
                opacity: isExpanded ? 1 : 0,
              }}
            >
              <span className="text-3xl font-semibold tracking-tight" style={{ color: '#26619C' }}>
                cascaide-ts
              </span>
            </div>
          </div>

          {/* Desktop: Toggle expansion */}
          <button
            onClick={toggleExpansion}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg
              text-slate-400 hover:text-slate-600 hover:bg-white/60
              transition-all duration-200"
            title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          {/* Mobile: Close button */}
          <button
            onClick={onClose}
            className="lg:hidden flex items-center justify-center w-7 h-7 rounded-lg
              text-slate-400 hover:text-slate-600 hover:bg-white/60
              transition-all duration-200"
            title="Close sidebar"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Divider */}
        {/* <div
          className="w-full h-px mb-4 rounded-full"
          style={{ backgroundColor: 'rgba(38,97,156,0.12)' }}
        /> */}

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className={`
            flex items-center mb-5 font-medium text-sm text-white rounded-xl
            transition-all duration-200 active:scale-[0.98]
            ${isExpanded ? 'justify-start gap-2.5 px-4 py-2.5' : 'justify-center p-2.5'}
          `}
          style={{
            backgroundColor: '#26619C',
            boxShadow: '0 4px 14px rgba(38,97,156,0.30)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1F4E8C'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#26619C'; }}
          title="New Chat"
        >
          <PlusIcon size={18} />
          {/* Label fades in alongside sidebar width */}
          <span
            className="overflow-hidden whitespace-nowrap transition-all duration-200"
            style={{
              maxWidth: isExpanded ? '120px' : '0px',
              opacity: isExpanded ? 1 : 0,
            }}
          >
            New Chat
          </span>
        </button>

        {/*
          Single history container — both views always mounted.
          Expanded content fades/clips in; collapsed icons fade/clip in.
          No conditional rendering means no flash of full content.
        */}
        <div className="flex flex-col flex-1 min-h-0 relative">

          {/* ── Expanded view ── */}
          <div
            className="absolute inset-0 flex flex-col transition-all duration-200"
            style={{
              opacity: isExpanded ? 1 : 0,
              pointerEvents: isExpanded ? 'auto' : 'none',
            }}
          >
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2 px-1">
              Recent
            </h3>
            <div
              className="flex-1 overflow-y-auto space-y-0.5"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(38,97,156,0.2) transparent',
              } as React.CSSProperties}
            >
              {sortedHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <MessageSquare size={20} className="text-slate-300" />
                  <p className="text-xs text-slate-400">No history yet.</p>
                </div>
              ) : (
                sortedHistory.map((chat: any) => {
                  const isActive = chat.id === currentChatId;
                  return (
                    <button
                      key={chat.id}
                      onClick={() => onSelectChat(chat.id)}
                      className={`
                        w-full py-2.5 rounded-xl text-sm text-left truncate
                        transition-all duration-200
                        ${isActive
                          ? 'font-medium'
                          : 'text-slate-600 hover:bg-white/50 hover:text-slate-800'
                        }
                      `}
                      style={isActive ? {
                        backgroundColor: 'rgba(38,97,156,0.10)',
                        color: '#26619C',
                        borderLeft: '3px solid #26619C',
                        paddingLeft: '10px',
                        paddingRight: '12px',
                      } : { paddingLeft: '12px', paddingRight: '12px' }}
                      title={chat.title}
                    >
                      {chat.title}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Collapsed icon view ── */}
          <div
            className="flex flex-col items-center gap-1 overflow-hidden transition-all duration-200"
            style={{
              opacity: isExpanded ? 0 : 1,
              pointerEvents: isExpanded ? 'none' : 'auto',
            }}
          >
            {sortedHistory.slice(0, 6).map((chat: any) => {
              const isActive = chat.id === currentChatId;
              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200"
                  style={isActive
                    ? { backgroundColor: 'rgba(38,97,156,0.12)', color: '#26619C' }
                    : { color: '#94a3b8' }
                  }
                  title={chat.title}
                >
                  <MessageSquare size={16} />
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </>
  );
};