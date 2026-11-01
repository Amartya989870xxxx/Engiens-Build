import React, { useState } from "react";
import { CompanionOrb } from "./CompanionOrb.tsx";
import { Trash2, Radio, Globe, AlertTriangle } from "lucide-react";

interface HeaderProps {
  backendConnected: boolean;
  isThinking: boolean;
  activeMode: "chat" | "work";
  currentDomain?: string;
  onModeChange: (mode: "chat" | "work") => void;
  onClearSession: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  backendConnected,
  isThinking,
  activeMode,
  currentDomain,
  onModeChange,
  onClearSession,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleConfirmClear = () => {
    onClearSession();
    setShowConfirm(false);
  };

  return (
    <header className="bg-[#0a0c10] border-b border-[#1c202a] px-3.5 py-2.5 flex flex-col gap-2.5 select-none relative">
      <div className="flex items-center justify-between">
        {/* Dexor Identity */}
        <div className="flex items-center gap-2.5">
          <CompanionOrb isThinking={isThinking} size="md" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-serif text-[15px] tracking-wide text-zinc-100 font-medium">Dexor</span>
              <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-[#181c26] text-zinc-400 font-mono border border-[#262c3c]">
                Companion
              </span>
            </div>
            <span className="text-[9px] text-zinc-400 tracking-wider uppercase font-mono">
              Engiens Build
            </span>
          </div>
        </div>

        {/* Backend status & domain info */}
        <div className="flex items-center gap-2">
          {currentDomain && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-zinc-400 font-mono px-1.5 py-0.5 rounded bg-[#12151d] border border-[#212633] truncate max-w-[120px]" title={currentDomain}>
              <Globe className="w-2.5 h-2.5 text-zinc-400 flex-shrink-0" />
              <span className="truncate">{currentDomain}</span>
            </div>
          )}

          <div
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
              backendConnected
                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40"
                : "bg-red-950/40 text-red-400 border border-red-800/40"
            }`}
            title={backendConnected ? "Connected to http://localhost:8787" : "Backend unreachable (check port 8787)"}
          >
            <Radio className={`w-2.5 h-2.5 ${backendConnected ? "animate-pulse" : ""}`} />
            <span>{backendConnected ? "8787 Live" : "Offline"}</span>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Confirmation popover */}
      {showConfirm && (
        <div className="absolute top-12 right-3 z-30 bg-[#141822] border border-[#2b3345] rounded-lg p-2.5 shadow-xl flex flex-col gap-2 w-52 animate-in fade-in duration-100">
          <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Clear conversation?</span>
          </div>
          <p className="text-[10.5px] text-zinc-400 leading-normal">
            This will erase messages in the active session.
          </p>
          <div className="flex items-center justify-end gap-1.5 mt-1">
            <button
              onClick={() => setShowConfirm(false)}
              className="text-[10px] px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 font-mono"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClear}
              className="text-[10px] px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium font-mono"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Mode switcher tabs: Chat Mode vs Work Mode */}
      <div className="grid grid-cols-2 p-0.5 bg-[#12151d] rounded-lg border border-[#222734] text-xs">
        <button
          onClick={() => onModeChange("chat")}
          className={`py-1.5 rounded-md font-medium text-[11.5px] transition-all ${
            activeMode === "chat"
              ? "bg-[#212735] text-white shadow-xs font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Chat Mode
        </button>
        <button
          onClick={() => onModeChange("work")}
          className={`py-1.5 rounded-md font-medium text-[11.5px] transition-all ${
            activeMode === "work"
              ? "bg-[#212735] text-white shadow-xs font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Work Mode
        </button>
      </div>
    </header>
  );
};
