import React, { useState, useRef, useEffect, useCallback } from "react";
import type { CompanionChatMessage } from "../App.tsx";
import { ChatMessageItem } from "./ChatMessageItem.tsx";
import { CompanionOrb } from "./CompanionOrb.tsx";
import { CornerDownLeft, Sparkles, ArrowDown, Search } from "lucide-react";

interface ChatViewProps {
  messages: CompanionChatMessage[];
  isThinking: boolean;
  statusMessage?: string;
  onSendMessage: (text: string) => void;
  hasCapturedContext: boolean;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  isThinking,
  statusMessage,
  onSendMessage,
  hasCapturedContext,
}) => {
  const [input, setInput] = useState("");
  const [completedAnimationIds, setCompletedAnimationIds] = useState<Set<string>>(new Set());
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAutoScrollActive = useRef(true);

  // Check scroll position to determine if user scrolled away from bottom
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAutoScrollActive.current = isNearBottom;
    setShowScrollBottom(!isNearBottom);
  };

  const scrollToBottom = useCallback((smooth = true) => {
    if (isAutoScrollActive.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, isThinking, scrollToBottom]);

  // Handle textarea resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isThinking) return;
    onSendMessage(input.trim());
    setInput("");
    isAutoScrollActive.current = true;
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAnimationComplete = (id: string) => {
    setCompletedAnimationIds((prev) => new Set(prev).add(id));
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#08090c] relative">
      {/* Scrollable message thread */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[380px] text-center px-4 py-8">
            <div className="w-12 h-12 rounded-full bg-[#121620] border border-emerald-500/30 flex items-center justify-center mb-3.5 shadow-sm">
              <CompanionOrb size="md" isThinking={false} />
            </div>
            <h3 className="font-serif text-lg font-medium text-zinc-100 mb-1">
              Dexor Companion
            </h3>
            <p className="text-xs text-zinc-400 max-w-[280px] leading-relaxed mb-6">
              AI engineering teammate connected to your active browser context and live TinyFish research.
            </p>

            <div className="w-full max-w-[320px] flex flex-col gap-2 text-left">
              <span className="text-[10px] uppercase tracking-wider font-mono text-zinc-400 pl-0.5">
                Quick start prompts:
              </span>
              <button
                onClick={() =>
                  onSendMessage(
                    "Explain how this integration works and how I should implement it in my project."
                  )
                }
                className="text-[11.5px] p-2.5 rounded-lg bg-[#11141c] hover:bg-[#161a24] border border-[#232938] text-zinc-300 hover:text-white transition-all text-left leading-relaxed shadow-xs"
              >
                Explain how this integration works
              </button>
              <button
                onClick={() =>
                  onSendMessage(
                    "Tell me how to build scalable backend infrastructure for my e-commerce website ShopKart."
                  )
                }
                className="text-[11.5px] p-2.5 rounded-lg bg-[#11141c] hover:bg-[#161a24] border border-[#232938] text-zinc-300 hover:text-white transition-all text-left leading-relaxed shadow-xs"
              >
                How to build scalable backend infrastructure for ShopKart
              </button>
              <button
                onClick={() =>
                  onSendMessage(
                    "What are the official authentication headers and SDK initialization steps?"
                  )
                }
                className="text-[11.5px] p-2.5 rounded-lg bg-[#11141c] hover:bg-[#161a24] border border-[#232938] text-zinc-300 hover:text-white transition-all text-left leading-relaxed shadow-xs"
              >
                Find official authentication headers and SDK setup
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              message={msg}
              isCompletedAnimation={completedAnimationIds.has(msg.id)}
              onAnimationComplete={handleAnimationComplete}
              onScrollToBottom={() => {
                if (isAutoScrollActive.current) scrollToBottom(false);
              }}
              onRetry={(text) => onSendMessage(text)}
            />
          ))
        )}

        {/* Live Reasoning Animation */}
        {isThinking && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#0f121a] border border-emerald-900/30 text-xs text-zinc-200 my-3 animate-in fade-in duration-200">
            <CompanionOrb size="sm" isThinking={true} />
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-emerald-400 text-[11px] font-mono">
                Dexor is reasoning...
              </span>
              <span className="text-[10.5px] text-zinc-400 truncate font-mono">
                {statusMessage || "Querying multi-provider router & TinyFish..."}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating scroll to bottom button */}
      {showScrollBottom && (
        <button
          onClick={() => {
            isAutoScrollActive.current = true;
            scrollToBottom(true);
            setShowScrollBottom(false);
          }}
          className="absolute right-4 bottom-20 p-2 rounded-full bg-[#1e2330] border border-[#30384c] text-zinc-300 hover:text-white shadow-lg transition-transform hover:scale-105"
          title="Scroll to latest response"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Fixed Message Composer */}
      <div className="p-3 bg-[#0a0c10] border-t border-[#1a1e27]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
          <div className="relative flex items-center bg-[#13161f] border border-[#242b3a] rounded-xl focus-within:border-emerald-500/70 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all p-1.5 shadow-sm">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasCapturedContext
                  ? "Ask about captured page, architecture, or code..."
                  : "Ask Dexor a question (capture page context above)..."
              }
              rows={1}
              className="w-full bg-transparent px-2.5 py-1.5 text-[12.5px] text-zinc-100 placeholder-zinc-400 resize-none outline-hidden max-h-28 overflow-y-auto leading-relaxed"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="self-end p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-25 disabled:cursor-not-allowed transition-colors flex-shrink-0 mb-0.5 ml-1"
              title="Send message (Enter)"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[9.5px] text-zinc-400 px-1 font-mono">
            <span>Enter to send • Shift+Enter for new line</span>
            <span>TinyFish + Gemini / Groq</span>
          </div>
        </form>
      </div>
    </div>
  );
};
