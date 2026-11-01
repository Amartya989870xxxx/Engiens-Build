import React from "react";
import {
  X,
  GitBranch,
  Layers,
  ExternalLink,
  BookOpen,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { RepositorySummary, ResearchSummary, PlanVerification } from "@shared/contract";

interface ContextPanelProps {
  isOpen: boolean;
  onClose: () => void;
  repository?: RepositorySummary | null;
  research?: ResearchSummary | null;
  verification?: PlanVerification | null;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  isOpen,
  onClose,
  repository,
  research,
  verification,
}) => {
  if (!isOpen) return null;

  return (
    <aside className="w-80 h-screen border-l border-[#181a1f] bg-[#090a0d] flex flex-col justify-between shrink-0 overflow-hidden text-xs text-zinc-300">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[#181a1f] flex items-center justify-between bg-[#0b0d11]">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-medium text-zinc-200 tracking-tight">Active Context</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          title="Close panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable Context Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 1. Repository Meta */}
        {repository ? (
          <div className="space-y-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <GitBranch className="w-3 h-3 text-zinc-400" />
              <span>Target Repository</span>
            </div>
            <div className="p-3 rounded-lg border border-[#1d2029] bg-[#0e1015] space-y-2">
              <div className="flex items-center justify-between">
                <a
                  href={repository.repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-medium text-zinc-100 hover:underline flex items-center gap-1 truncate max-w-[200px]"
                >
                  {repository.repo.fullName}
                  <ExternalLink className="w-3 h-3 text-zinc-500" />
                </a>
                <span className="text-[10px] font-mono text-zinc-500">{repository.repo.defaultBranch}</span>
              </div>
              <div className="text-[11px] text-zinc-400 line-clamp-2">{repository.repo.description}</div>
              <div className="flex items-center gap-2 pt-1 border-t border-[#1d2029] text-[10px] text-zinc-500 font-mono">
                <span>{repository.repo.primaryLanguage || "Multi-lang"}</span>
                <span>•</span>
                <span>★ {repository.repo.stars.toLocaleString()}</span>
                <span>•</span>
                <span>{repository.tree.totalFiles} files</span>
              </div>
            </div>

            {/* Detected Stack */}
            {repository.stack.technologies.length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
                  Detected Stack
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {repository.stack.technologies.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded border border-[#222736] bg-[#12151d] text-[10px] font-mono text-zinc-300"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Inspected Key Files */}
            {repository.files.length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center justify-between">
                  <span>Inspected Code ({repository.files.length})</span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {repository.files.slice(0, 10).map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-2 py-1 rounded bg-[#0d0f14] border border-[#1b1e27] text-[10px] font-mono"
                    >
                      <span className="text-zinc-300 truncate max-w-[170px]" title={f.path}>
                        {f.path}
                      </span>
                      <span className="text-zinc-600">{(f.chars / 1000).toFixed(1)}k</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-dashed border-[#20232c] text-center text-zinc-500 text-[11px]">
            No repository connected for this session.
          </div>
        )}

        {/* 2. TinyFish Research Sources */}
        {research && research.sources.length > 0 && (
          <div className="space-y-2.5 pt-2 border-t border-[#181a1f]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3 text-zinc-400" />
              <span>TinyFish Documentation</span>
            </div>
            <div className="space-y-2">
              {research.sources.map((src, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-[#1c1f28] bg-[#0d0f14] space-y-1 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-400 font-semibold">[{src.id}]</span>
                    {src.official && (
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1 rounded">
                        Official
                      </span>
                    )}
                  </div>
                  <div className="font-medium text-zinc-200 text-[11px] truncate">{src.title}</div>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 truncate block flex items-center gap-1"
                  >
                    {new URL(src.url).hostname}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Verification & Guardrails */}
        {verification && (
          <div className="space-y-2 pt-2 border-t border-[#181a1f]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Grounding Verification
            </div>
            {verification.warnings.length === 0 ? (
              <div className="flex items-center gap-2 p-2 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>100% citations & file targets verified.</span>
              </div>
            ) : (
              <div className="space-y-1">
                {verification.warnings.map((w, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-1.5 p-2 rounded bg-amber-950/20 border border-amber-900/40 text-amber-300 text-[10px]"
                  >
                    <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#181a1f] text-[10px] font-mono text-zinc-500 flex items-center justify-between">
        <span>Model: Gemini 3.8 Flash</span>
        <span>Ready</span>
      </div>
    </aside>
  );
};
