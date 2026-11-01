import React, { useState } from "react";
import type { CompanionChatMessage } from "../App.tsx";
import { MarkdownRenderer } from "./MarkdownRenderer.tsx";
import { SourceCard } from "./SourceCard.tsx";
import { CompanionOrb } from "./CompanionOrb.tsx";
import { useTypewriter } from "../hooks/useTypewriter.ts";
import { Copy, Check, RotateCcw, Search, Sparkles } from "lucide-react";

interface ChatMessageItemProps {
  message: CompanionChatMessage;
  isCompletedAnimation: boolean;
  onAnimationComplete: (id: string) => void;
  onScrollToBottom?: () => void;
  onRetry?: (text: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isCompletedAnimation,
  onAnimationComplete,
  onScrollToBottom,
  onRetry,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const { displayedText, isTyping, skip } = useTypewriter(
    message.content,
    message.id,
    isUser || isCompletedAnimation,
    () => onAnimationComplete(message.id),
    onScrollToBottom
  );

  const handleCopyResponse = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex flex-col items-end my-3 pl-8 animate-in fade-in slide-in-from-bottom-1 duration-150">
        <div className="bg-[#1b1f2b] text-zinc-100 border border-[#2a3245] px-4 py-2.5 rounded-2xl rounded-tr-xs text-[12.5px] leading-relaxed max-w-[92%] shadow-sm whitespace-pre-wrap select-text font-normal">
          {message.content}
        </div>
        <div className="text-[9.5px] text-zinc-400 font-mono mt-1 pr-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex flex-col items-start my-3.5 pr-2 animate-in fade-in duration-200 w-full">
      {/* Assistant metadata header */}
      <div className="flex items-center gap-2 mb-1.5 pl-0.5">
        <CompanionOrb size="sm" isThinking={false} />
        <span className="text-[11.5px] font-medium text-zinc-200">Dexor</span>
        {message.model && (
          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#161a24] text-zinc-400 border border-[#262c3d]">
            {message.provider ? `${message.provider}:` : ""}
            {message.model}
          </span>
        )}
      </div>

      {/* Main response card */}
      <div className="relative w-full bg-[#0d0f15] border border-[#1e222d] rounded-2xl rounded-tl-xs p-3.5 shadow-xs text-[12.5px] text-zinc-200">
        <MarkdownRenderer content={displayedText} />

        {isTyping && (
          <button
            onClick={skip}
            className="mt-2 text-[10px] text-emerald-400 hover:text-emerald-300 font-mono px-2 py-0.5 rounded bg-emerald-950/30 border border-emerald-500/20"
          >
            Skip typing ▾
          </button>
        )}

        {/* TinyFish Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3.5 pt-3 border-t border-[#1e232e] flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-emerald-400 uppercase tracking-wider">
              <Search className="w-3 h-3 text-emerald-400" />
              <span>Verified Sources ({message.sources.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {message.sources.map((s) => (
                <SourceCard key={s.id || s.url} source={s} />
              ))}
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#1a1e27] text-[10px] text-zinc-400 font-mono">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyResponse}
              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors"
              title="Copy entire response"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {message.content.includes("Dexor Error") && onRetry && (
              <button
                onClick={() => onRetry(message.content)}
                className="flex items-center gap-1 text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-950/40 transition-colors"
                title="Retry request"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>

          <span>
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
};
