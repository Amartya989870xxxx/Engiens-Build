import React from "react";
import type { CapturedPageContext } from "@shared/contract.js";
import { Camera, Check, FileText, Globe, RefreshCw } from "lucide-react";

interface ContextBadgeProps {
  currentTab: { title: string; url: string; domain: string } | null;
  capturedContext: CapturedPageContext | null;
  isCapturing: boolean;
  onCapture: () => void;
  onViewPreview: () => void;
}

export const ContextBadge: React.FC<ContextBadgeProps> = ({
  currentTab,
  capturedContext,
  isCapturing,
  onCapture,
  onViewPreview,
}) => {
  const isCapturedCurrent = capturedContext && currentTab && capturedContext.url === currentTab.url;

  return (
    <div className="bg-[#101216] border-b border-[#21252d] px-3 py-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Globe className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          <span className="text-[11px] text-zinc-300 font-mono truncate" title={currentTab?.url || "No tab"}>
            {currentTab?.domain || "Detecting tab..."}
          </span>
        </div>

        <button
          onClick={onCapture}
          disabled={isCapturing}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
            isCapturedCurrent
              ? "bg-[#18251e] border border-emerald-600/40 text-emerald-300 hover:bg-[#1e3227]"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
          }`}
          title="Capture active tab's visible text and structure"
        >
          {isCapturing ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : isCapturedCurrent ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Camera className="w-3 h-3" />
          )}
          <span>{isCapturedCurrent ? "Recapture" : "Capture Page Context"}</span>
        </button>
      </div>

      {capturedContext && (
        <div className="flex items-center justify-between bg-[#15181f] border border-[#262b35] rounded px-2 py-1 text-[10.5px]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-zinc-200 font-medium truncate" title={capturedContext.title}>
              {capturedContext.title}
            </span>
            <span className="text-zinc-400 font-mono text-[9.5px]">
              ({capturedContext.contentLength || capturedContext.pageContent.length} chars)
            </span>
          </div>

          <button
            onClick={onViewPreview}
            className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[10.5px] font-medium ml-2 px-1.5 py-0.5 rounded hover:bg-emerald-950/30"
          >
            <FileText className="w-3 h-3" />
            <span>Preview</span>
          </button>
        </div>
      )}
    </div>
  );
};
