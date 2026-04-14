"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { useAuthStore, useGuildStore } from "@/lib/store";
import UserProfileCard from "@/components/user/UserProfileCard";
import { ContextMenu, useContextMenu } from "@/components/ui/ContextMenu";
import { Crown, ShieldCheck, UserMinus, Shield, MessageSquare } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props { guildId: string }

const STATUS_COLOR: Record<string, string> = {
  online: "#57f287", idle: "#fee75c", dnd: "#ed4245", offline: "#80848e",
};

const STATUS_ORDER: Record<string, number> = {
  online: 0, idle: 1, dnd: 2, offline: 3,
};

export default function MemberList({ guildId }: Props) {
  const { user: me } = useAuthStore();
  const [profileCard, setProfileCard] = useState<{ userId: string; x: number; y: number } | null>(null);
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();

  const { data: members = [] } = useQuery({
    queryKey: ["members", guildId],
    queryFn: () => guildsApi.getMembers(guildId).then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles", guildId],
    queryFn: () => guildsApi.getRoles(guildId).then(r => r.data),
  });

  // Group members: hoisted roles first, then online, then offline
  const hoistedRoles = roles
    .filter((r: any) => r.hoist && r.name !== "@everyone")
    .sort((a: any, b: any) => b.position - a.position);

  const membersWithRole = (roleId: string) =>
    members.filter((m: any) =>
      m.roles?.some((r: any) => r.id === roleId) &&
      m.online_status !== "offline"
    );

  const unroledOnline  = members.filter((m: any) =>
    m.online_status !== "offline" &&
    !hoistedRoles.some((r: any) => m.roles?.some((mr: any) => mr.id === r.id))
  );

  const offline = members.filter((m: any) => m.online_status === "offline");

  const buildMemberMenu = useCallback((member: any) => [
    {
      id: "profile", label: "View Profile",
      icon: <ShieldCheck size={14} />,
      onClick: () => {},
    },
    {
      id: "message", label: "Message",
      icon: <MessageSquare size={14} />,
      onClick: () => {},
    },
    {
      id: "mention", label: "Mention",
      icon: <span className="text-xs">@</span>,
      divider: true,
      onClick: () => {},
    },
    ...(member.user_id !== me?.id ? [
      {
        id: "kick", label: "Kick Member",
        icon: <UserMinus size={14} />,
        danger: true,
        divider: true,
        onClick: () => guildsApi.kickMember(guildId, member.user_id),
      },
      {
        id: "ban", label: "Ban Member",
        icon: <Shield size={14} />,
        danger: true,
        onClick: () => guildsApi.banMember(guildId, member.user_id),
      },
    ] : []),
  ], [guildId, me?.id]);

  const renderMember = (member: any) => (
    <button
      key={member.user_id}
      onContextMenu={e => openCtx(e, buildMemberMenu(member))}
      onClick={e => setProfileCard({ userId: member.user_id, x: e.clientX - 280, y: e.clientY })}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#252840] group transition-colors"
    >
      {/* Avatar + status dot */}
      <div className="relative w-8 h-8 flex-shrink-0">
        {member.avatar_url ? (
          <Image src={member.avatar_url} alt="" width={32} height={32}
            className="rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
            {member.username?.[0]?.toUpperCase()}
          </div>
        )}
        <span
          className="absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-[#1e2035]"
          style={{ background: STATUS_COLOR[member.online_status ?? "offline"] }}
        />
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1">
          {member.is_owner && <Crown size={10} className="text-[#fee75c] flex-shrink-0" />}
          <p
            className={cn(
              "text-sm font-medium truncate",
              member.online_status === "offline" ? "text-[#5c6080]" : "text-[#dcdbf0]"
            )}
            style={
              member.role_color
                ? { color: `#${member.role_color.toString(16).padStart(6, "0")}` }
                : undefined
            }
          >
            {member.nickname ?? member.username}
          </p>
        </div>
        {member.custom_status && (
          <p className="text-[10px] text-[#5c6080] truncate leading-tight">{member.custom_status}</p>
        )}
      </div>
    </button>
  );

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="mb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6080] px-2 py-1">
        {label}
      </p>
      {children}
    </div>
  );

  const totalOnline  = members.filter((m: any) => m.online_status !== "offline").length;
  const totalOffline = offline.length;

  return (
    <>
      <aside className="w-60 bg-[#1e2035] flex flex-col h-full border-l border-[#111827] flex-shrink-0">
        {/* Header */}
        <div className="h-12 flex items-center px-4 border-b border-[#111827] flex-shrink-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5c6080]">
            Members — {totalOnline} online
          </span>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto py-3 px-1 scroll-y">
          {/* Hoisted roles */}
          {hoistedRoles.map((role: any) => {
            const roleMembers = membersWithRole(role.id);
            if (roleMembers.length === 0) return null;
            return (
              <Section key={role.id} label={`${role.name} — ${roleMembers.length}`}>
                {roleMembers.map(renderMember)}
              </Section>
            );
          })}

          {/* Online (no hoisted role) */}
          {unroledOnline.length > 0 && (
            <Section label={`Online — ${unroledOnline.length}`}>
              {unroledOnline.map(renderMember)}
            </Section>
          )}

          {/* Offline */}
          {totalOffline > 0 && (
            <Section label={`Offline — ${totalOffline}`}>
              {offline.map(renderMember)}
            </Section>
          )}
        </div>
      </aside>

      {/* Profile popup */}
      {profileCard && (
        <UserProfileCard
          userId={profileCard.userId}
          position={{ x: profileCard.x, y: profileCard.y }}
          onClose={() => setProfileCard(null)}
          guildRoles={roles}
        />
      )}

      {menu && <ContextMenu {...menu} onClose={closeCtx} />}
    </>
  );
}
