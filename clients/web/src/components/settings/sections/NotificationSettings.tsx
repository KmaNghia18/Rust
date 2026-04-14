"use client";
import { useState } from "react";
import { Bell, BellOff, AtSign, Hash, Volume2, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

const NOTIFY_LEVELS = [
  { id: "all",       label: "All Messages",  icon: <Bell size={14} /> },
  { id: "mentions",  label: "Only @Mentions", icon: <AtSign size={14} /> },
  { id: "nothing",   label: "Nothing",        icon: <BellOff size={14} /> },
] as const;

type NotifyLevel = typeof NOTIFY_LEVELS[number]["id"];

export default function NotificationSettings() {
  const [globalLevel, setGlobalLevel]           = useState<NotifyLevel>("all");
  const [messages, setMessages]                 = useState(true);
  const [mentions, setMentions]                 = useState(true);
  const [reactions, setReactions]               = useState(false);
  const [voiceJoin, setVoiceJoin]               = useState(true);
  const [friendRequest, setFriendRequest]       = useState(true);
  const [desktopNotifs, setDesktopNotifs]       = useState(true);
  const [showPreview, setShowPreview]           = useState(true);
  const [mobileSound, setMobileSound]           = useState(true);
  const [badge, setBadge]                       = useState(true);

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") setDesktopNotifs(true);
  };

  return (
    <div className="space-y-8">
      {/* Global level */}
      <Section icon={<Bell size={16} />} title="Default Notification Level">
        <div className="flex gap-3">
          {NOTIFY_LEVELS.map(level => (
            <button
              key={level.id}
              onClick={() => setGlobalLevel(level.id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all text-sm font-medium",
                globalLevel === level.id
                  ? "border-[#5865f2] bg-[#5865f2]/10 text-[#5865f2]"
                  : "border-[#2e3150] text-[#8b8fad] hover:border-[#5865f2]/50"
              )}
            >
              {level.icon}
              {level.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#8b8fad] mt-2">
          {globalLevel === "all" && "You'll receive notifications for all messages."}
          {globalLevel === "mentions" && "You'll only be notified when mentioned."}
          {globalLevel === "nothing" && "You won't receive desktop notifications."}
        </p>
      </Section>

      {/* Events */}
      <Section icon={<Hash size={16} />} title="Notify Me About">
        <ToggleRow label="New Messages"              desc="When someone sends a message in a channel you follow" value={messages}   set={setMessages} />
        <ToggleRow label="@Mentions"                 desc="When someone mentions you directly"                  value={mentions}   set={setMentions} />
        <ToggleRow label="Reactions to my messages"  desc="When someone reacts to one of your messages"         value={reactions}  set={setReactions} />
        <ToggleRow label="Friend Requests"           desc="When someone sends you a friend request"             value={friendRequest} set={setFriendRequest} />
        <ToggleRow label="Voice Channel Activity"    desc="When a friend joins a voice channel"                 value={voiceJoin}  set={setVoiceJoin} />
      </Section>

      {/* Desktop */}
      <Section icon={<Bell size={16} />} title="Desktop Notifications">
        <div className="flex items-start justify-between py-3 border-b border-[#2e3150]">
          <div className="flex-1 pr-4">
            <p className="text-sm text-[#dcdbf0] font-medium">Enable Desktop Notifications</p>
            <p className="text-xs text-[#8b8fad] mt-0.5">
              {typeof window !== "undefined" && "Notification" in window
                ? `Status: ${Notification.permission}`
                : "Not available in this browser"}
            </p>
            {typeof window !== "undefined" && "Notification" in window && Notification.permission === "default" && (
              <button onClick={requestPermission}
                className="mt-2 text-xs text-[#5865f2] hover:underline">
                Grant Permission
              </button>
            )}
          </div>
          <Toggle value={desktopNotifs} onChange={setDesktopNotifs} />
        </div>
        <ToggleRow label="Show Preview in Notification" desc="Show message content in desktop notifications" value={showPreview} set={setShowPreview} />
        <ToggleRow label="Show Unread Badge"            desc="Show a badge on the taskbar icon"              value={badge}       set={setBadge} />
      </Section>

      {/* Sounds */}
      <Section icon={<Volume2 size={16} />} title="Sounds">
        <ToggleRow label="Message Sound"    desc="Play a sound when you receive a message" value={messages}    set={setMessages} />
        <ToggleRow label="Mention Sound"    desc="Louder sound for @mentions"              value={mentions}    set={setMentions} />
        <ToggleRow label="PTT Activate"     desc="Sound when push-to-talk activates"       value={voiceJoin}   set={setVoiceJoin} />
        <ToggleRow label="Voice Disconnect" desc="Sound when leaving a voice channel"      value={voiceJoin}   set={setVoiceJoin} />
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[#5865f2]">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b8fad]">{title}</h3>
      </div>
      <div className="bg-[#1e2035] rounded-xl p-4 divide-y divide-[#2e3150]">
        {children}
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, value, set }: { label: string; desc: string; value: boolean; set: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 last:pb-0 first:pt-0">
      <div className="flex-1 pr-4">
        <p className="text-sm text-[#dcdbf0] font-medium">{label}</p>
        <p className="text-xs text-[#8b8fad] mt-0.5">{desc}</p>
      </div>
      <Toggle value={value} onChange={set} />
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={cn("w-10 h-5 rounded-full relative transition-colors flex-shrink-0",
        value ? "bg-[#57f287]" : "bg-[#4e5058]")}>
      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
        value ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}
