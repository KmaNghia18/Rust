"use client";
import { useQuery } from "@tanstack/react-query";
import { guildsApi } from "@/lib/api";
import { useAuthStore, useGuildStore, useUIStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Users, CheckCircle2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useState } from "react";

export default function InvitePage({ params }: { params: { code: string } }) {
  const { code } = params;
  const { user } = useAuthStore();
  const { addGuild, setActiveGuild } = useGuildStore();
  const { setActiveGuild: setUI } = useUIStore();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const { data: invite, isLoading, error } = useQuery({
    queryKey: ["invite", code],
    queryFn: () => guildsApi.getInvite(code).then(r => r.data),
  });

  const handleJoin = async () => {
    if (!user) { router.push(`/login?redirect=/invite/${code}`); return; }
    setJoining(true);
    try {
      const { data: guild } = await guildsApi.joinViaInvite(code);
      addGuild(guild);
      setJoined(true);
      toast.success(`Joined "${guild.name}"!`);
      setTimeout(() => {
        setUI(guild.id);
        router.push("/");
      }, 1500);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "Invalid or expired invite");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center">
      <div className="w-full max-w-md p-6 text-center">
        {isLoading && (
          <div className="bg-[#1e2035] rounded-2xl border border-[#2e3150] p-8">
            <Loader2 size={40} className="text-[#5865f2] animate-spin mx-auto" />
            <p className="text-[#8b8fad] mt-4">Loading invite…</p>
          </div>
        )}

        {error && (
          <div className="bg-[#1e2035] rounded-2xl border border-[#ed4245]/30 p-8">
            <p className="text-5xl mb-4">💔</p>
            <h1 className="text-2xl font-bold text-[#dcdbf0] mb-2">Invalid Invite</h1>
            <p className="text-[#8b8fad]">This invite may have expired or already been used.</p>
            <button onClick={() => router.push("/")}
              className="mt-6 px-6 py-2.5 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-xl font-semibold transition-colors">
              Go Home
            </button>
          </div>
        )}

        {invite && !error && (
          <div className="bg-[#1e2035] rounded-2xl border border-[#2e3150] p-8 animate-fadeIn">
            <p className="text-sm text-[#8b8fad] mb-6">
              <strong className="text-[#dcdbf0]">{invite.inviter?.username ?? "Someone"}</strong> invited you to join
            </p>

            {/* Server info */}
            <div className="flex flex-col items-center mb-6">
              {invite.guild.icon_url ? (
                <Image src={invite.guild.icon_url} alt="" width={80} height={80}
                  className="rounded-2xl mb-4 ring-4 ring-[#5865f2]/30" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-[#5865f2] flex items-center justify-center text-3xl font-bold text-white mb-4 ring-4 ring-[#5865f2]/30">
                  {invite.guild.name.split(" ").slice(0,2).map((w: string) => w[0]).join("")}
                </div>
              )}
              <h1 className="text-2xl font-black text-[#dcdbf0] mb-1">{invite.guild.name}</h1>
              {invite.guild.description && (
                <p className="text-sm text-[#8b8fad] max-w-xs">{invite.guild.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#57f287]" />
                  <span className="text-sm text-[#8b8fad]">{invite.online_count?.toLocaleString() ?? "?"} Online</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4e5058]" />
                  <span className="text-sm text-[#8b8fad]">{invite.member_count?.toLocaleString() ?? "?"} Members</span>
                </div>
              </div>
            </div>

            {/* Channel preview */}
            {invite.channel && (
              <div className="bg-[#252840] rounded-xl border border-[#2e3150] px-4 py-3 mb-6 flex items-center gap-2">
                <span className="text-[#8b8fad]">#</span>
                <span className="text-sm text-[#dcdbf0]">{invite.channel.name}</span>
                <span className="text-xs text-[#5c6080] ml-auto">Invite channel</span>
              </div>
            )}

            {/* CTA */}
            {joined ? (
              <div className="flex items-center justify-center gap-2 text-[#57f287]">
                <CheckCircle2 size={20} />
                <span className="font-semibold">Joined! Redirecting…</span>
              </div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full py-3 rounded-xl bg-[#57f287] hover:bg-[#47d274] text-black font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
              >
                {joining ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
                Accept Invite
              </button>
            )}

            {!user && (
              <p className="text-xs text-[#5c6080] mt-3">
                You'll need to log in or create an account to join.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
