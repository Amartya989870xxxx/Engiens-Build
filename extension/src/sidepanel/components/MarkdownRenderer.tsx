import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ExternalLink } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

const CodeBlock: React.FC<{ language?: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cleanLang = language ? language.replace(/^language-/, "") : "code";

  return (
    <div className="my-3 rounded-lg border border-[#27272a] bg-[#0c0d12] overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#14161f] border-b border-[#232634] text-[10.5px] font-mono text-zinc-400">
        <span className="uppercase tracking-wider">{cleanLang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-zinc-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11.5px] leading-relaxed font-mono text-zinc-100 m-0 bg-transparent border-0">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-invert max-w-none text-[12.5px] leading-relaxed text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1({ children }) {
            return (
              <h1 className="text-base font-semibold text-zinc-100 mt-4 mb-2 pb-1 border-b border-zinc-800">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="text-sm font-semibold text-zinc-100 mt-3.5 mb-1.5 pb-0.5 border-b border-zinc-800/60">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="text-[13px] font-medium text-emerald-400 mt-3 mb-1">
                {children}
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4 className="text-xs font-medium text-zinc-300 mt-2.5 mb-1">
                {children}
              </h4>
            );
          },
          p({ children }) {
            return <p className="my-2 leading-relaxed">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return (
              <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
            );
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-emerald-500/60 bg-[#12161f] pl-3 py-1 my-2 text-zinc-300 italic rounded-r text-[12px]">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-[#27272a]">
                <table className="w-full text-left text-xs border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-[#14161f] border-b border-[#27272a] text-zinc-200 font-medium">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-[#20222a] bg-[#0c0d12]">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="hover:bg-[#151722] transition-colors">{children}</tr>;
          },
          th({ children }) {
            return <th className="px-3 py-2 font-medium">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 text-zinc-300">{children}</td>;
          },
          hr() {
            return <hr className="my-4 border-t border-[#27272a]" />;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors font-medium"
              >
                <span>{children}</span>
                <ExternalLink className="w-3 h-3 inline-block opacity-70" />
              </a>
            );
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-[#181a22] border border-[#2c303e] text-[11px] font-mono text-emerald-300 mx-0.5"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                language={match ? match[1] : undefined}
                code={String(children).replace(/\n$/, "")}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
