import React, { useState } from "react";
import { X, Shield } from "lucide-react";

export type DexorState =
  | "idle"
  | "listening"
  | "thinking"
  | "researching"
  | "working"
  | "waiting"
  | "completed"
  | "error";

interface DexorOrbProps {
  state: DexorState;
  activeRepo?: string | null;
  onOpenAction?: (prompt: string) => void;
}

export const DexorOrb: React.FC<DexorOrbProps> = ({ state, activeRepo }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Status mapping
  const stateMeta: Record<DexorState, { label: string; ringColor: string; coreColor: string; description: string }> = {
    idle: {
      label: "Dexor is standby",
      ringColor: "border-zinc-700/60",
      coreColor: "from-zinc-400/20 via-zinc-800 to-black",
      description: "Ready to analyze codebases and research live documentation.",
    },
    listening: {
      label: "Dexor is listening",
      ringColor: "border-zinc-400/80",
      coreColor: "from-zinc-200/40 via-zinc-600 to-black",
      description: "Receiving task requirements and architectural constraints.",
    },
    thinking: {
      label: "Synthesizing Architecture",
      ringColor: "border-zinc-300",
      coreColor: "from-white/40 via-zinc-400 to-zinc-950",
      description: "Gemini 3.8 is reasoning over repository context and live docs.",
    },
    researching: {
      label: "Querying TinyFish",
      ringColor: "border-sky-400/60",
      coreColor: "from-sky-300/30 via-zinc-800 to-black",
      description: "Searching and fetching official vendor documentation.",
    },
    working: {
      label: "Compiling Implementation Plan",
      ringColor: "border-zinc-300",
      coreColor: "from-zinc-100/30 via-zinc-700 to-black",
      description: "Drafting file diffs, verifying signatures, and planning tests.",
    },
    waiting: {
      label: "Waiting for Approval",
      ringColor: "border-amber-400/70",
      coreColor: "from-amber-400/20 via-zinc-800 to-black",
      description: "Awaiting developer feedback or configuration inputs.",
    },
    completed: {
      label: "Plan Completed",
      ringColor: "border-emerald-400/70",
      coreColor: "from-emerald-400/20 via-zinc-800 to-black",
      description: "Engineering strategy and code changes ready for review.",
    },
    error: {
      label: "Encountered Issue",
      ringColor: "border-rose-500/80",
      coreColor: "from-rose-500/30 via-zinc-900 to-black",
      description: "Inspection or upstream API call reported an error.",
    },
  };

  const current = stateMeta[state];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Companion Expanded Panel */}
      {isOpen && (
        <div className="mb-3 w-80 rounded-xl border border-zinc-800/80 bg-[#0d0e12]/95 backdrop-blur-xl shadow-2xl p-4 text-xs text-zinc-300 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-zinc-200 animate-pulse" />
              <span className="font-medium text-zinc-100 text-sm tracking-tight font-serif italic">Dexor</span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/50">
                Companion
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="py-3.5 space-y-3">
            <div>
              <div className="text-[11px] font-mono uppercase text-zinc-500 mb-1">State</div>
              <div className="text-zinc-200 font-medium flex items-center gap-1.5">
                <span className="text-xs">{current.label}</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{current.description}</p>
            </div>

            <div className="p-2.5 rounded-lg border border-zinc-800/60 bg-zinc-950/40 space-y-1.5">
              <div className="text-[10px] font-mono uppercase text-zinc-500">Connected Intelligence</div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Web Research</span>
                <span className="text-zinc-200 font-mono">TinyFish REST (Search + Fetch)</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Reasoning Core</span>
                <span className="text-zinc-200 font-mono">Gemini 3.8 Flash</span>
              </div>
              {activeRepo && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-800/40">
                  <span className="text-zinc-400">Context</span>
                  <span className="text-zinc-300 font-mono truncate max-w-[150px]">{activeRepo}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span>Engiens Autonomous Workspace</span>
            <span className="flex items-center gap-1">
              <Shield className="w-2.5 h-2.5 text-zinc-400" /> Grounded
            </span>
          </div>
        </div>
      )}

      {/* Dimensional Floating Spherical Orb */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center justify-center w-12 h-12 rounded-full focus:outline-none transition-transform duration-300 hover:scale-105 active:scale-95"
        title="Dexor Companion"
      >
        {/* Outer subtle glow ring */}
        <div
          className={`absolute inset-0 rounded-full border ${current.ringColor} transition-all duration-500 ${
            state === "thinking" || state === "working" ? "animate-orb-thinking" : "animate-orb-pulse"
          }`}
        />

        {/* Spherical core with monochromatic depth lighting */}
        <div
          className={`w-10 h-10 rounded-full bg-gradient-to-br ${current.coreColor} border border-white/20 shadow-inner flex items-center justify-center transition-all duration-500`}
        >
          {/* Dimensional light reflection specular highlight */}
          <div className="absolute top-1.5 left-2.5 w-3 h-1.5 rounded-full bg-white/40 blur-[0.6px] -rotate-45" />

          {/* Core glyph: restrained abstract nexus or dot */}
          <div className="w-2 h-2 rounded-full bg-zinc-100 shadow-[0_0_8px_rgba(255,255,255,0.8)] opacity-90 group-hover:scale-110 transition-transform" />
        </div>

        {/* Subtle companion label tooltip when hovering */}
        <span className="sr-only">Toggle Dexor Companion</span>
      </button>
    </div>
  );
};
