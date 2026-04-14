"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useGuildStore, useChannelStore, useUIStore } from "@/lib/store";
import { Hash, Volume2, Users, Server, MessageSquare, Clock, Search, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwitcherItem {
  id: string;
  type: "channel" | "guild" | "dm" | "recent";
  label: string;
  sublabel?: string;
  guildName?: string;
  icon?: React.ReactNode;
}

interface Props { onClose: () => void }

export default function QuickSwitcher({ onClose }: Props) {
  const { guilds, activeGuildId, setActiveGuild } = useGuildStore();
  const { channels, setActiveChannel } = useChannelStore();
  const { setActiveGuild: setUIGuild } = useUIStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Build flat list of all channels across all guilds
  const allChannels: SwitcherItem[] = Object.entries(channels).flatMap(([guildId, chs]) => {
    const guild = guilds.find(g => g.id === guildId);
    return chs
      .filter(ch => ch.type !== 4) // no categories
      .map(ch => ({
        id: ch.id,
        type: ch.type === 2 ? "channel" : "channel",
        label: ch.name,
        sublabel: guild?.name,
        guildName: guild?.name,
        icon: ch.type === 2
          ? <Volume2 size={14} className="text-[#8b8fad]" />
          : <Hash size={14} className="text-[#8b8fad]" />,
      }));
  });

  const allGuilds: SwitcherItem[] = guilds.map(g => ({
    id: g.id,
    type: "guild",
    label: g.name,
    sublabel: "Server",
    icon: <Server size={14} className="text-[#5865f2]" />,
  }));

  // Filter by query
  const q = query.toLowerCase();
  const filtered: SwitcherItem[] = q.length === 0
    ? [...allGuilds, ...allChannels].slice(0, 15)
    : [
        ...allGuilds.filter(g => g.label.toLowerCase().includes(q)),
        ...allChannels.filter(c => c.label.toLowerCase().includes(q) || c.sublabel?.toLowerCase().includes(q)),
      ].slice(0, 20);

  // Reset selection on query change
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const navigate = useCallback((item: SwitcherItem) => {
    if (item.type === "guild") {
      setActiveGuild(item.id);
      setUIGuild(item.id);
    } else {
      // Find which guild this channel belongs to
      const guildId = Object.entries(channels).find(([, chs]) =>
        chs.some(ch => ch.id === item.id)
      )?.[0];
      if (guildId) {
        setActiveGuild(guildId);
        setUIGuild(guildId);
      }
      setActiveChannel(item.id);
    }
    onClose();
  }, [channels, setActiveGuild, setUIGuild, setActiveChannel, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) navigate(filtered[selectedIndex]);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-[#1e2035] rounded-2xl border border-[#2e3150] shadow-2xl overflow-hidden animate-fadeIn">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#2e3150]">
          <Search size={18} className="text-[#8b8fad] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Where do you want to go?"
            className="flex-1 text-base text-[#dcdbf0] bg-transparent outline-none placeholder-[#5c6080]"
          />
          <kbd className="text-[10px] bg-[#252840] border border-[#2e3150] rounded px-1.5 py-0.5 text-[#8b8fad]">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto scroll-y">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-[#5c6080] text-sm">
              No results for "{query}"
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => navigate(item)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left border-b border-[#2e3150]/30",
                  i === selectedIndex ? "bg-[#5865f2]" : "hover:bg-[#252840]"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  i === selectedIndex ? "bg-white/20" : "bg-[#252840]"
                )}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-semibold truncate",
                    i === selectedIndex ? "text-white" : "text-[#dcdbf0]"
                  )}>
                    {item.type === "channel" ? "#" : ""}{item.label}
                  </p>
                  {item.sublabel && (
                    <p className={cn(
                      "text-xs truncate",
                      i === selectedIndex ? "text-white/70" : "text-[#8b8fad]"
                    )}>
                      {item.sublabel}
                    </p>
                  )}
                </div>
                <ArrowRight size={14} className={cn(
                  "flex-shrink-0",
                  i === selectedIndex ? "text-white/70" : "text-[#5c6080]"
                )} />
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-[#2e3150] flex items-center gap-4 text-[10px] text-[#5c6080]">
          <span><kbd className="bg-[#252840] border border-[#2e3150] rounded px-1 py-0.5">↑↓</kbd> Navigate</span>
          <span><kbd className="bg-[#252840] border border-[#2e3150] rounded px-1 py-0.5">Enter</kbd> Go</span>
          <span><kbd className="bg-[#252840] border border-[#2e3150] rounded px-1 py-0.5">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
