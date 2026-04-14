"use client";
import { useGuildStore } from "@/lib/store";
import { useUnreadStore } from "@/lib/unread";
import { ContextMenu, useContextMenu } from "@/components/ui/ContextMenu";
import Image from "next/image";
import { Plus, Compass, BellOff, LogOut, Settings, Copy, BookMarked } from "lucide-react";
import { cn } from "@/lib/utils";
import { guildsApi } from "@/lib/api";
import toast from "react-hot-toast";
import { useState } from "react";
import CreateServerModal from "@/components/modals/CreateServerModal";

export default function ServerList() {
  const { guilds, activeGuildId, setActiveGuild, removeGuild } = useGuildStore();
  const { getTotalMentions } = useUnreadStore();
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();
  const [showCreate, setShowCreate] = useState(false);

  const buildGuildMenu = (guild: any) => [
    {
      id: "mark-read", label: "Mark As Read",
      icon: <BookMarked size={14} />,
      onClick: () => toast("Marked all read", { icon: "✓" }),
    },
    {
      id: "copy-id", label: "Copy ID",
      icon: <Copy size={14} />,
      onClick: () => { navigator.clipboard.writeText(guild.id); toast.success("ID copied!"); },
    },
    {
      id: "mute", label: "Mute Server",
      icon: <BellOff size={14} />,
      divider: true,
      onClick: () => toast("Server muted", { icon: "🔕" }),
    },
    {
      id: "settings", label: "Server Settings",
      icon: <Settings size={14} />,
      onClick: () => {},
    },
    {
      id: "leave", label: "Leave Server",
      icon: <LogOut size={14} />,
      danger: true,
      divider: true,
      onClick: () => {
        guildsApi.leave(guild.id)
          .then(() => { removeGuild(guild.id); toast.success(`Left "${guild.name}"`); })
          .catch(() => toast.error("Failed to leave server"));
      },
    },
  ];

  return (
    <>
      <nav className="w-[72px] bg-[#111827] flex flex-col items-center py-3 gap-2 flex-shrink-0">
        {/* DMs / Home */}
        <button
          onClick={() => setActiveGuild(null)}
          className={cn(
            "relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-[#5865f2] flex items-center justify-center text-white font-bold text-lg transition-all duration-200 overflow-hidden",
            !activeGuildId && "rounded-[16px]"
          )}
          title="Direct Messages"
        >
          <Image src="/discord-logo.svg" alt="Home" width={28} height={28}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="hidden discord-logo-missing:flex">💬</span>
          {/* Active pill */}
          <GuildPill active={!activeGuildId} />
        </button>

        <Separator />

        {/* Guilds */}
        {guilds.map(guild => {
          const isActive = guild.id === activeGuildId;
          const mentions = getTotalMentions(guild.id);

          return (
            <div key={guild.id} className="relative">
              <button
                onContextMenu={e => openCtx(e, buildGuildMenu(guild))}
                onClick={() => setActiveGuild(guild.id)}
                title={guild.name}
                className={cn(
                  "relative w-12 h-12 rounded-[24px] hover:rounded-[16px] overflow-hidden transition-all duration-200 ring-0 hover:ring-2 ring-[#5865f2]",
                  isActive && "rounded-[16px] ring-2"
                )}
              >
                {guild.icon_url ? (
                  <Image src={guild.icon_url} alt={guild.name} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#2e3150] flex items-center justify-center text-[#dcdbf0] font-bold text-sm">
                    {guild.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                  </div>
                )}
                <GuildPill active={isActive} />
              </button>

              {/* Unread / mention badge */}
              {mentions > 0 && (
                <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#ed4245] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#111827] leading-none z-10">
                  {mentions > 9 ? "9+" : mentions}
                </span>
              )}
              {mentions === 0 && getTotalMentions(guild.id) === 0 && (
                /* Show small dot for guilds with unread but no mentions */
                <span className="absolute bottom-0 -right-1 w-2 h-2 rounded-full bg-[#dcdbf0] border-2 border-[#111827] hidden guild-unread:flex" />
              )}
            </div>
          );
        })}

        <Separator />

        {/* Add server */}
        <button
          onClick={() => setShowCreate(true)}
          title="Add a Server"
          className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-[#1e2035] hover:bg-[#57f287] flex items-center justify-center text-[#57f287] hover:text-[#1e2035] transition-all duration-200"
        >
          <Plus size={22} />
        </button>

        {/* Discover */}
        <button
          title="Explore Discoverable Servers"
          className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-[#1e2035] hover:bg-[#5865f2] flex items-center justify-center text-[#5865f2] hover:text-white transition-all duration-200"
        >
          <Compass size={22} />
        </button>
      </nav>

      {menu && <ContextMenu {...menu} onClose={closeCtx} />}
      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
    </>
  );
}

function GuildPill({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-9 bg-white rounded-r-full" />
  );
}

function Separator() {
  return <div className="w-8 h-[2px] bg-[#2e3150] rounded-full flex-shrink-0" />;
}
