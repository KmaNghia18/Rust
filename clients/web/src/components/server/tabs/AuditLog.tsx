"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { Scroll, Search, Filter } from "lucide-react";
import { format } from "date-fns";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Action type → label + color
const ACTION_META: Record<number, { label: string; color: string }> = {
  1:  { label: "Server Updated",     color: "#5865f2" },
  10: { label: "Channel Created",    color: "#57f287" },
  11: { label: "Channel Updated",    color: "#fee75c" },
  12: { label: "Channel Deleted",    color: "#ed4245" },
  20: { label: "Member Kicked",      color: "#ed4245" },
  22: { label: "Member Banned",      color: "#ed4245" },
  23: { label: "Member Unbanned",    color: "#57f287" },
  24: { label: "Member Updated",     color: "#fee75c" },
  25: { label: "Member Role Updated",color: "#5865f2" },
  30: { label: "Role Created",       color: "#57f287" },
  31: { label: "Role Updated",       color: "#fee75c" },
  32: { label: "Role Deleted",       color: "#ed4245" },
  40: { label: "Invite Created",     color: "#57f287" },
  42: { label: "Invite Deleted",     color: "#ed4245" },
  72: { label: "Message Deleted",    color: "#ed4245" },
  73: { label: "Messages Bulk Deleted", color: "#ed4245" },
  74: { label: "Message Pinned",     color: "#5865f2" },
  75: { label: "Message Unpinned",   color: "#fee75c" },
  80: { label: "Webhook Created",    color: "#57f287" },
  81: { label: "Webhook Updated",    color: "#fee75c" },
  82: { label: "Webhook Deleted",    color: "#ed4245" },
};

const ACTION_TYPES = [
  { value: "", label: "All Actions" },
  { value: "20", label: "Kicks" },
  { value: "22", label: "Bans" },
  { value: "72", label: "Message Deletes" },
  { value: "10", label: "Channel Creates" },
  { value: "30", label: "Role Creates" },
];

export default function AuditLog({ guildId }: { guildId: string }) {
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["audit-log", guildId, actionType],
    queryFn: () => guildsApi.getAuditLog(guildId, {
      action_type: actionType || undefined,
      limit: 100,
    }).then(r => r.data),
  });

  const filtered = data.filter((entry: any) =>
    !search ||
    entry.user?.username?.toLowerCase().includes(search.toLowerCase()) ||
    entry.target?.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-[#1e2035] border border-[#2e3150] focus-within:border-[#5865f2] rounded-lg px-3 py-2 transition-colors">
          <Search size={14} className="text-[#8b8fad]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by user"
            className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]" />
        </div>
        <select value={actionType} onChange={e => setActionType(e.target.value)}
          className="bg-[#1e2035] border border-[#2e3150] rounded-lg px-3 py-2 text-sm text-[#dcdbf0] outline-none focus:border-[#5865f2]">
          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <Scroll size={48} className="text-[#2e3150] mb-3" />
          <p className="text-sm text-[#5c6080]">No audit log entries found</p>
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.map((entry: any) => {
          const meta = ACTION_META[entry.action_type] ?? { label: `Action ${entry.action_type}`, color: "#8b8fad" };
          return (
            <div key={entry.id}
              className="flex items-start gap-3 bg-[#1e2035] rounded-xl px-4 py-3 border border-[#2e3150]">
              {/* Executor avatar */}
              <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden">
                {entry.user?.avatar_url ? (
                  <Image src={entry.user.avatar_url} alt="" width={36} height={36} className="object-cover" />
                ) : (
                  <div className="w-9 h-9 bg-[#5865f2] flex items-center justify-center text-sm font-bold text-white">
                    {entry.user?.username?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#dcdbf0]">{entry.user?.username ?? "Unknown"}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${meta.color}20`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  {entry.target?.username && (
                    <span className="text-sm text-[#8b8fad]">→ <strong className="text-[#dcdbf0]">{entry.target.username}</strong></span>
                  )}
                </div>
                {entry.reason && (
                  <p className="text-xs text-[#8b8fad] mt-1">Reason: {entry.reason}</p>
                )}
                {entry.changes?.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {entry.changes.slice(0, 3).map((change: any, i: number) => (
                      <p key={i} className="text-xs text-[#5c6080]">
                        <span className="text-[#8b8fad]">{change.key}</span>:{" "}
                        <span className="line-through opacity-60">{String(change.old_value).slice(0, 30)}</span>
                        {" → "}
                        <span className="text-[#dcdbf0]">{String(change.new_value).slice(0, 30)}</span>
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-[#5c6080] mt-1">
                  {entry.created_at ? format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a") : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
