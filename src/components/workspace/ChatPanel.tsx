import { useState, useRef, useEffect } from 'react';
import {
  Send, Paperclip, Mic, Bot, User, ChevronDown, Sparkles,
  Wrench, FileText, Crosshair, AlertTriangle, CheckSquare,
  Target, Wifi, WifiOff, Loader2, X, Lightbulb, FileBox,
} from 'lucide-react';
import { mockChatMessages } from '../../data/mockData';
import { useChat } from '../../hooks/useChat';
import { IS_DEMO } from '../../lib/api';
import type { ChatMessage } from '../../types';
import type { UploadPartResult } from '../../lib/api';
import PartUpload from './PartUpload';
import { useWorkspace } from '../../store/workspaceStore';

const SUGGESTION_CHIPS = [
  'Verify 3-2-1 locating scheme',
  'Add drill bushing seats',
  'Find toggle clamp (150N)',
  'Add GD&T position callout',
  'Run DFM check',
  'Generate inspection plan',
  'Check clamp force adequacy',
  'Export drawing package',
  'Mirror about YZ plane',
  'Export as STEP',
];

const DEMO_PROACTIVE = [
  { id: 'p1', text: 'Small bore detected (⌀8mm). Bushing wall <1.5mm — consider upgrading to CL-8-CBH for longer life.' },
  { id: 'p2', text: '3-2-1 locating: only 2 support pads defined. Add a 3rd rest button to eliminate the Y-rotation DOF.' },
];

interface ChatPanelProps {
  projectId?: string;
}

interface ProactiveSuggestion {
  id: string;
  text: string;
}

