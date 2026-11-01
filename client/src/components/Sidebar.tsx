import React from "react";
import {
  Plus,
  Compass,
  FolderGit2,
  Bookmark,
  Clock,
  Settings,
} from "lucide-react";
import type { DexorState } from "./DexorOrb";

interface SidebarProps {
  currentRepo: string;
  onSelectRepo: (url: string) => void;
  onNewSession: () => void;
  dexorState: DexorState;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRepo,
  onSelectRepo,
  onNewSession,
  dexorState,
}) => {
  const recentRepos = [
    { name: "expressjs/express", url: "https://github.com/expressjs/express" },
    { name: "facebook/react", url: "https://github.com/facebook/react" },
    { name: "vercel/next.js", url: "https://github.com/vercel/next.js" },
  ];

  return (
    <aside className="w-64 h-screen border-r border-[#181a1f] bg-[#090a0d] flex flex-col justify-between shrink-0 select-none">
      {/* Top Header & Brand */}
      <div>
        <div className="px-5 py-4.5 border-b border-[#181a1f] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-zinc-200 via-zinc-400 to-zinc-600 flex items-center justify-center shadow-inner">
              <div className="w-1.5 h-1.5 rounded-full bg-black" />
            </div>
            <div>
              <span className="font-serif italic text-base tracking-wide text-zinc-100 font-semibold block leading-tight">
                Engiens
              </span>
              <span className="text-[10px] font-mono tracking-widest uppercase text-zinc-500 block">
                Build Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-800 bg-[#0d0e12] text-[10px] text-zinc-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
            <span>Dexor</span>
          </div>
        </div>

        {/* Action: New Session */}
        <div className="p-3">
          <button
            onClick={onNewSession}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-[#13151b] hover:bg-[#1a1d26] border border-[#20242e] text-xs font-medium text-zinc-200 transition-colors group"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-100 transition-colors" />
            <span>New Session</span>
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="px-3 py-2 space-y-0.5">
          <button className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-300 hover:text-white hover:bg-[#111319] transition-colors">
            <Compass className="w-3.5 h-3.5 text-zinc-500" />
            <span>Workspaces</span>
          </button>
          <button className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-300 hover:text-white hover:bg-[#111319] transition-colors">
            <Bookmark className="w-3.5 h-3.5 text-zinc-500" />
            <span>Research Library</span>
          </button>
          <button className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-300 hover:text-white hover:bg-[#111319] transition-colors">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span>Recent Sessions</span>
          </button>
        </div>

        {/* Connected Repositories Section */}
        <div className="mt-5 px-3">
          <div className="px-2 text-[10px] font-mono tracking-wider uppercase text-zinc-500 mb-1.5 flex items-center justify-between">
            <span>Repositories</span>
            <FolderGit2 className="w-3 h-3 text-zinc-600" />
          </div>

          <div className="space-y-0.5">
            {recentRepos.map((repo) => {
              const isSelected = currentRepo === repo.url;
              return (
                <button
                  key={repo.name}
                  onClick={() => onSelectRepo(repo.url)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors ${
                    isSelected
                      ? "bg-[#141720] text-zinc-100 border border-[#222736]"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-[#0f1117]"
                  }`}
                >
                  <span className="truncate">{repo.name}</span>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Status & Settings */}
      <div className="p-3 border-t border-[#181a1f] space-y-2">
        {/* Dexor status summary */}
        <div className="px-2.5 py-2 rounded-md bg-[#0d0f14] border border-[#1b1e27] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-300 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
            <span className="text-zinc-300 font-serif italic">Dexor Companion</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{dexorState}</span>
        </div>

        <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#111319] transition-colors">
          <Settings className="w-3.5 h-3.5 text-zinc-500" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
