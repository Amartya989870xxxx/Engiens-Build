import React, { useState, useEffect } from "react";
import {
  GitBranch,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Layers,
  FileCode2,
  BookOpen,
  ShieldAlert,
  ExternalLink,
  MessageSquare,
  Wrench,
  AlertCircle,
} from "lucide-react";
import type { BuildPlanResult, RepositorySummary, HealthResponse } from "@shared/contract";
import { Sidebar } from "./components/Sidebar";
import { ContextPanel } from "./components/ContextPanel";
import { DexorOrb, type DexorState } from "./components/DexorOrb";
import { CodeViewer } from "./components/CodeViewer";

interface MessageItem {
  id: string;
  sender: "user" | "dexor";
  timestamp: string;
  text: string;
  planResult?: BuildPlanResult;
  isStreaming?: boolean;
}

export default function App() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/expressjs/express");
  const [taskInput, setTaskInput] = useState("");
  const [mode, setMode] = useState<"work" | "chat">("work");
  const [dexorState, setDexorState] = useState<DexorState>("idle");
  const [isContextOpen, setIsContextOpen] = useState(true);

  const [repoSummary, setRepoSummary] = useState<RepositorySummary | null>(null);
  const [planResult, setPlanResult] = useState<BuildPlanResult | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Tab state for plan view
  const [planTab, setPlanTab] = useState<"strategy" | "changes" | "research" | "testing">("strategy");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => {});
  }, []);

  const handleNewSession = () => {
    setMessages([]);
    setPlanResult(null);
    setDexorState("idle");
    setError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!taskInput.trim()) return;

    const userPrompt = taskInput.trim();
    setTaskInput("");
    setError(null);

    // Add user message to conversation
    const userMsg: MessageItem = {
      id: crypto.randomUUID(),
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: userPrompt,
    };
    setMessages((prev) => [...prev, userMsg]);

    if (mode === "chat") {
      // Conversational response
      setDexorState("thinking");
      setTimeout(() => {
        const dexorMsg: MessageItem = {
          id: crypto.randomUUID(),
          sender: "dexor",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          text: `I've analyzed your prompt for ${repoUrl || "the codebase"}. In Work Mode, I can inspect the full file tree, fetch official live API documentation via TinyFish, and generate file-level code proposals. Switch to Work Mode to run the grounded engineering pipeline.`,
        };
        setMessages((prev) => [...prev, dexorMsg]);
        setDexorState("idle");
      }, 700);
      return;
    }

    // Work Mode Execution: GitHub -> TinyFish -> Gemini
    setDexorState("researching");
    const assistantMsgId = crypto.randomUUID();

    // Placeholder pending message
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        sender: "dexor",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: "Connecting to repository, researching live documentation via TinyFish, and reasoning over implementation strategy...",
        isStreaming: true,
      },
    ]);

    try {
      setDexorState("working");
      const res = await fetch("/api/build/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, request: userPrompt }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Engineering pipeline returned an error.");
      }

      setPlanResult(data);
      if (data.repository) setRepoSummary(data.repository);
      setDexorState("completed");

      // Replace placeholder with final result
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isStreaming: false,
                text: `I've completed the engineering analysis for ${data.repository?.repo?.fullName || "the repository"}. Below is the verified implementation plan and proposed file modifications.`,
                planResult: data,
              }
            : m
        )
      );
    } catch (err: any) {
      setDexorState("error");
      setError(err.message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isStreaming: false,
                text: `Execution failed: ${err.message}`,
              }
            : m
        )
      );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#08090a] text-[#d1d5db] font-sans antialiased selection:bg-[#27272a] selection:text-white">
      {/* 1. Persistent Left Sidebar */}
      <Sidebar
        currentRepo={repoUrl}
        onSelectRepo={(url) => setRepoUrl(url)}
        onNewSession={handleNewSession}
        dexorState={dexorState}
      />

      {/* 2. Main Central Workspace */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#08090a]">
        {/* Workspace Sub-header */}
        <header className="h-12 border-b border-[#181a1f] px-6 flex items-center justify-between shrink-0 bg-[#090a0d]/90 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 font-serif italic text-sm">Session</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
            <span className="font-mono text-zinc-300">
              {repoUrl ? repoUrl.replace("https://github.com/", "") : "New Workspace"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {planResult ? (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-zinc-800 bg-[#0d0e12] text-zinc-300">
                <span className="text-zinc-500 capitalize">{planResult.provider}</span> · {planResult.model}
                {planResult.fallbackOccurred && (
                  <span className="ml-1.5 text-[9px] text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1 rounded">
                    fallback
                  </span>
                )}
              </span>
            ) : (
              <span className="text-[11px] font-mono text-zinc-500">
                Primary: Gemini · {health?.services.gemini.model || "gemini-3.8-flash"}
              </span>
            )}
            <button
              onClick={() => setIsContextOpen(!isContextOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors border ${
                isContextOpen
                  ? "bg-[#141720] border-[#222736] text-zinc-200"
                  : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
              title="Toggle Context Panel"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
              <span>Context</span>
            </button>
          </div>
        </header>

        {/* Central Scrollable Conversation & Task View */}
        <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col justify-between">
          <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col justify-center">
            {messages.length === 0 ? (
              /* Initial State: Clean Editorial Workspace */
              <div className="space-y-6 my-auto animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-xs font-mono tracking-widest uppercase text-zinc-500 block">
                    Engiens Build Platform
                  </span>
                  <h1 className="font-serif italic text-3xl sm:text-4xl text-zinc-100 font-normal tracking-tight">
                    What are we building today?
                  </h1>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                    Describe any technical feature, API integration, or bug. Dexor investigates your actual repository tree,
                    fetches live official documentation via TinyFish, and drafts verified engineering changes.
                  </p>
                </div>

                {/* Integrated Task Composer */}
                <div className="rounded-xl border border-[#1e222b] bg-[#0d0f14] p-4 shadow-2xl focus-within:border-zinc-700 transition-colors">
                  <div className="flex flex-col gap-3">
                    {/* Repository Selector Input Bar */}
                    <div className="flex items-center gap-2 pb-2.5 border-b border-[#181a20]">
                      <GitBranch className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <input
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="https://github.com/owner/repository"
                        className="w-full bg-transparent text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
                      />
                    </div>

                    {/* Task Description Textarea */}
                    <textarea
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      rows={3}
                      placeholder="E.g., Add Razorpay payment gateway integration with order creation and signature verification..."
                      className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none resize-none leading-relaxed"
                    />

                    {/* Mode and Submit Controls */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#181a20]">
                      {/* Mode Segmented Control */}
                      <div className="flex items-center gap-1 p-0.5 rounded-lg border border-[#20242e] bg-[#090a0d]">
                        <button
                          type="button"
                          onClick={() => setMode("work")}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                            mode === "work"
                              ? "bg-zinc-800 text-zinc-100 shadow-sm"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <Wrench className="w-3 h-3 text-zinc-300" />
                          <span>Work Mode</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode("chat")}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                            mode === "chat"
                              ? "bg-zinc-800 text-zinc-100 shadow-sm"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <MessageSquare className="w-3 h-3 text-zinc-300" />
                          <span>Chat Mode</span>
                        </button>
                      </div>

                      {/* Quick Examples */}
                      <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                        <button
                          type="button"
                          onClick={() =>
                            setTaskInput(
                              "Add Razorpay payment gateway integration with order creation and signature verification"
                            )
                          }
                          className="hover:text-zinc-300 hover:underline"
                        >
                          Razorpay integration
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() =>
                            setTaskInput(
                              "Implement Stripe Webhooks handler with signature verification and idempotency keys"
                            )
                          }
                          className="hover:text-zinc-300 hover:underline"
                        >
                          Stripe webhooks
                        </button>
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={() => handleSubmit()}
                        disabled={!taskInput.trim()}
                        className="px-3.5 py-1.5 rounded-md bg-zinc-200 hover:bg-white text-zinc-950 font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
                      >
                        <span>Start</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-md bg-rose-950/20 border border-rose-900/40 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Active Conversation Flow */
              <div className="space-y-6 pb-24">
                {messages.map((msg) => (
                  <div key={msg.id} className="space-y-3">
                    {/* Header info */}
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                      <span className={msg.sender === "dexor" ? "text-zinc-300 font-serif italic" : "text-zinc-400"}>
                        {msg.sender === "dexor" ? "Dexor" : "You"}
                      </span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>

                    {/* Message Body */}
                    <div
                      className={`text-xs leading-relaxed ${
                        msg.sender === "dexor"
                          ? "p-4 rounded-xl border border-[#1b1f28] bg-[#0c0e13] text-zinc-200"
                          : "p-4 rounded-xl border border-[#222736] bg-[#11141c] text-zinc-100"
                      }`}
                    >
                      {msg.isStreaming && (
                        <div className="flex items-center gap-2 text-zinc-400 pb-2 mb-2 border-b border-[#1b1f28]">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-300" />
                          <span className="font-mono text-[11px]">Executing grounded pipeline...</span>
                        </div>
                      )}
                      <p>{msg.text}</p>

                      {/* If Plan Result attached, render detailed tabbed plan */}
                      {msg.planResult && (
                        <div className="mt-5 rounded-lg border border-[#1e2330] bg-[#08090c] overflow-hidden">
                          {/* Plan Tabs */}
                          <div className="flex items-center border-b border-[#181a20] px-3 pt-1 bg-[#0a0c10]">
                            {[
                              { id: "strategy", label: "Strategy", icon: Layers },
                              {
                                id: "changes",
                                label: "Proposed Changes",
                                icon: FileCode2,
                                count: msg.planResult.plan.proposedChanges.length,
                              },
                              {
                                id: "research",
                                label: "TinyFish Docs",
                                icon: BookOpen,
                                count: msg.planResult.research.sources.length,
                              },
                              { id: "testing", label: "Validation & Risks", icon: ShieldAlert },
                            ].map((tab) => {
                              const Icon = tab.icon;
                              const active = planTab === tab.id;
                              return (
                                <button
                                  key={tab.id}
                                  onClick={() => setPlanTab(tab.id as any)}
                                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                                    active
                                      ? "border-zinc-200 text-white bg-[#0e1117]"
                                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                                  }`}
                                >
                                  <Icon className="w-3 h-3" />
                                  <span>{tab.label}</span>
                                  {tab.count !== undefined && (
                                    <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                                      {tab.count}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <div className="p-4 space-y-4">
                            {/* 1. Strategy Tab */}
                            {planTab === "strategy" && (
                              <div className="space-y-4">
                                <div className="p-3 rounded bg-[#0b0d12] border border-[#191d26] text-xs text-zinc-300 leading-relaxed">
                                  {msg.planResult.plan.implementationStrategy.overview}
                                </div>
                                <div className="space-y-2">
                                  {msg.planResult.plan.implementationStrategy.steps.map((st, sidx) => (
                                    <div
                                      key={sidx}
                                      className="p-3 rounded bg-[#0a0b0f] border border-[#161820] space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
                                        <span className="flex items-center gap-2">
                                          <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 font-mono text-[10px] flex items-center justify-center">
                                            {sidx + 1}
                                          </span>
                                          {st.title}
                                        </span>
                                        <span className="text-[10px] font-mono text-zinc-500">Basis: {st.basis}</span>
                                      </div>
                                      <p className="text-[11px] text-zinc-400 pl-6 leading-relaxed">{st.detail}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 2. Proposed Changes Tab */}
                            {planTab === "changes" && (
                              <div className="space-y-4">
                                {msg.planResult.plan.proposedChanges.map((ch, cidx) => (
                                  <div
                                    key={cidx}
                                    className="rounded-lg border border-[#1b1e27] bg-[#090b10] overflow-hidden"
                                  >
                                    <div className="px-3 py-2 border-b border-[#181a22] flex items-center justify-between bg-[#0c0e14]">
                                      <div className="flex items-center gap-2 font-mono text-xs text-zinc-200">
                                        <span className="text-[10px] uppercase font-bold text-zinc-400 px-1.5 py-0.2 rounded bg-zinc-800/60 border border-zinc-700/40">
                                          {ch.changeType}
                                        </span>
                                        <span>{ch.path}</span>
                                      </div>
                                      <span className="text-[10px] font-mono text-zinc-500">Evidence: {ch.basis}</span>
                                    </div>
                                    <div className="p-3">
                                      <p className="text-[11px] text-zinc-400 mb-2">{ch.explanation}</p>
                                      <CodeViewer code={ch.code} language={ch.language} filename={ch.path} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 3. Research Docs Tab */}
                            {planTab === "research" && (
                              <div className="space-y-3">
                                {msg.planResult.research.sources.map((src, sidx) => (
                                  <div
                                    key={sidx}
                                    className="p-3 rounded bg-[#090b10] border border-[#181a22] space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium text-zinc-200">
                                        [{src.id}] {src.title}
                                      </span>
                                      {src.official && (
                                        <span className="text-[9px] font-mono text-emerald-400 border border-emerald-900/60 bg-emerald-950/30 px-1.5 rounded">
                                          Official Vendor Doc
                                        </span>
                                      )}
                                    </div>
                                    <a
                                      href={src.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                                    >
                                      {src.url}
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                    <p className="text-[11px] text-zinc-400 font-mono bg-[#0c0d12] p-2 rounded border border-[#151720]">
                                      {src.excerpt}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 4. Testing Tab */}
                            {planTab === "testing" && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded bg-[#090b10] border border-[#181a22] space-y-1.5">
                                  <div className="text-[10px] font-mono uppercase text-zinc-400">Validation Checks</div>
                                  <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px]">
                                    {msg.planResult.plan.testing.unit.map((u, ui) => (
                                      <li key={ui}>{u}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="p-3 rounded bg-[#090b10] border border-[#181a22] space-y-1.5">
                                  <div className="text-[10px] font-mono uppercase text-zinc-400">Security Considerations</div>
                                  <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px]">
                                    {msg.planResult.plan.risks.security.map((s, si) => (
                                      <li key={si}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Follow-up composer bar (fixed at bottom when messages exist) */}
          {messages.length > 0 && (
            <div className="max-w-4xl w-full mx-auto pt-3">
              <div className="rounded-xl border border-[#1e222b] bg-[#0d0f14] p-2.5 shadow-xl flex items-center gap-2">
                <input
                  type="text"
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                  placeholder={`Ask Dexor in ${mode === "work" ? "Work" : "Chat"} Mode...`}
                  className="flex-1 bg-transparent px-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none"
                />
                <button
                  onClick={() => handleSubmit()}
                  disabled={!taskInput.trim()}
                  className="p-1.5 rounded-md bg-zinc-200 hover:bg-white text-zinc-950 transition-colors disabled:opacity-40"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Collapsible Right Context Panel */}
      <ContextPanel
        isOpen={isContextOpen}
        onClose={() => setIsContextOpen(false)}
        repository={repoSummary}
        research={planResult?.research}
        verification={planResult?.verification}
      />

      {/* 4. Floating Dexor Companion Orb */}
      <DexorOrb
        state={dexorState}
        activeRepo={repoSummary?.repo.fullName || repoUrl.replace("https://github.com/", "")}
      />
    </div>
  );
}
