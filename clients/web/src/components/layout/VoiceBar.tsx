"use client";
import { useVoiceStore, useChannelStore, useUIStore } from "@/lib/store";
import { Mic, MicOff, HeadphoneOff, Headphones, PhoneOff, Video, Monitor, Signal } from "lucide-react";
import { cn } from "@/lib/utils";

export default function VoiceBar() {
  const { connected, channelId, selfMute, selfDeaf, selfVideo,
          toggleMute, toggleDeaf, toggleVideo, leaveVoice } = useVoiceStore();
  const { channels } = useChannelStore();
  const { activeGuildId } = useUIStore();

  if (!connected || !channelId) return null;

  const channel = (channels[activeGuildId ?? ""] ?? []).find(c => c.id === channelId);

  return (
    <div className="bg-[#0d0e1a] border-t border-[#1e2035] px-3 py-2.5">
      {/* Connection status */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex items-center gap-1.5">
          <Signal size={14} className="text-[#57f287]" />
          <span className="text-xs font-semibold text-[#57f287]">Voice Connected</span>
        </div>
        <span className="text-[10px] text-[#5c6080] ml-auto">
          {channel?.name ? `🔊 ${channel.name}` : "Voice Channel"}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <VoiceBtn
          active={!selfMute}
          icon={selfMute ? <MicOff size={14} /> : <Mic size={14} />}
          label={selfMute ? "Unmute" : "Mute"}
          onClick={toggleMute}
          danger={selfMute}
        />
        <VoiceBtn
          active={!selfDeaf}
          icon={selfDeaf ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
          label={selfDeaf ? "Undeafen" : "Deafen"}
          onClick={toggleDeaf}
          danger={selfDeaf}
        />
        <VoiceBtn
          active={selfVideo}
          icon={<Video size={14} />}
          label={selfVideo ? "Stop Video" : "Start Video"}
          onClick={toggleVideo}
        />
        <VoiceBtn
          active={false}
          icon={<Monitor size={14} />}
          label="Share Screen"
          onClick={() => {}}
        />
        <button
          onClick={leaveVoice}
          title="Disconnect"
          className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg bg-[#ed4245]/10 text-[#ed4245] hover:bg-[#ed4245]/20 transition-colors"
        >
          <PhoneOff size={14} />
        </button>
      </div>
    </div>
  );
}

function VoiceBtn({ active, icon, label, onClick, danger = false }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
        danger
          ? "bg-[#ed4245]/10 text-[#ed4245] hover:bg-[#ed4245]/20"
          : active
          ? "text-[#dcdbf0] hover:bg-[#1e2035]"
          : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#1e2035]"
      )}
    >
      {icon}
    </button>
  );
}
