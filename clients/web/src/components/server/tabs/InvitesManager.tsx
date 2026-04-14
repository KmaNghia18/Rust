"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { Link, Copy, Trash2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

export default function InvitesManager({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const { data: invites = [] } = useQuery({
    queryKey: ["invites", guildId],
    queryFn: () => guildsApi.getInvites(guildId).then(r => r.data),
  });
  const revoke = useMutation({
    mutationFn: (code: string) => guildsApi.revokeInvite(code),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invites", guildId] }); toast.success("Invite revoked"); },
  });
  return (
    <div>
      <p className="text-xs text-[#8b8fad] mb-4">{invites.length} active invite{invites.length !== 1 ? "s" : ""}</p>
      <div className="bg-[#1e2035] rounded-xl overflow-hidden border border-[#2e3150]">
        <table className="w-full text-sm">
          <thead className="border-b border-[#2e3150]"><tr>
            {["Code","Inviter","Uses","Expires",""].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[#8b8fad]">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-[#2e3150]">
            {invites.map((inv: any) => (
              <tr key={inv.code} className="hover:bg-[#252840] transition-colors">
                <td className="px-4 py-3 font-mono text-[#5865f2] text-sm">{inv.code}</td>
                <td className="px-4 py-3 text-[#dcdbf0]">{inv.inviter?.username ?? "—"}</td>
                <td className="px-4 py-3 text-[#8b8fad]">{inv.uses}{inv.max_uses > 0 ? `/${inv.max_uses}` : ""}</td>
                <td className="px-4 py-3 text-[#8b8fad] text-xs">{inv.expires_at ? formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true }) : "Never"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => { navigator.clipboard.writeText(`https://discord-clone.dev/${inv.code}`); toast.success("Copied!"); }}
                      className="p-1.5 text-[#8b8fad] hover:text-[#dcdbf0]"><Copy size={14} /></button>
                    <button onClick={() => revoke.mutate(inv.code)}
                      className="p-1.5 text-[#8b8fad] hover:text-[#ed4245]"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invites.length === 0 && <p className="text-center text-[#5c6080] py-8 text-sm">No active invites</p>}
      </div>
    </div>
  );
}
