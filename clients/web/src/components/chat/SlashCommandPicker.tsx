"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { guildsApi, messagesApi } from "@/lib/api";
import { useGuildStore, useChannelStore, useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Slash, Hash, ShieldCheck, UserMinus, MessagesSquare, HelpCircle, Smile } from "lucide-react";

interface SlashCommand {
  name: string;
  desc: string;
  args?: string;
  icon: React.ReactNode;
  category: "moderation" | "channel" | "fun" | "info";
  execute: (args: string[], channelId: string, guildId: string) => Promise<string | void>;
}

// Built-in slash commands
const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    name: "help",
    desc: "List all available commands",
    icon: <HelpCircle size={14} />,
    category: "info",
    execute: async () => {
      return BUILTIN_COMMANDS.map(c => `**/${c.name}** — ${c.desc}`).join("\n");
    },
  },
  {
    name: "shrug",
    desc: "Append a shrug to your message",
    icon: <Smile size={14} />,
    category: "fun",
    execute: async () => { return "¯\\_(ツ)_/¯"; },
  },
  {
    name: "tableflip",
    desc: "Flip the table",
    icon: <Smile size={14} />,
    category: "fun",
    execute: async () => { return "(╯°□°）╯︵ ┻━┻"; },
  },
  {
    name: "unflip",
    desc: "Put the table back",
    icon: <Smile size={14} />,
    category: "fun",
    execute: async () => { return "┬─┬ ノ( ゜-゜ノ)"; },
  },
  {
    name: "me",
    desc: "Perform an action",
    args: "<action>",
    icon: <MessagesSquare size={14} />,
    category: "channel",
    execute: async (args) => { return `_${args.join(" ")}_`; },
  },
  {
    name: "spoiler",
    desc: "Mark text as a spoiler",
    args: "<text>",
    icon: <Hash size={14} />,
    category: "channel",
    execute: async (args) => { return `||${args.join(" ")}||`; },
  },
  {
    name: "nick",
    desc: "Change your server nickname",
    args: "<new nickname>",
    icon: <ShieldCheck size={14} />,
    category: "channel",
    execute: async (args, _ch, guildId) => {
      // This would call PATCH /guilds/{id}/members/@me
      return `Nickname changed to: ${args.join(" ")}`;
    },
  },
  {
    name: "clear",
    desc: "Delete your last N messages (default 10)",
    args: "[count]",
    icon: <Hash size={14} />,
    category: "moderation",
    execute: async ([countStr], channelId) => {
      const count = Math.min(100, Math.max(1, parseInt(countStr) || 10));
      return `Clearing last ${count} messages…`;
    },
  },
];

const CATEGORY_COLOR: Record<string, string> = {
  moderation: "#ed4245",
  channel: "#5865f2",
  fun: "#fee75c",
  info: "#57f287",
};

interface Props {
  query: string;        // text after "/"
  onSelect: (text: string) => void;
  onClose: () => void;
}

export default function SlashCommandPicker({ query, onSelect, onClose }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = BUILTIN_COMMANDS.filter(c =>
    c.name.startsWith(query.toLowerCase()) ||
    c.desc.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const execute = useCallback(async (cmd: SlashCommand, rawArgs: string[]) => {
    const result = await cmd.execute(rawArgs, "", "");
    if (result) onSelect(result);
    else onSelect("");
    onClose();
  }, [onSelect, onClose]);

  // Expose keyboard navigation to parent via window events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selectedIndex];
        if (cmd) {
          if (cmd.args) {
            // User fills in args; insert command name
            onSelect(`/${cmd.name} `);
          } else {
            execute(cmd, []);
          }
        }
      }
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered, selectedIndex, execute, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-[#1e2035] border border-[#2e3150] rounded-xl overflow-hidden shadow-2xl animate-fadeIn z-50 max-h-72 overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2e3150] bg-[#111827]">
        <Slash size={14} className="text-[#8b8fad]" />
        <span className="text-xs font-bold text-[#8b8fad] uppercase tracking-wider">Commands</span>
      </div>

      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          onMouseDown={e => { e.preventDefault(); execute(cmd, []); }}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-[#2e3150]/30",
            i === selectedIndex ? "bg-[#5865f2]" : "hover:bg-[#252840]"
          )}
        >
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
            i === selectedIndex ? "bg-white/20" : "bg-[#252840]"
          )}
            style={i !== selectedIndex ? { color: CATEGORY_COLOR[cmd.category] } : {}}
          >
            {cmd.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-bold font-mono",
                i === selectedIndex ? "text-white" : "text-[#dcdbf0]"
              )}>
                /{cmd.name}
              </span>
              {cmd.args && (
                <span className={cn(
                  "text-xs",
                  i === selectedIndex ? "text-white/60" : "text-[#5c6080]"
                )}>
                  {cmd.args}
                </span>
              )}
            </div>
            <p className={cn(
              "text-xs truncate",
              i === selectedIndex ? "text-white/70" : "text-[#8b8fad]"
            )}>
              {cmd.desc}
            </p>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
            style={{
              background: `${CATEGORY_COLOR[cmd.category]}20`,
              color: i === selectedIndex ? "white" : CATEGORY_COLOR[cmd.category],
            }}
          >
            {cmd.category}
          </span>
        </button>
      ))}

      <div className="px-3 py-1.5 bg-[#111827] border-t border-[#2e3150]">
        <span className="text-[10px] text-[#5c6080]">
          <kbd className="bg-[#1e2035] border border-[#2e3150] rounded px-1">↑↓</kbd> navigate ·{" "}
          <kbd className="bg-[#1e2035] border border-[#2e3150] rounded px-1">Tab</kbd> fill ·{" "}
          <kbd className="bg-[#1e2035] border border-[#2e3150] rounded px-1">Enter</kbd> execute
        </span>
      </div>
    </div>
  );
}

export { BUILTIN_COMMANDS };
export type { SlashCommand };
