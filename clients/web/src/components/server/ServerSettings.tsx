"use client";
import { useState } from "react";
import { useGuildStore } from "@/lib/store";
import { X, ChevronRight, Settings, Users, Hash, ShieldCheck, Link, Mail, BookOpen, Scroll } from "lucide-react";
import { cn } from "@/lib/utils";
import GuildOverview from "./tabs/GuildOverview";
import RolesEditor from "./tabs/RolesEditor";
import MembersManager from "./tabs/MembersManager";
import InvitesManager from "./tabs/InvitesManager";
import BansManager from "./tabs/BansManager";

interface Props { guildId: string; onClose: () => void }

const SECTIONS = [
  { id: "overview",  label: "Overview",  icon: Settings,     group: "GUILD SETTINGS" },
  { id: "roles",     label: "Roles",     icon: ShieldCheck,  group: "GUILD SETTINGS" },
  { id: "emoji",     label: "Emoji",     icon: BookOpen,      group: "GUILD SETTINGS" },
  { id: "members",   label: "Members",   icon: Users,         group: "USER MANAGEMENT" },
  { id: "invites",   label: "Invites",   icon: Link,          group: "USER MANAGEMENT" },
  { id: "bans",      label: "Bans",      icon: Mail,          group: "USER MANAGEMENT" },
  { id: "audit",     label: "Audit Log", icon: Scroll,        group: "USER MANAGEMENT" },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

export default function ServerSettings({ guildId, onClose }: Props) {
  const [tab, setTab] = useState<SectionId>("overview");
  const { guilds } = useGuildStore();
  const guild = guilds.find(g => g.id === guildId);

  const groups = [...new Set(SECTIONS.map(s => s.group))];

  function renderTab() {
    switch (tab) {
      case "overview": return <GuildOverview guildId={guildId} />;
      case "roles":    return <RolesEditor guildId={guildId} />;
      case "members":  return <MembersManager guildId={guildId} />;
      case "invites":  return <InvitesManager guildId={guildId} />;
      case "bans":     return <BansManager guildId={guildId} />;
      default:         return <div className="text-[#8b8fad] p-4">Coming soon…</div>;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Sidebar */}
      <aside className="w-[220px] bg-[#1e2035] flex-shrink-0 py-16 px-3 flex flex-col gap-1 border-r border-[#111827]">
        <div className="px-2 mb-2">
          <p className="text-xs font-bold text-[#dcdbf0] truncate">{guild?.name}</p>
        </div>
        {groups.map(group => (
          <div key={group} className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6080] px-2 mb-1">{group}</p>
            {SECTIONS.filter(s => s.group === group).map(s => (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-[7px] rounded-[4px] text-sm transition-colors text-left",
                  tab === s.id ? "bg-[#2e3150] text-[#dcdbf0]" : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
                )}
              >
                <s.icon size={16} />
                {s.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* Content */}
      <main className="flex-1 bg-[#252840] overflow-y-auto">
        <div className="max-w-[740px] mx-auto py-16 px-10">
          <h2 className="text-xl font-bold text-[#dcdbf0] mb-6">
            {SECTIONS.find(s => s.id === tab)?.label}
          </h2>
          {renderTab()}
        </div>
      </main>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#2e3150] text-[#8b8fad] hover:text-[#dcdbf0] transition-colors z-10"
      >
        <X size={16} />
      </button>
    </div>
  );
}
