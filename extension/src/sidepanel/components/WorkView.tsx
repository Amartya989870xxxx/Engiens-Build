import React, { useState } from "react";
import type { CompanionWorkResponse } from "@shared/contract.js";
import { SourceCard } from "./SourceCard.tsx";
import { MarkdownRenderer } from "./MarkdownRenderer.tsx";
import {
  Hammer,
  GitBranch,
  Layers,
  FileCode,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Code2,
  Copy,
  Check,
} from "lucide-react";

interface WorkViewProps {
  onGenerateWork: (task: string, repoUrl?: string) => void;
  workResponse: CompanionWorkResponse | null;
  isGenerating: boolean;
  hasCapturedContext: boolean;
}

export const WorkView: React.FC<WorkViewProps> = ({
  onGenerateWork,
  workResponse,
  isGenerating,
  hasCapturedContext,
}) => {
  const [task, setTask] = useState("");
  const [repoUrl, setRepoUrl] = useState("https://github.com/Amartya989870xxxx/ShopKart");
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim() || isGenerating) return;
    onGenerateWork(task.trim(), repoUrl.trim() || undefined);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#08090c] overflow-y-auto">
      {/* Task input card */}
      <div className="p-3 bg-[#0d0f14] border-b border-[#1f242d]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
              Engineering Task
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="e.g. Integrate payment webhook verification and record order payment status..."
              rows={3}
              className="w-full bg-[#141720] border border-[#272d3a] rounded p-2 text-xs text-zinc-100 placeholder-zinc-400 focus:border-emerald-500/60 outline-hidden resize-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <GitBranch className="w-3 h-3 text-zinc-400" />
              <span>Target GitHub Repository</span>
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-[#141720] border border-[#272d3a] rounded px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:border-emerald-500/60 outline-hidden"
            />
          </div>

          <button
            type="submit"
            disabled={!task.trim() || isGenerating}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span>
              {isGenerating ? "Analyzing Repository & Documentation..." : "Generate Recommendation"}
            </span>
          </button>
        </form>
      </div>

      {/* Structured Output Area */}
      <div className="p-3 space-y-3.5 flex-1">
        {isGenerating && (
          <div className="p-4 rounded-lg bg-[#111319] border border-emerald-900/40 text-center flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-emerald-300">
              Dexor is inspecting repository & TinyFish sources...
            </span>
          </div>
        )}

        {workResponse && !isGenerating && (
          <div className="flex flex-col gap-3.5 animate-in fade-in">
            {/* Header banner */}
            <div className="flex items-center justify-between p-2.5 bg-[#121620] border border-[#262e3d] rounded-md">
              <div className="flex flex-col">
                <span className="text-[10.5px] font-mono text-emerald-400 uppercase tracking-wider">
                  Engineering Plan Ready
                </span>
                <span className="text-xs font-medium text-zinc-200">
                  {workResponse.recommendation.taskSummary}
                </span>
              </div>
              <a
                href={workResponse.workspaceContinuationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-medium transition-colors"
                title="Open in full Engiens Build web application"
              >
                <span>Full Workspace</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Repository alignment card */}
            <div className="p-3 bg-[#111317] border border-[#222630] rounded-md flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Architecture Alignment</span>
              </div>
              <div className="text-[11.5px] text-zinc-300 leading-relaxed">
                <MarkdownRenderer content={workResponse.recommendation.architectureAlignment.stackSummary} />
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {workResponse.recommendation.architectureAlignment.detectedTechnologies.map((tech) => (
                  <span
                    key={tech}
                    className="px-1.5 py-0.5 rounded bg-[#181d26] border border-[#293240] text-[10px] font-mono text-zinc-300"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            {/* Implementation Steps */}
            <div className="p-3 bg-[#111317] border border-[#222630] rounded-md flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Implementation Steps</span>
              </div>
              <div className="space-y-2 mt-1">
                {workResponse.recommendation.implementationApproach.steps.map((step, idx) => (
                  <div key={idx} className="p-2 rounded bg-[#161a22] border border-[#242b38] flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-zinc-200">
                      {idx + 1}. {step.title}
                    </span>
                    <div className="text-[11px] text-zinc-300 leading-relaxed">
                      <MarkdownRenderer content={step.description} />
                    </div>
                    {step.relevantFiles && step.relevantFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {step.relevantFiles.map((f) => (
                          <span key={f} className="text-[9.5px] font-mono text-zinc-400 bg-[#0f1218] px-1 rounded">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Target Files */}
            <div className="p-3 bg-[#111317] border border-[#222630] rounded-md flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>Files to Modify / Create</span>
              </div>
              <div className="space-y-1.5">
                {workResponse.recommendation.targetFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-1.5 rounded bg-[#161a22] border border-[#242b38] text-[10.5px]"
                  >
                    <span className="font-mono text-zinc-200 truncate pr-2" title={file.path}>
                      {file.path}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[9px] uppercase ${
                        file.action === "create"
                          ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40"
                          : "bg-blue-950/60 text-blue-300 border border-blue-800/40"
                      }`}
                    >
                      {file.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Code Snippet if present */}
            {workResponse.recommendation.codeSnippet && (
              <div className="p-3 bg-[#111317] border border-[#222630] rounded-md flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                    <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{workResponse.recommendation.codeSnippet.description}</span>
                  </div>
                  <button
                    onClick={() => handleCopyCode(workResponse.recommendation.codeSnippet!.code)}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-zinc-800"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="text-[10.5px]">
                  <code>{workResponse.recommendation.codeSnippet.code}</code>
                </pre>
              </div>
            )}

            {/* Risks and Security */}
            <div className="p-3 bg-[#111317] border border-[#222630] rounded-md flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Risks & Security Considerations</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[10.5px] text-zinc-400">
                {workResponse.recommendation.risksAndSecurity.map((risk, idx) => (
                  <li key={idx}>{risk}</li>
                ))}
              </ul>
            </div>

            {/* Sources */}
            {workResponse.sources.length > 0 && (
              <div className="p-3 bg-[#111317] border border-[#222630] rounded-md flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                  TinyFish Research Sources ({workResponse.sources.length})
                </span>
                <div className="flex flex-col gap-1.5">
                  {workResponse.sources.map((s) => (
                    <SourceCard key={s.id || s.url} source={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
