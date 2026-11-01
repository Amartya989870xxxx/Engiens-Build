import React from "react";
import type { CapturedPageContext } from "@shared/contract.js";
import { X, ExternalLink, Copy, Check } from "lucide-react";

interface ContextPreviewModalProps {
  context: CapturedPageContext | null;
  onClose: () => void;
}

export const ContextPreviewModal: React.FC<ContextPreviewModalProps> = ({ context, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!context) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(context.pageContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="bg-[#111317] border border-[#2b303c] rounded-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#232832] bg-[#161920]">
          <div className="flex flex-col min-w-0 pr-2">
            <h3 className="text-xs font-semibold text-zinc-100 truncate">{context.title}</h3>
            <span className="text-[10px] text-zinc-400 font-mono truncate">{context.url}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details & stats */}
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0d0e12] border-b border-[#1f232c] text-[10px] text-zinc-400">
          <span>{context.contentLength || context.pageContent.length} characters extracted</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-zinc-300 hover:text-white px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <a
              href={context.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open</span>
            </a>
          </div>
        </div>

        {/* Selected text alert if present */}
        {context.selectedText && (
          <div className="p-3 bg-emerald-950/20 border-b border-emerald-900/30">
            <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              User Selection
            </div>
            <div className="text-[11px] text-zinc-200 bg-[#0a0c10] p-2 rounded border border-emerald-500/20 font-mono max-h-24 overflow-y-auto">
              {context.selectedText}
            </div>
          </div>
        )}

        {/* Extracted content view */}
        <div className="p-3 overflow-y-auto flex-1 font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
          {context.pageContent}
        </div>
      </div>
    </div>
  );
};
