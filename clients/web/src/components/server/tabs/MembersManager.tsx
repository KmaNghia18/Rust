"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { Search, Shield, Crown, UserMinus, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function MembersManager({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members-manage", guildId],
    queryFn: () => guildsApi.getMembers(guildId).then(r => r.data),
  });

  const kick = useMutation({
    mutationFn: (userId: string) => guildsApi.kickMember(guildId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members-manage", guildId] }); toast.success("Member kicked"); },
    onError: () => toast.error("Failed to kick"),
  });

  const ban = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) => guildsApi.banMember(guildId, userId, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members-manage", guildId] }); toast.success("Member banned"); },
    onError: () => toast.error("Failed to ban"),
  });

  const filtered = members.filter((m: any) =>
    m.username?.toLowerCase().includes(search.toLowerCase()) ||
    m.nickname?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Search */}
      <div className="flex items-center gap-2 bg-[#1e2035] rounded-lg px-3 py-2 mb-4 border border-[#2e3150] focus-within:border-[#5865f2] transition-colors">
        <Search size={16} className="text-[#8b8fad]" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${members.length} members`}
          className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#1e2035]">
              <div className="skeleton w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2"><div className="skeleton h-3 w-32 rounded" /><div className="skeleton h-2 w-20 rounded" /></div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {filtered.map((member: any) => (
          <div key={member.user_id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#1e2035] group transition-colors"
          >
            {/* Avatar */}
            <div className="relative w-10 h-10 flex-shrink-0">
              {member.avatar_url ? (
                <Image src={member.avatar_url} alt="" width={40} height={40} className="rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center font-bold text-white">
                  {member.username?.[0]?.toUpperCase()}
                </div>
              )}
              {member.is_owner && (
                <Crown size={12} className="absolute -top-1 -right-1 text-[#fee75c]" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#dcdbf0] truncate">
                  {member.nickname ?? member.username}
                </span>
                {member.nickname && (
                  <span className="text-xs text-[#8b8fad] truncate">({member.username})</span>
                )}
                {member.is_owner && (
                  <span className="text-[10px] bg-[#fee75c]/20 text-[#fee75c] border border-[#fee75c]/30 rounded px-1.5 py-0.5">Owner</span>
                )}
              </div>
              <p className="text-xs text-[#5c6080]">
                Joined {format(new Date(member.joined_at), "MMM d, yyyy")}
              </p>
              {member.roles?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {member.roles.slice(0, 4).map((role: any) => (
                    <span key={role.id} className="text-[10px] rounded px-1.5 py-0.5 border border-[#2e3150] bg-[#1e2035]"
                      style={{ color: role.color ? `#${role.color.toString(16).padStart(6,"0")}` : "#8b8fad" }}>
                      {role.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions (hover) */}
            {!member.is_owner && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ActionBtn icon={<UserMinus size={14} />} label="Kick" color="#fee75c"
                  onClick={() => kick.mutate(member.user_id)} />
                <ActionBtn icon={<Shield size={14} />} label="Ban" color="#ed4245"
                  onClick={() => {
                    const reason = prompt("Ban reason (optional):");
                    ban.mutate({ userId: member.user_id, reason: reason ?? "" });
                  }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, color, onClick }: any) {
  return (
    <button title={label} onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#252840] hover:bg-[#2e3150] transition-colors"
      style={{ color }}>
      {icon}
    </button>
  );
}
