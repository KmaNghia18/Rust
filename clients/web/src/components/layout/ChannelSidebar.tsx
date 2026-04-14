"use client";
import { useQuery } from "@tanstack/react-query";
import { channelsApi } from "@/lib/api";
import { useUIStore, useChannelStore, useVoiceStore } from "@/lib/store";
import { Hash, Volume2, ChevronDown, Plus, Settings, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import UserPanel from "./UserPanel";

export default function ChannelSidebar() {
  const { activeGuildId, activeChannelId, setActiveChannel } = useUIStore();
  const { channels, setChannels } = useChannelStore();
  const { currentChannelId } = useVoiceStore();

  const { data: guild } = useQuery({
    queryKey: ["guild", activeGuildId],
    queryFn: () =>
      import("@/lib/api").then((m) => m.guildsApi.get(activeGuildId!).then((r) => r.data)),
    enabled: !!activeGuildId,
  });

  useQuery({
    queryKey: ["channels", activeGuildId],
    queryFn: () =>
      channelsApi.list(activeGuildId!).then((r) => {
        setChannels(activeGuildId!, r.data);
        return r.data;
      }),
    enabled: !!activeGuildId,
  });

  const guildChannels = channels[activeGuildId ?? ""] ?? [];

  // Group by category
  const categories = guildChannels.filter((c) => c.type === 4);
  const ungrouped = guildChannels.filter((c) => c.type !== 4 && !c.parent_id);

  function renderChannel(ch: any) {
    const isText = ch.type === 0;
    const isVoice = ch.type === 2;
    const active = ch.id === activeChannelId;
    const inVoice = ch.id === currentChannelId;

    return (
      <button
        key={ch.id}
        onClick={() => isText && setActiveChannel(ch.id)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-[6px] rounded-[4px] text-sm group",
          "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150] transition-colors",
          active && "bg-[#2e3150] text-[#dcdbf0]",
          inVoice && "text-[#57f287]"
        )}
      >
        {isText ? (
          <Hash size={16} className="flex-shrink-0" />
        ) : (
          <Volume2 size={16} className="flex-shrink-0" />
        )}
        <span className="flex-1 truncate text-left">{ch.name}</span>
        {ch.nsfw && <Lock size={12} className="text-[#ed4245]" />}
        <Plus
          size={14}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
        />
      </button>
    );
  }

  return (
    <aside className="w-60 bg-[#1a1c2e] flex flex-col flex-shrink-0">
      {/* Guild header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#111827] shadow-sm cursor-pointer hover:bg-[#1e2035] transition-colors">
        <span className="font-semibold text-[#dcdbf0] truncate">
          {guild?.name ?? "Direct Messages"}
        </span>
        <ChevronDown size={16} className="text-[#8b8fad]" />
      </div>

      {/* Channel list */}
      <div className="flex-1 scroll-y px-2 py-2 space-y-[2px]">
        {/* Ungrouped channels */}
        {ungrouped.map(renderChannel)}

        {/* Categories + their channels */}
        {categories.map((cat) => {
          const children = guildChannels.filter((c) => c.parent_id === cat.id);
          return (
            <div key={cat.id} className="mt-4">
              <div className="flex items-center gap-1 px-1 mb-1 cursor-pointer group">
                <ChevronDown size={12} className="text-[#5c6080]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#5c6080] group-hover:text-[#8b8fad] transition-colors">
                  {cat.name}
                </span>
                <Plus size={14} className="ml-auto text-[#5c6080] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {children.map(renderChannel)}
            </div>
          );
        })}
      </div>

      {/* User panel */}
      <UserPanel />
    </aside>
  );
}
