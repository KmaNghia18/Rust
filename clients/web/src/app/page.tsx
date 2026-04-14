"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authApi, guildsApi } from "@/lib/api";
import { useAuthStore, useGuildStore } from "@/lib/store";
import { useGateway } from "@/lib/gateway";
import ServerList from "@/components/layout/ServerList";
import ChannelSidebar from "@/components/layout/ChannelSidebar";
import MemberList from "@/components/layout/MemberList";
import ChatArea from "@/components/chat/ChatArea";
import UserPanel from "@/components/layout/UserPanel";

export default function AppPage() {
  const router = useRouter();
  const { user, accessToken, setAuth } = useAuthStore();
  const { setGuilds } = useGuildStore();
  const { send } = useGateway();

  // Guard: redirect to login if unauthenticated
  useEffect(() => {
    if (!accessToken) router.replace("/login");
  }, [accessToken, router]);

  // Fetch current user
  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.getMe().then((r) => r.data),
    enabled: !!accessToken,
  });

  // Fetch guilds
  const { data: guildsData } = useQuery({
    queryKey: ["guilds"],
    queryFn: () => guildsApi.list().then((r) => r.data),
    enabled: !!accessToken,
    onSuccess: (data: any[]) => setGuilds(data),
  });

  if (!accessToken) return null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1c2e]">
      {/* Left: Guild/Server icons */}
      <ServerList />

      {/* Channel sidebar */}
      <ChannelSidebar />

      {/* Main content: messages */}
      <main className="flex-1 flex flex-col min-w-0">
        <ChatArea />
      </main>

      {/* Right: Member list */}
      <MemberList />

      {/* Absolute-positioned user panel at bottom-left */}
      <UserPanel />
    </div>
  );
}
