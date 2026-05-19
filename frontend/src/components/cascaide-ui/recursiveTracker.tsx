import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkflow, useCascade } from '@cascaide-ts/react';
import { createPortal } from 'react-dom';
import { MessageList } from './chat/message-list';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DelegationTask {
  toolCall: {
    name: string;
    args: { subtask?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  subCascadeId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDepthFromCascadeId(cascadeId: string): number {
  const match = cascadeId.match(/^call(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

function getShortId(cascadeId: string): string {
  return cascadeId.split('-').pop()?.slice(-4).toUpperCase() || '????';
}

// ─── Mini Chat Window ─────────────────────────────────────────────────────────

const WINDOW_W = 440;
const WINDOW_H = 480;

function MiniChatWindow({
  task,
  pos,
  onPosChange,
  onClose,
}: {
  task: DelegationTask;
  pos: { x: number; y: number };
  onPosChange: (pos: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const { cascadeState } = useCascade(task.subCascadeId);

  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    },
    [pos]
  );

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent) =>
      onPosChange({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isDragging, onPosChange]);

  const depth = getDepthFromCascadeId(task.subCascadeId);
  const shortId = getShortId(task.subCascadeId);
  const history = cascadeState?.history ?? [];

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 10001,
        width: WINDOW_W,
        height: WINDOW_H,
        userSelect: isDragging ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
      className="rounded-2xl overflow-hidden shadow-2xl border border-black/10 bg-white"
    >
      {/* Title bar */}
      <div
        onMouseDown={onMouseDown}
        className={`flex items-center justify-between px-3 py-2 flex-shrink-0 select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ background: '#f8fafc', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors"
          />
          <div className="w-3 h-3 rounded-full bg-yellow-300" />
          <div className="w-3 h-3 rounded-full bg-green-300" />
        </div>

        {/* Centre label */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-black tracking-[0.2em] uppercase text-slate-400">
            L{depth} · {shortId}
          </span>
        </div>

        <div className="w-16" />
      </div>

      {/* Messages — fixed height, scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white">
        {history.length > 0 ? (
          <MessageList displayHistory={history} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] tracking-widest uppercase text-black/20">
              awaiting messages
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Depth Card ───────────────────────────────────────────────────────────────

function DepthCard({
  tasks,
  depth,
}: {
  tasks: DelegationTask[];
  depth: number;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Pos state lives here — survives remounts of MiniChatWindow portal children
  const [posMap, setPosMap] = useState<Record<string, { x: number; y: number }>>({});

  const getPos = (id: string) =>
    posMap[id] ?? {
      x: window.innerWidth / 2 - WINDOW_W / 2,
      y: window.innerHeight / 2 - WINDOW_H / 2,
    };

  const handlePosChange = useCallback((id: string, pos: { x: number; y: number }) => {
    setPosMap(prev => ({ ...prev, [id]: pos }));
  }, []);

  const toggle = (id: string) =>
    setOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const close = (id: string) =>
    setOpenIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const openTasks = tasks.filter(t => openIds.has(t.subCascadeId));

  return (
    <>
      {/* One floating window per open subcascade */}
      {openTasks.map(task =>
        createPortal(
          <MiniChatWindow
            key={task.subCascadeId}
            task={task}
            pos={getPos(task.subCascadeId)}
            onPosChange={pos => handlePosChange(task.subCascadeId, pos)}
            onClose={() => close(task.subCascadeId)}
          />,
          document.body
        )
      )}

      {/* Card */}
      <div
        className="rounded-2xl overflow-hidden mb-3 bg-white"
        style={{ border: '1px solid rgba(0,0,0,0.08)' }}
      >
        {/* Card header */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f8fafc' }}
        >
          <span className="text-[9px] font-black tracking-[0.2em] uppercase text-slate-400">
            Depth {depth}
          </span>
          <span className="text-[9px] tabular-nums text-slate-300">
            {tasks.length} {tasks.length === 1 ? 'branch' : 'branches'}
          </span>
        </div>

        {/* Task pills */}
        <div className="flex flex-col gap-1.5 p-2">
          {tasks.map(task => {
            const subtask = task.toolCall.args?.subtask ?? task.toolCall.name;
            const shortId = getShortId(task.subCascadeId);
            const isActive = openIds.has(task.subCascadeId);

            return (
              <button
                key={task.subCascadeId}
                onClick={() => toggle(task.subCascadeId)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all w-full"
                style={{
                  background: isActive ? '#eff6ff' : '#f8fafc',
                  border: isActive
                    ? '1px solid #bfdbfe'
                    : '1px solid rgba(0,0,0,0.05)',
                }}
              >
                {/* Status dot */}
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: isActive ? '#3b82f6' : '#93c5fd',
                    boxShadow: isActive ? '0 0 6px rgba(59,130,246,0.5)' : 'none',
                  }}
                />

                {/* Text */}
                <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                  <span className="text-[8px] font-black tracking-[0.15em] uppercase mb-0.5 text-slate-400">
                    {shortId}
                  </span>
                  <span
                    className="text-xs truncate"
                    style={{ color: isActive ? '#1e40af' : '#475569' }}
                  >
                    {subtask as string}
                  </span>
                </div>

                {/* Arrow */}
                <span
                  className="text-[10px] flex-shrink-0 transition-transform text-slate-300"
                  style={{ transform: isActive ? 'rotate(90deg)' : 'none' }}
                >
                  ›
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

export default function Tracker({ nodeId }: { nodeId: string }) {
  const { nodeData } = useWorkflow(nodeId);

  const tasks: DelegationTask[] = nodeData?.initialContext?.history ?? [];
  if (tasks.length === 0) return null;

  const byDepth = tasks.reduce<Record<number, DelegationTask[]>>((acc, task) => {
    const d = getDepthFromCascadeId(task.subCascadeId);
    (acc[d] ??= []).push(task);
    return acc;
  }, {});

  const target = document.getElementById('right-sidebar-slot-1');
  if (!target) return null;

  return createPortal(
    <div className="p-3">
      {Object.entries(byDepth)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([depth, depthTasks]) => (
          <DepthCard
            key={depth}
            depth={Number(depth)}
            tasks={depthTasks}
          />
        ))}
    </div>,
    target
  );
}