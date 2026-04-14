"use client";
import { useAuthStore, useVoiceStore } from "@/lib/store";
import { Mic, MicOff, Headphones, HeadphonesOff, Settings, Video, VideoOff } from "lucide-react";
import Image from "next/image";

export default function UserPanel() {
  const { user } = useAuthStore();
  const { selfMute, selfDeaf, selfVideo, toggleMute, toggleDeaf, toggleVideo } = useVoiceStore();

  if (!user) return null;

  return (
    <div className="h-[52px] bg-[#111827] flex items-center px-2 gap-2 flex-shrink-0">
      {/* Avatar + name */}
      <div className="flex items-center gap-2 flex-1 min-w-0 rounded-[4px] hover:bg-[#1e2035] p-1 transition-colors cursor-pointer">
        <div className="relative w-8 h-8 flex-shrink-0">
          {user.avatar_url ? (
            <Image src={user.avatar_url} alt={user.username} width={32} height={32} className="rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
              {user.username[0].toUpperCase()}
            </div>
          )}
          <span className={`absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-[#111827] status-${user.status}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#dcdbf0] truncate">{user.username}</p>
          <p className="text-xs text-[#8b8fad] truncate">
            {user.custom_status || `#${user.discriminator}`}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-[2px]">
        <IconBtn
          active={!selfMute}
          onClick={toggleMute}
          title={selfMute ? "Unmute" : "Mute"}
        >
          {selfMute ? <MicOff size={16} className="text-[#ed4245]" /> : <Mic size={16} />}
        </IconBtn>
        <IconBtn
          active={!selfDeaf}
          onClick={toggleDeaf}
          title={selfDeaf ? "Undeafen" : "Deafen"}
        >
          {selfDeaf ? <HeadphonesOff size={16} className="text-[#ed4245]" /> : <Headphones size={16} />}
        </IconBtn>
        <IconBtn onClick={() => {}} title="User Settings">
          <Settings size={16} />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, active = true }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-[4px] text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#1e2035] transition-colors"
    >
      {children}
    </button>
  );
}
