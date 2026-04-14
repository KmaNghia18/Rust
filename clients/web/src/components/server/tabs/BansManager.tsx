"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { guildsApi } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { UserCheck, Search } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { useState } from "react";

export default function BansManager({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: bans = [] } = useQuery({
    queryKey: ["bans", guildId],
    queryFn: () => guildsApi.getBans(guildId).then(r => r.data),
  });
  const unban = useMutation({
    mutationFn: (userId: string) => guildsApi.unbanMember(guildId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bans", guildId] }); toast.success("Member unbanned"); },
  });
  const filtered = bans.filter((b: any) => b.username?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div className="flex items-center gap-2 bg-[#1e2035] rounded-lg px-3 py-2 mb-4 border border-[#2e3150]">
        <Search size={14} className="text-[#8b8fad]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bans"
          className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]" />
      </div>
      {filtered.length === 0 && <p className="text-center text-[#5c6080] py-12 text-sm">No bans found</p>}
      <div className="space-y-2">
        {filtered.map((ban: any) => (
          <div key={ban.user_id} className="flex items-center gap-3 bg-[#1e2035] rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-sm font-bold">
              {ban.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1"><p className="text-sm text-[#dcdbf0] font-medium">{ban.username}</p>
              {ban.reason && <p className="text-xs text-[#8b8fad]">Reason: {ban.reason}</p>}</div>
            <button onClick={() => unban.mutate(ban.user_id)}
              className="flex items-center gap-1 text-xs text-[#57f287] hover:bg-[#57f287]/10 px-3 py-1.5 rounded-lg border border-[#57f287]/30 transition-colors">
              <UserCheck size={12} /> Unban
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
