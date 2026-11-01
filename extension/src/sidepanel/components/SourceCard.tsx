import React from "react";
import type { CompanionSourceItem } from "@shared/contract.js";
import { ExternalLink, CheckCircle } from "lucide-react";

interface SourceCardProps {
  source: CompanionSourceItem;
}

export const SourceCard: React.FC<SourceCardProps> = ({ source }) => {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-1 p-2 rounded-md bg-[#111318] border border-[#23272f] hover:border-emerald-500/50 hover:bg-[#141820] transition-colors text-left"
    >
      <div className="flex items-center justify-between gap-1 text-[11px] font-medium text-zinc-300 group-hover:text-emerald-400">
        <span className="truncate flex items-center gap-1">
          {source.official && (
            <span className="text-emerald-400" title="Verified Official Source">
              <CheckCircle className="w-3 h-3 inline" />
            </span>
          )}
          {source.title}
        </span>
        <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
      </div>
      {source.snippet && (
        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
          {source.snippet}
        </p>
      )}
      <span className="text-[9px] text-zinc-400 font-mono truncate">
        {source.url}
      </span>
    </a>
  );
};