export default function ChatPanel({ projectId }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const { messages, isThinking, isConnected, activeGenJob, sendMessage } = useChat({
    projectId,
    initialMessages: IS_DEMO ? mockChatMessages : [],
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const [proactive, setProactive] = useState<ProactiveSuggestion[]>(IS_DEMO ? DEMO_PROACTIVE : []);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { state, dispatch } = useWorkspace();
  const uploadedPart = state.uploadedPart;

  const handlePartUpload = (result: UploadPartResult) => {
    // Persist to workspace state so Viewport3D can access the file URL
    dispatch({
      type: 'SET_UPLOADED_PART',
      part: {
        partId:        result.part_id,
        fileName:      result.file_name,
        fileType:      result.file_type,
        fileUrl:       result.file_url,
        aiDescription: result.ai_description,
      },
    });
    // Inject a system message so the chat history shows the upload event
    sendMessage(
      `I've uploaded my part file: ${result.file_name}. ` +
      (result.ai_description ? `${result.ai_description} ` : '') +
      'Please design a fixture that holds and supports this part securely.'
    );
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Pull proactive suggestions from system messages with type='proactive_suggestions'
  useEffect(() => {
    if (IS_DEMO) return;
    const sysMessages = messages.filter(
      (m) => m.role === 'system' && (m as unknown as { metadata?: { type?: string } }).metadata?.type === 'proactive_suggestions'
    );
    if (sysMessages.length > 0) {
      const last = sysMessages[sysMessages.length - 1];
      const meta = (last as unknown as { metadata?: { suggestions?: string[] } }).metadata;
      if (meta?.suggestions) {
        setProactive(meta.suggestions.map((text, i) => ({ id: `srv-${i}`, text })));
      }
    }
  }, [messages]);

  const visibleProactive = proactive.filter((p) => !dismissed.has(p.id));

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="h-full flex flex-col bg-cadsurface-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cadsurface-700 bg-cadsurface-900 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cadblue-600 flex items-center justify-center">
            <Sparkles size={12} className="text-white" />
          </div>
          <span className="text-xs font-semibold text-slate-200">ForgeAI Assistant</span>
          {IS_DEMO ? (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <WifiOff size={10} />Demo
            </span>
          ) : isConnected ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Wifi size={10} />Live
            </span>
          ) : (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />Connecting…
            </span>
          )}
        </div>
        <button className="btn-ghost p-1 rounded">
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Context banner — shows uploaded part if present */}
      <div className="px-3 py-1.5 bg-cadblue-950/40 border-b border-cadblue-900/50 shrink-0">
        {uploadedPart ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <FileBox size={11} />
            <span className="font-medium">Part:</span>
            <span className="text-slate-400 truncate">{uploadedPart.fileName}</span>
            <span className="text-emerald-600 uppercase font-mono">{uploadedPart.fileType}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-cadblue-400">
            <Target size={11} />
            <span className="font-medium">Context:</span>
            <span className="text-slate-400">Drill Jig · 3-2-1 Locating · ASME Y14.5 · AS9100</span>
          </div>
        )}
      </div>

      {/* Quick action bar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-cadsurface-700 bg-cadsurface-900/50 shrink-0 overflow-x-auto no-scrollbar">
        {[
          { icon: <Wrench size={11} />,        label: 'Hardware',    prompt: 'Find toggle clamp 150N' },
          { icon: <FileText size={11} />,      label: 'Drawing',     prompt: 'Generate drawing package' },
          { icon: <Crosshair size={11} />,     label: '3-2-1 Check', prompt: 'Run a 3-2-1 locating check' },
          { icon: <AlertTriangle size={11} />, label: 'DFM',         prompt: 'Run DFM check' },
          { icon: <CheckSquare size={11} />,   label: 'Inspection',  prompt: 'Generate inspection plan' },
        ].map(({ icon, label, prompt }) => (
          <button
            key={label}
            onClick={() => setInput(prompt)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-cadsurface-800 hover:bg-cadsurface-700 px-2 py-1 rounded-md transition-colors whitespace-nowrap border border-cadsurface-700"
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Proactive suggestions */}
      {visibleProactive.length > 0 && (
        <div className="px-3 py-2 border-b border-cadsurface-700 bg-cadsurface-900/30 shrink-0 space-y-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb size={11} className="text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">AI Suggestions</span>
          </div>
          {visibleProactive.map((p) => (
            <div key={p.id} className="flex items-start gap-2 bg-amber-900/10 border border-amber-700/30 rounded-lg px-2.5 py-2">
              <Lightbulb size={11} className="text-amber-400 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-200 leading-relaxed flex-1">{p.text}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setInput(`Tell me more about: ${p.text.slice(0, 60)}`); setDismissed((d) => new Set([...d, p.id])); }}
                  className="text-xs text-amber-400 hover:text-amber-200 border border-amber-700/40 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
                >
                  Tell me more
                </button>
                <button
                  onClick={() => setDismissed((d) => new Set([...d, p.id]))}
                  className="p-0.5 text-amber-600 hover:text-amber-400 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generation progress banner */}
      {activeGenJob && (
        <div className="px-3 py-2 bg-cadblue-950 border-b border-cadblue-800 flex items-center gap-2 shrink-0">
          <Loader2 size={12} className="text-cadblue-400 animate-spin shrink-0" />
          <span className="text-xs text-cadblue-300">{activeGenJob.message}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isThinking && !messages.some((m) => m.id.startsWith('stream_')) && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-cadblue-600 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={12} className="text-white" />
            </div>
            <div className="chat-bubble-ai flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Thinking</span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-cadblue-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Part file upload — drop zone above input */}
      {!uploadedPart && (
        <PartUpload projectId={projectId} onUploadComplete={handlePartUpload} />
      )}

      {/* Suggestion chips */}
      <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => setInput(chip)}
            className="whitespace-nowrap text-xs text-slate-400 hover:text-slate-200 bg-cadsurface-800 hover:bg-cadsurface-700 border border-cadsurface-700 hover:border-cadblue-600/50 px-2.5 py-1 rounded-full transition-all"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-end gap-2 bg-cadsurface-800 border border-cadsurface-700 focus-within:border-cadblue-500/60 rounded-xl p-2 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe what you want to build or check…"
            rows={2}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none outline-none leading-relaxed"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button className="btn-ghost p-1.5 rounded-lg" title="Attach file">
              <Paperclip size={14} />
            </button>
            <button className="btn-ghost p-1.5 rounded-lg" title="Voice input">
              <Mic size={14} />
            </button>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              className="w-8 h-8 rounded-lg bg-cadblue-600 hover:bg-cadblue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all"
            >
              {isThinking
                ? <Loader2 size={13} className="text-white animate-spin" />
                : <Send size={13} className="text-white" />}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-1.5 text-center">
          ForgeAI · Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-cadsurface-800" />
        <span className="text-xs text-slate-600 px-2">{message.content}</span>
        <div className="flex-1 h-px bg-cadsurface-800" />
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
        isUser ? 'bg-slate-700 text-slate-300' : 'bg-cadblue-600 text-white'
      }`}>
        {isUser ? <User size={12} /> : <Bot size={12} />}
      </div>

      <div className={`flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}>
          <FormattedContent content={message.content} />
        </div>

        {message.featureRefs && message.featureRefs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.featureRefs.map((ref) => (
              <span key={ref} className="text-xs bg-cadblue-900/40 border border-cadblue-700/40 text-cadblue-300 px-1.5 py-0.5 rounded-md">
                → {ref}
              </span>
            ))}
          </div>
        )}

        <span className="text-xs text-slate-600">{message.timestamp}</span>
      </div>
    </div>
  );
}

function FormattedContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <span className="leading-relaxed">
      {lines.map((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
        return (
          <span key={li}>
            {parts.map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**'))
                return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
              if (part.startsWith('*') && part.endsWith('*'))
                return <em key={i} className="italic text-slate-400">{part.slice(1, -1)}</em>;
              return <span key={i}>{part}</span>;
            })}
            {li < lines.length - 1 && <br />}
          </span>
        );
      })}
    </span>
  );
}
