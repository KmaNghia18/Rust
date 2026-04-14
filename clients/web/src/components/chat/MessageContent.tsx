"use client";
import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  compact?: boolean;
}

// Pre-process Discord-specific syntax before ReactMarkdown
function preprocessDiscord(text: string): string {
  return text
    // ||spoiler|| → <spoiler>
    .replace(/\|\|(.+?)\|\|/gs, (_, inner) => `<spoiler>${inner}</spoiler>`)
    // @user mention
    .replace(/<@!?(\d+)>/g, (_, id) => `**@user_${id}**`)
    // #channel
    .replace(/<#(\d+)>/g, (_, id) => `**#channel_${id}**`)
    // @role
    .replace(/<@&(\d+)>/g, (_, id) => `**@role_${id}**`)
    // Custom emoji :name:
    .replace(/:(\w+):/g, (match, name) => match) // keep as-is for now
    // ~~strikethrough~~ Discord style → remark-gfm handles this
    // -# subtext (Discord 2023+)
    .replace(/^-# (.+)$/gm, (_, text) => `<subtext>${text}</subtext>`);
}

export default function MessageContent({ content, compact }: Props) {
  const processed = useMemo(() => preprocessDiscord(content), [content]);

  return (
    <div className={cn("message-markdown break-words", compact && "compact")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // ── Paragraph: no extra margin for compact
          p: ({ children }) => (
            <span className="block leading-[1.375]">{children}</span>
          ),

          // ── Bold
          strong: ({ children }) => (
            <strong className="font-bold text-[#dcdbf0]">{children}</strong>
          ),

          // ── Italic
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),

          // ── Strikethrough (remark-gfm)
          del: ({ children }) => (
            <del className="line-through opacity-60">{children}</del>
          ),

          // ── Inline code
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) return null; // handled by pre/code below
            return (
              <code className="bg-[#1e2035] text-[#f9c74f] rounded px-1 py-0.5 text-[85%] font-mono border border-[#2e3150]">
                {children}
              </code>
            );
          },

          // ── Code block with language
          pre: ({ children, ...props }) => {
            const child = React.Children.toArray(children)[0] as React.ReactElement;
            const lang = child?.props?.className?.replace("language-", "") ?? "text";
            const code = String(child?.props?.children ?? "").trimEnd();

            return (
              <div className="my-1 rounded-lg overflow-hidden border border-[#2e3150]">
                <div className="flex items-center justify-between bg-[#111827] px-3 py-1.5">
                  <span className="text-xs text-[#5c6080] font-mono">{lang}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(code)}
                    className="text-[10px] text-[#8b8fad] hover:text-[#dcdbf0] transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-[#1a1c2e] px-4 py-3 overflow-x-auto text-sm font-mono text-[#dcdbf0] leading-6">
                  <code>{code}</code>
                </pre>
              </div>
            );
          },

          // ── Blockquote
          blockquote: ({ children }) => (
            <div className="flex gap-2 my-0.5">
              <div className="w-1 bg-[#4e5058] rounded-full flex-shrink-0" />
              <div className="text-[#8b8fad] italic">{children}</div>
            </div>
          ),

          // ── Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00aff4] hover:underline"
            >
              {children}
            </a>
          ),

          // ── Unordered list
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-0.5 my-1 pl-2">{children}</ul>
          ),

          // ── Ordered list
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-0.5 my-1 pl-2">{children}</ol>
          ),

          li: ({ children }) => (
            <li className="text-[#dcdbf0]">{children}</li>
          ),

          // ── Heading (H1-H3)
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-[#dcdbf0] mt-2 mb-1 border-b border-[#2e3150] pb-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-[#dcdbf0] mt-2 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-[#dcdbf0] mt-1 mb-0.5">{children}</h3>
          ),

          // ── Horizontal rule
          hr: () => <hr className="border-[#2e3150] my-2" />,

          // ── Table (remark-gfm)
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-[#2e3150]">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#1e2035]">{children}</thead>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-[#2e3150]">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-xs font-bold uppercase text-[#8b8fad]">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-[#dcdbf0]">{children}</td>
          ),

          // ── Custom HTML (spoiler, subtext from preprocessor)
          span: ({ children }) => <span>{children}</span>,
        }}
      >
        {processed}
      </ReactMarkdown>

      {/* Spoiler rendering — CSS only */}
      <style jsx global>{`
        .message-markdown spoiler {
          background: #202225;
          color: transparent;
          border-radius: 3px;
          padding: 0 2px;
          cursor: pointer;
          transition: all 0.15s;
          user-select: none;
        }
        .message-markdown spoiler:hover,
        .message-markdown spoiler.revealed {
          background: #40444b;
          color: #dcdbf0;
        }
        .message-markdown subtext {
          display: block;
          font-size: 11px;
          color: #8b8fad;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
