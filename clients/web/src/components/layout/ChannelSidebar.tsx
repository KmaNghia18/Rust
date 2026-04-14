"use client";
import { useGuildStore, useChannelStore, useUIStore } from "@/lib/store";
import { useUnreadStore } from "@/lib/unread";
import { ContextMenu, useContextMenu } from "@/components/ui/ContextMenu";
import {
  Hash, Volume2, Lock, Plus, Settings, ChevronDown, ChevronRight,
  Speaker, Megaphone, BookOpen, MessageSquare, Bell, BellOff, Trash2
} from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { channelsApi } from "@/lib/api";
import toast from "react-hot-toast";

const ChannelTypeIcon = ({ type, locked }: { type: number; locked?: boolean }) => {
  const icons: Record<number, React.ReactNode> = {
    0: <Hash size={16} />,
    2: <Volume2 size={16} />,
    5: <Megaphone size={16} />,
    6: <BookOpen size={16} />,
  };
  return (
    <span className="text-[#8b8fad] flex-shrink-0 flex items-center gap-0.5">
      {icons[type] ?? <Hash size={16} />}
      {locked && <Lock size={10} className="text-[#8b8fad] opacity-70" />}
    </span>
  );
};

export default function ChannelSidebar() {
  const { guilds, activeGuildId } = useGuildStore();
  const { channels, activeChannelId, setActiveChannel } = useChannelStore();
  const { openSettings } = useUIStore();
  const { getChannelUnread, hasUnread, markRead } = useUnreadStore();
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();

  const guild = guilds.find(g => g.id === activeGuildId);
  const guildChannels = channels[activeGuildId ?? ""] ?? [];

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (id: string) => {
    setCollapsedCategories(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Organise: categories first, then orphan channels
  const categories = guildChannels.filter(c => c.type === 4);
  const orphans    = guildChannels.filter(c => !c.parent_id && c.type !== 4);

  const childrenOf = (catId: string) =>
    guildChannels.filter(c => c.parent_id === catId).sort((a, b) => a.position - b.position);

  const handleSelectChannel = (channelId: string) => {
    setActiveChannel(channelId);
    markRead(channelId, activeGuildId ?? undefined);
  };

  const buildChannelMenu = useCallback((channel: any) => [
    {
      id: "copy", label: "Copy Channel ID",
      icon: <Hash size={14} />,
      onClick: () => { navigator.clipboard.writeText(channel.id); toast.success("ID copied!"); },
    },
    {
      id: "mark-read", label: "Mark As Read",
      icon: <Bell size={14} />,
      onClick: () => markRead(channel.id, activeGuildId ?? undefined),
    },
    {
      id: "notifs", label: "Notification Settings",
      icon: <BellOff size={14} />,
      divider: true,
      onClick: () => {},
    },
    {
      id: "edit", label: "Edit Channel",
      icon: <Settings size={14} />,
      onClick: () => {},
    },
    {
      id: "delete", label: "Delete Channel",
      icon: <Trash2 size={14} />,
      danger: true,
      divider: true,
      onClick: () => {
        channelsApi.delete(channel.id)
          .then(() => toast.success("Channel deleted"))
          .catch(() => toast.error("Failed"));
      },
    },
  ], [activeGuildId, markRead]);

  const renderChannel = (ch: any) => {
    const unread = getChannelUnread(ch.id);
    const isActive = ch.id === activeChannelId;
    const isVoice = ch.type === 2;

    return (
      <button
        key={ch.id}
        onContextMenu={e => openCtx(e, buildChannelMenu(ch))}
        onClick={() => !isVoice && handleSelectChannel(ch.id)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-[5px] rounded-[4px] group transition-colors text-left",
          isActive
            ? "bg-[#2e3150] text-[#dcdbf0]"
            : unread.count > 0
            ? "text-[#dcdbf0] hover:bg-[#1e2035] font-semibold"
            : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#1e2035]"
        )}
      >
        <ChannelTypeIcon type={ch.type} />

        <span className={cn("flex-1 truncate text-sm", unread.count > 0 && "font-semibold")}>
          {ch.name}
        </span>

        {/* Unread badge (mention count) */}
        {unread.mentionCount > 0 && (
          <span className="w-4 h-4 flex items-center justify-center rounded-full bg-[#ed4245] text-white text-[10px] font-bold leading-none flex-shrink-0">
            {unread.mentionCount > 9 ? "9+" : unread.mentionCount}
          </span>
        )}
        {unread.count > 0 && unread.mentionCount === 0 && (
          <span className="w-2 h-2 rounded-full bg-[#dcdbf0] flex-shrink-0" />
        )}

        {/* Hover actions */}
        {!isVoice && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity ml-auto">
            <span className="p-0.5 hover:text-[#dcdbf0] rounded" title="Create Invite">
              <Plus size={14} />
            </span>
            <span className="p-0.5 hover:text-[#dcdbf0] rounded" title="Settings">
              <Settings size={14} />
            </span>
          </div>
        )}
      </button>
    );
  };

  return (
    <aside className="w-60 bg-[#1e2035] flex flex-col">
      {/* Guild header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#111827] flex-shrink-0 cursor-pointer hover:bg-[#252840] transition-colors">
        <span className="font-bold text-[#dcdbf0] truncate">{guild?.name ?? "Loading…"}</span>
        <ChevronDown size={16} className="text-[#8b8fad] flex-shrink-0" />
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-3 space-y-0.5 scroll-y px-2">
        {/* Orphan channels (not in any category) */}
        {orphans.sort((a, b) => a.position - b.position).map(renderChannel)}

        {/* Categories + children */}
        {categories.sort((a, b) => a.position - b.position).map(cat => {
          const children = childrenOf(cat.id);
          const collapsed = collapsedCategories.has(cat.id);
          // Show category if not collapsed OR has unread children
          const catHasUnread = children.some(c => hasUnread(c.id));

          return (
            <div key={cat.id}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center gap-1 px-1 py-[3px] text-[#8b8fad] hover:text-[#dcdbf0] transition-colors group"
              >
                {collapsed
                  ? <ChevronRight size={12} className="flex-shrink-0" />
                  : <ChevronDown size={12} className="flex-shrink-0" />
                }
                <span className="text-xs font-bold uppercase tracking-wider flex-1 text-left truncate">
                  {cat.name}
                </span>
                {catHasUnread && collapsed && (
                  <span className="w-2 h-2 rounded-full bg-[#dcdbf0]" />
                )}
                <Plus size={14} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>

              {/* Children */}
              {!collapsed && (
                <div className="space-y-0.5">
                  {children.map(renderChannel)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User panel bottom */}
      <div className="h-[52px] flex-shrink-0 bg-[#111827] flex items-center px-2 gap-2">
        {/* UserPanel is rendered separately — slot here */}
      </div>

      {menu && <ContextMenu {...menu} onClose={closeCtx} />}
    </aside>
  );
}
