"use client";
import { useQuery } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { useUIStore } from "@/lib/store";
import Image from "next/image";
import { Crown, Shield } from "lucide-react";

export default function MemberList() {
  const { activeGuildId, memberListOpen } = useUIStore();

  const { data: members = [] } = useQuery({
    queryKey: ["members", activeGuildId],
    queryFn: () =>
      guildsApi.getMembers(activeGuildId!).then((r) => r.data),
    enabled: !!activeGuildId,
  });

  if (!memberListOpen || !activeGuildId) return null;

  const online  = members.filter((m: any) => m.status !== "offline");
  const offline = members.filter((m: any) => m.status === "offline");

  return (
    <aside className="w-60 bg-[#1a1c2e] flex-shrink-0 scroll-y border-l border-[#111827]">
      <div className="px-3 pt-4">
        {online.length > 0 && (
          <MemberGroup label={`Online — ${online.length}`} members={online} />
        )}
        {offline.length > 0 && (
          <MemberGroup label={`Offline — ${offline.length}`} members={offline} />
        )}
      </div>
    </aside>
  );
}

function MemberGroup({ label, members }: { label: string; members: any[] }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#5c6080] px-2 mb-1">{label}</p>
      <ul className="space-y-[2px]">
        {members.map((m: any) => (
          <li key={m.user_id}>
            <div className="flex items-center gap-2 px-2 py-[6px] rounded-[4px] hover:bg-[#2e3150] cursor-pointer group transition-colors">
              <div className="relative w-8 h-8 flex-shrink-0">
                {m.user?.avatar_url ? (
                  <Image src={m.user.avatar_url} alt="" width={32} height={32} className="rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
                    {(m.user?.username ?? "?")[0].toUpperCase()}
                  </div>
                )}
                <span className={`absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-[#1a1c2e] status-${m.status ?? "offline"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#dcdbf0] truncate flex items-center gap-1">
                  {m.nickname ?? m.user?.username ?? "Unknown"}
                  {m.is_owner && <Crown size={12} className="text-[#fee75c]" />}
                  {m.server_mute && <span className="text-[10px] text-[#ed4245]">🔇</span>}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
