"use client";
import { useQuery } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { useGuildStore, useUIStore } from "@/lib/store";
import { Plus, Compass, MessageSquare } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export default function ServerList() {
  const { guilds } = useGuildStore();
  const { activeGuildId, setActiveGuild } = useUIStore();

  return (
    <nav className="w-[72px] bg-[#111827] flex flex-col items-center py-3 gap-2 flex-shrink-0 scroll-y">
      {/* DMs */}
      <button
        onClick={() => setActiveGuild(null)}
        className={cn(
          "server-icon group",
          activeGuildId === null && "active"
        )}
        title="Direct Messages"
      >
        <MessageSquare size={24} />
        <Pill active={activeGuildId === null} />
      </button>

      <Separator />

      {/* Guild list */}
      {guilds.map((guild) => (
        <button
          key={guild.id}
          onClick={() => setActiveGuild(guild.id)}
          className={cn("server-icon group relative", activeGuildId === guild.id && "active")}
          title={guild.name}
        >
          {guild.icon_url ? (
            <Image
              src={guild.icon_url}
              alt={guild.name}
              width={48}
              height={48}
              className="rounded-[50%] group-hover:rounded-[16px] transition-all duration-200 object-cover"
            />
          ) : (
            <span className="text-sm font-bold">
              {guild.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <Pill active={activeGuildId === guild.id} />
        </button>
      ))}

      <Separator />

      {/* Add server */}
      <button
        className="server-icon text-[#57f287] hover:bg-[#57f287] hover:text-white"
        title="Add a Server"
      >
        <Plus size={24} />
      </button>

      {/* Discover */}
      <button
        className="server-icon text-[#5865f2] hover:bg-[#5865f2] hover:text-white"
        title="Explore Public Servers"
      >
        <Compass size={24} />
      </button>

      <style jsx>{`
        .server-icon {
          width: 48px; height: 48px;
          border-radius: 50%;
          background: #1e2035;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: none;
          color: #dcdbf0;
          transition: border-radius 0.2s, background 0.2s, color 0.2s;
          position: relative; flex-shrink: 0;
        }
        .server-icon:hover, .server-icon.active {
          border-radius: 16px;
          background: #5865f2;
          color: white;
        }
      `}</style>
    </nav>
  );
}

function Pill({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[36px] w-[4px] h-[32px] bg-white rounded-r-full" />
  );
}

function Separator() {
  return <div className="w-8 h-[2px] bg-[#2e3150] rounded-full mx-auto" />;
}
