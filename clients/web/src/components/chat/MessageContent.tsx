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

function preprocessDiscord(text: string): string {
  return text
    .replace(/\|\|([^|]+)\|\|/g, (_, inner) => `<spoiler>${inner}</spoiler>`)
    .replace(/<@!?(\d+)>/g, (_, id) => `**@user_${id}**`)
    .replace(/<#(\d+)>/g, (_, id) => `**#channel_${id}**`)
    .replace(/<@&(\d+)>/g, (_, id) => `**@role_${id}**`)
    .replace(/^-# (.+)$/gm, (_, t) => `<subtext>${t}</subtext>`);
}

export default function MessageContent({ content, compact }: Props) {
  const processed = useMemo(() => preprocessDiscord(content), [content]);

  return (
    <div className={cn("message-markdown break-words", compact && "compact")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => (
            <span className="block leading-[1.375]">{children}</span>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-[#dcdbf0]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
          ),
          del: ({ children }) => (
            <del className="line-through opacity-60">{children}</del>
          ),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code: (props: any) => {
            const { children, className } = props;
            const isBlock = (className as string | undefined)?.includes("language-");
            if (isBlock) return null;
            return (
              <code className="bg-[#1e2035] text-[#f9c74f] rounded px-1 py-0.5 text-[85%] font-mono border border-[#2e3150]">
                {children}
              </code>
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pre: (props: any) => {
            const children = props.children as React.ReactNode;
            const child = React.Children.toArray(children)[0] as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
            const lang = (child?.props?.className as string | undefined)?.replace("language-", "") ?? "text";
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
          blockquote: ({ children }) => (
            <div className="flex gap-2 my-0.5">
              <div className="w-1 bg-[#4e5058] rounded-full flex-shrink-0" />
              <div className="text-[#8b8fad] italic">{children}</div>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="text-[#00aff4] hover:underline">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-0.5 my-1 pl-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-0.5 my-1 pl-2">{children}</ol>
          ),
          li: ({ children }) => <li className="text-[#dcdbf0]">{children}</li>,
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-[#dcdbf0] mt-2 mb-1 border-b border-[#2e3150] pb-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-[#dcdbf0] mt-2 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-[#dcdbf0] mt-1 mb-0.5">{children}</h3>
          ),
          hr: () => <hr className="border-[#2e3150] my-2" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-[#2e3150]">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#1e2035]">{children}</thead>,
          tr:    ({ children }) => <tr className="border-b border-[#2e3150]">{children}</tr>,
          th:    ({ children }) => <th className="px-3 py-2 text-left text-xs font-bold uppercase text-[#8b8fad]">{children}</th>,
          td:    ({ children }) => <td className="px-3 py-2 text-[#dcdbf0]">{children}</td>,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
