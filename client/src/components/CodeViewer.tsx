import React, { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { Copy, Check } from "lucide-react";

interface CodeViewerProps {
  code: string;
  language?: string;
  filename?: string;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ code, language = "typescript", filename }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const normalizedLang = language.toLowerCase() === "ts" || language.toLowerCase() === "tsx" ? "typescript" :
    language.toLowerCase() === "js" || language.toLowerCase() === "jsx" ? "javascript" :
    language.toLowerCase() === "py" ? "python" :
    language.toLowerCase() === "json" ? "json" :
    language.toLowerCase() === "diff" ? "diff" : "typescript";

  return (
    <div className="rounded-lg border border-[#212631] bg-[#0d1017] overflow-hidden my-3 shadow-md">
      {filename && (
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#212631] bg-[#131720]">
          <span className="text-xs font-mono text-[#8b949e] font-medium">{filename}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#e1e4ea] transition-colors px-2 py-0.5 rounded hover:bg-[#1c222e]"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}
      <div className="overflow-x-auto text-xs p-4 leading-relaxed font-mono">
        <Highlight theme={themes.vsDark} code={code.trim()} language={normalizedLang}>
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre style={{ ...style, backgroundColor: "transparent", margin: 0 }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })} className="table-row">
                  <span className="table-cell select-none text-[#484f58] pr-4 text-right w-8">{i + 1}</span>
                  <span className="table-cell">
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
};
