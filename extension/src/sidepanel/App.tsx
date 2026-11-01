import React, { useState, useEffect, useCallback } from "react";
import type {
  CapturedPageContext,
  CompanionChatResponse,
  CompanionWorkResponse,
  CompanionSourceItem,
} from "@shared/contract.js";
import { Header } from "./components/Header.tsx";
import { ContextBadge } from "./components/ContextBadge.tsx";
import { ContextPreviewModal } from "./components/ContextPreviewModal.tsx";
import { ChatView } from "./components/ChatView.tsx";
import { WorkView } from "./components/WorkView.tsx";
import { extractPageContentInPage } from "../content/extractor.ts";

export interface CompanionChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: CompanionSourceItem[];
  model?: string;
  provider?: "gemini" | "groq";
  timestamp: string;
}

const BACKEND_URL = "http://localhost:8787";

export const App: React.FC = () => {
  const [activeMode, setActiveMode] = useState<"chat" | "work">("chat");
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<{
    id?: number;
    title: string;
    url: string;
    domain: string;
  } | null>(null);

  const [capturedContext, setCapturedContext] = useState<CapturedPageContext | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [messages, setMessages] = useState<CompanionChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const [workResponse, setWorkResponse] = useState<CompanionWorkResponse | null>(null);
  const [isGeneratingWork, setIsGeneratingWork] = useState(false);

  // 1. Check backend health
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/health`, { method: "GET" });
      if (res.ok) {
        setBackendConnected(true);
      } else {
        setBackendConnected(false);
      }
    } catch {
      setBackendConnected(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 25000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // 2. Query and track active tab
  const updateCurrentTab = useCallback(async () => {
    try {
      if (typeof chrome === "undefined" || !chrome.tabs) return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        try {
          const parsed = new URL(tab.url);
          setCurrentTab({
            id: tab.id,
            title: tab.title || parsed.hostname,
            url: tab.url,
            domain: parsed.hostname,
          });
        } catch {
          setCurrentTab({
            id: tab.id,
            title: tab.title || "Unknown tab",
            url: tab.url,
            domain: "browser",
          });
        }
      }
    } catch (err) {
      console.warn("[Dexor Companion] Error fetching active tab:", err);
    }
  }, []);

  useEffect(() => {
    updateCurrentTab();

    if (typeof chrome !== "undefined" && chrome.tabs) {
      const onTabActivated = () => updateCurrentTab();
      const onTabUpdated = (_tabId: number, changeInfo: { status?: string; url?: string }) => {
        if (changeInfo.status === "complete" || changeInfo.url) {
          updateCurrentTab();
        }
      };

      chrome.tabs.onActivated.addListener(onTabActivated);
      chrome.tabs.onUpdated.addListener(onTabUpdated);

      return () => {
        chrome.tabs.onActivated.removeListener(onTabActivated);
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
      };
    }
  }, [updateCurrentTab]);

  // 3. Load persisted session
  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["dexor_messages", "dexor_context"], (res: Record<string, any>) => {
        if (Array.isArray(res.dexor_messages)) setMessages(res.dexor_messages);
        if (res.dexor_context) setCapturedContext(res.dexor_context);
      });
    }
  }, []);

  // Save session when updated
  const persistSession = (newMessages: CompanionChatMessage[], newContext: CapturedPageContext | null) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        dexor_messages: newMessages,
        dexor_context: newContext,
      });
    }
  };

  // 4. Capture Page Context
  const handleCapture = async () => {
    setCaptureError(null);
    setIsCapturing(true);

    try {
      if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) {
        throw new Error("Chrome extension APIs unavailable");
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url) {
        throw new Error("No active tab detected");
      }

      // Check for restricted URLs
      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("devtools://") ||
        tab.url.startsWith("view-source:")
      ) {
        throw new Error("Cannot capture internal browser page. Please navigate to a website or documentation.");
      }

      // Execute on-demand extraction function directly in the active tab
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContentInPage,
      });

      const extracted = results?.[0]?.result as CapturedPageContext | undefined;
      if (!extracted || !extracted.pageContent) {
        throw new Error("Could not extract readable text from this webpage.");
      }

      setCapturedContext(extracted);
      persistSession(messages, extracted);
    } catch (err: any) {
      setCaptureError(err.message || "Failed to capture page context");
    } finally {
      setIsCapturing(false);
    }
  };

  // 5. Send Chat Message
  const handleSendMessage = async (text: string) => {
    const userMsg: CompanionChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsThinking(true);
    setStatusMessage("Dexor is reasoning with live intelligence...");

    try {
      const payloadHistory = updatedMessages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${BACKEND_URL}/api/companion/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          pageContext: capturedContext || undefined,
          history: payloadHistory,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Backend responded with HTTP ${res.status}`);
      }

      const data: CompanionChatResponse = await res.json();

      const assistantMsg: CompanionChatMessage = {
        id: data.id,
        role: "assistant",
        content: data.reply,
        sources: data.sources,
        model: data.model,
        provider: data.provider,
        timestamp: data.createdAt,
      };

      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      persistSession(finalMessages, capturedContext);
    } catch (err: any) {
      const errorMsg: CompanionChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `**Dexor Error:** Unable to complete request.\n\n\`${err.message}\`\n\nEnsure the backend server is running on \`http://localhost:8787\`.`,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);
      persistSession(finalMessages, capturedContext);
    } finally {
      setIsThinking(false);
      setStatusMessage("");
    }
  };

  // 6. Generate Work Recommendation
  const handleGenerateWork = async (task: string, repoUrl?: string) => {
    setIsGeneratingWork(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/companion/work`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          repoUrl,
          pageContext: capturedContext || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Work recommendation failed (${res.status})`);
      }

      const data: CompanionWorkResponse = await res.json();
      setWorkResponse(data);
    } catch (err: any) {
      alert(`Dexor Work Error: ${err.message}`);
    } finally {
      setIsGeneratingWork(false);
    }
  };

  // 7. Clear Session
  const handleClearSession = () => {
    setMessages([]);
    setWorkResponse(null);
    persistSession([], capturedContext);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#08090c] text-zinc-200">
      <Header
        backendConnected={backendConnected}
        isThinking={isThinking || isGeneratingWork}
        activeMode={activeMode}
        currentDomain={currentTab?.domain}
        onModeChange={setActiveMode}
        onClearSession={handleClearSession}
      />

      <ContextBadge
        currentTab={currentTab}
        capturedContext={capturedContext}
        isCapturing={isCapturing}
        onCapture={handleCapture}
        onViewPreview={() => setShowPreviewModal(true)}
      />

      {captureError && (
        <div className="mx-3 mt-2 p-2 bg-red-950/40 border border-red-800/40 rounded text-[11px] text-red-300 flex items-center justify-between">
          <span>{captureError}</span>
          <button
            onClick={() => setCaptureError(null)}
            className="text-xs text-red-400 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {activeMode === "chat" ? (
        <ChatView
          messages={messages}
          isThinking={isThinking}
          statusMessage={statusMessage}
          onSendMessage={handleSendMessage}
          hasCapturedContext={Boolean(capturedContext)}
        />
      ) : (
        <WorkView
          onGenerateWork={handleGenerateWork}
          workResponse={workResponse}
          isGenerating={isGeneratingWork}
          hasCapturedContext={Boolean(capturedContext)}
        />
      )}

      {showPreviewModal && (
        <ContextPreviewModal
          context={capturedContext}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  );
};
