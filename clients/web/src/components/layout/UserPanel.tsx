"use client";
import { useState, useRef, useEffect } from "react";
import { useAuthStore, useUIStore } from "@/lib/store";
import { authApi } from "@/lib/api";
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, ChevronUp, X, Check } from "lucide-react";
import { useVoiceStore } from "@/lib/store";
import Image from "next/image";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type OnlineStatus = "online" | "idle" | "dnd" | "invisible";

const STATUS_OPTIONS: { id: OnlineStatus; label: string; color: string; desc: string }[] = [
  { id: "online",    label: "Online",           color: "#57f287", desc: "Available" },
  { id: "idle",      label: "Idle",             color: "#fee75c", desc: "Away" },
  { id: "dnd",       label: "Do Not Disturb",   color: "#ed4245", desc: "Silences notifications" },
  { id: "invisible", label: "Invisible",        color: "#80848e", desc: "Appear offline" },
];

export default function UserPanel() {
  const { user, updateUser } = useAuthStore();
  const { openSettings } = useUIStore();
  const { selfMute, selfDeaf, toggleMute, toggleDeaf } = useVoiceStore();

  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showCustomStatus, setShowCustomStatus] = useState(false);
  const [customStatusInput, setCustomStatusInput] = useState(user?.custom_status ?? "");
  const [status, setStatus] = useState<OnlineStatus>((user?.status as OnlineStatus) ?? "online");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowStatusMenu(false);
    };
    if (showStatusMenu) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showStatusMenu]);

  const changeStatus = async (s: OnlineStatus) => {
    setStatus(s);
    setShowStatusMenu(false);
    try {
      await authApi.updateProfile({ status: s });
      updateUser({ status: s });
    } catch { toast.error("Failed to update status"); }
  };

  const saveCustomStatus = async () => {
    try {
      await authApi.updateProfile({ custom_status: customStatusInput.trim() });
      updateUser({ custom_status: customStatusInput.trim() });
      setShowCustomStatus(false);
      toast.success("Custom status updated!");
    } catch { toast.error("Failed to save"); }
  };

  const clearCustomStatus = async () => {
    try {
      await authApi.updateProfile({ custom_status: "" });
      updateUser({ custom_status: "" });
      setCustomStatusInput("");
      toast.success("Custom status cleared");
    } catch {}
  };

  const currentStatusColor = STATUS_OPTIONS.find(s => s.id === status)?.color ?? "#57f287";

  if (!user) return null;

  return (
    <div className="relative">
      {/* Status popup menu */}
      {showStatusMenu && (
        <div ref={menuRef}
          className="absolute bottom-full left-0 mb-2 w-64 bg-[#111827] border border-[#2e3150] rounded-xl shadow-2xl overflow-hidden animate-fadeIn z-50">
          {/* Custom status */}
          <div className="p-3 border-b border-[#2e3150]">
            <button
              onClick={() => { setShowStatusMenu(false); setShowCustomStatus(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1e2035] hover:bg-[#2e3150] text-sm text-left transition-colors group"
            >
              <span className="text-lg">😊</span>
              <div className="flex-1 min-w-0">
                <p className="text-[#dcdbf0] font-medium text-xs">Set a custom status</p>
                {user.custom_status && (
                  <p className="text-[#8b8fad] text-xs truncate">{user.custom_status}</p>
                )}
              </div>
              {user.custom_status && (
                <button onClick={e => { e.stopPropagation(); clearCustomStatus(); }}
                  className="opacity-0 group-hover:opacity-100 text-[#8b8fad] hover:text-[#ed4245]">
                  <X size={12} />
                </button>
              )}
            </button>
          </div>

          {/* Status options */}
          <div className="p-2">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => changeStatus(opt.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                  status === opt.id ? "bg-[#5865f2]/20" : "hover:bg-[#1e2035]"
                )}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                <span className={cn("flex-1 text-left", status === opt.id ? "text-[#dcdbf0]" : "text-[#8b8fad]")}>
                  {opt.label}
                </span>
                {status === opt.id && <Check size={12} className="text-[#5865f2]" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom status modal */}
      {showCustomStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCustomStatus(false)}>
          <div className="bg-[#252840] rounded-2xl border border-[#2e3150] p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#dcdbf0] mb-4">Set a Custom Status</h3>
            <div className="flex items-center gap-2 bg-[#1e2035] border border-[#2e3150] focus-within:border-[#5865f2] rounded-lg px-3 py-2.5 transition-colors mb-4">
              <span className="text-xl flex-shrink-0">😊</span>
              <input
                autoFocus
                value={customStatusInput}
                onChange={e => setCustomStatusInput(e.target.value)}
                maxLength={128}
                placeholder="What's your status?"
                className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]"
                onKeyDown={e => e.key === "Enter" && saveCustomStatus()}
              />
              {customStatusInput && (
                <button onClick={() => setCustomStatusInput("")} className="text-[#8b8fad] hover:text-[#dcdbf0]">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCustomStatus(false)}
                className="px-4 py-2 text-sm text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">Cancel</button>
              <button onClick={saveCustomStatus}
                className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold rounded-lg transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main panel */}
      <div className="h-[52px] bg-[#111827] flex items-center px-2 gap-1">
        {/* Avatar + name (click to open status menu) */}
        <button
          onClick={() => setShowStatusMenu(s => !s)}
          className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1 rounded-lg hover:bg-[#1e2035] transition-colors group"
        >
          <div className="relative w-8 h-8 flex-shrink-0">
            {user.avatar_url ? (
              <Image src={user.avatar_url} alt="" width={32} height={32} className="rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
                {user.username[0]?.toUpperCase()}
              </div>
            )}
            <span
              className="absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-[#111827]"
              style={{ background: currentStatusColor }}
            />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-semibold text-[#dcdbf0] truncate leading-tight">{user.username}</p>
            {user.custom_status ? (
              <p className="text-[10px] text-[#8b8fad] truncate leading-tight">{user.custom_status}</p>
            ) : (
              <p className="text-[10px] text-[#8b8fad] capitalize leading-tight">{status}</p>
            )}
          </div>
          <ChevronUp size={12} className={cn(
            "text-[#5c6080] transition-transform flex-shrink-0",
            showStatusMenu && "rotate-180"
          )} />
        </button>

        {/* Voice controls */}
        <button
          onClick={toggleMute}
          title={selfMute ? "Unmute" : "Mute"}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
            selfMute ? "text-[#ed4245] bg-[#ed4245]/10 hover:bg-[#ed4245]/20" : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#1e2035]"
          )}
        >
          {selfMute ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          onClick={toggleDeaf}
          title={selfDeaf ? "Undeafen" : "Deafen"}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
            selfDeaf ? "text-[#ed4245] bg-[#ed4245]/10 hover:bg-[#ed4245]/20" : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#1e2035]"
          )}
        >
          {selfDeaf ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
        </button>
        <button
          onClick={() => openSettings("my-account")}
          title="User Settings"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#1e2035] transition-colors"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
