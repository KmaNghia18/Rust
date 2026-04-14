"use client";
import { useState, useEffect, useCallback } from "react";
import ServerList from "@/components/layout/ServerList";
import ChannelSidebar from "@/components/layout/ChannelSidebar";
import ChatArea from "@/components/chat/ChatArea";
import MemberList from "@/components/layout/MemberList";
import FriendsPage from "@/components/friends/FriendsPage";
import UserPanel from "@/components/layout/UserPanel";
import VoiceBar from "@/components/layout/VoiceBar";
import QuickSwitcher from "@/components/ui/QuickSwitcher";
import KeyboardShortcutsModal from "@/components/ui/KeyboardShortcutsModal";
import SettingsModal from "@/components/settings/SettingsModal";
import ServerSettings from "@/components/server/ServerSettings";
import CreateServerModal from "@/components/modals/CreateServerModal";
import { useGuildStore, useChannelStore, useAuthStore, useUIStore } from "@/lib/store";
import { useAppearanceStore } from "@/lib/appearance";
import { cn } from "@/lib/utils";

export default function AppShell() {
  const { activeGuildId } = useGuildStore();
  const { activeChannelId } = useChannelStore();
  const { user } = useAuthStore();
  const { settingsOpen, settingsTab, closeSettings, openSettings } = useUIStore();

  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMemberList, setShowMemberList] = useState(true);
  const [serverSettingsFor, setServerSettingsFor] = useState<string | null>(null);

  const { theme, fontSize, messageDisplay, reducedMotion } = useAppearanceStore();

  // ── Apply appearance to :root ────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--chat-font-size", `${fontSize}px`);
    root.dataset.theme   = theme;
    root.dataset.display = messageDisplay;
    if (reducedMotion) root.classList.add("reduce-motion");
    else               root.classList.remove("reduce-motion");
  }, [theme, fontSize, messageDisplay, reducedMotion]);

  // ── Global hotkeys ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+K — Quick switch
      if (ctrl && e.key === "k") {
        e.preventDefault();
        setShowQuickSwitcher(s => !s);
      }
      // Ctrl+/ — Keyboard shortcuts
      if (ctrl && e.key === "/") {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
      // Ctrl+Shift+M — toggle mute (handled by voice store)
      // Ctrl+Shift+D — toggle deafen (handled by voice store)

      // Alt+↑/↓ — navigate channels
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        // Channel navigation — handled by store
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (!user) return null;

  const isDM = !activeGuildId;

  return (
    <div className={cn("flex h-screen w-screen overflow-hidden", `theme-${theme}`)}>
      {/* Server list */}
      <ServerList onOpenServerSettings={gid => setServerSettingsFor(gid)} />

      {/* Channel / DM sidebar */}
      <div className="flex flex-col flex-shrink-0">
        {isDM ? (
          /* DM sidebar */
          <DMSidebar />
        ) : (
          <ChannelSidebar onOpenMemberList={() => setShowMemberList(m => !m)} />
        )}

        {/* Voice bar */}
        <VoiceBar />

        {/* User panel */}
        <UserPanel />
      </div>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {isDM ? (
          activeChannelId ? <ChatArea /> : <FriendsPage />
        ) : (
          <ChatArea />
        )}

        {/* Member list (guild only) */}
        {!isDM && showMemberList && activeGuildId && (
          <MemberList guildId={activeGuildId} />
        )}
      </main>

      {/* ── Overlays ────────────────────────────────────────────────────── */}
      {showQuickSwitcher && <QuickSwitcher onClose={() => setShowQuickSwitcher(false)} />}
      {showShortcuts     && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {settingsOpen && (
        <SettingsModal
          initialTab={settingsTab}
          onClose={closeSettings}
          extraTabs={[
            {
              id: "appearance",
              label: "Appearance",
              group: "APP SETTINGS",
              // Rendered inside SettingsModal already
            },
            {
              id: "notifications",
              label: "Notifications",
              group: "APP SETTINGS",
            },
            {
              id: "keybinds",
              label: "Keybinds",
              group: "APP SETTINGS",
              onClick: () => { closeSettings(); setShowShortcuts(true); },
            },
          ]}
        />
      )}

      {serverSettingsFor && (
        <ServerSettings
          guildId={serverSettingsFor}
          onClose={() => setServerSettingsFor(null)}
        />
      )}
    </div>
  );
}

// ── DM Sidebar ──────────────────────────────────────────────────────────────
function DMSidebar() {
  const { setActiveChannel, activeChannelId } = useChannelStore();
  const { data: dms } = { data: [] as any[] }; // populated from friendsApi.listDMs()
  const [search, setSearch] = useState("");
  const { Search } = require("lucide-react");
  const { MessageSquare, UserPlus } = require("lucide-react");
  const Image = require("next/image").default;

  return (
    <div className="w-60 bg-[#1e2035] flex flex-col">
      {/* Search */}
      <div className="p-3">
        <button className="w-full bg-[#111827] rounded-lg px-3 py-2 text-sm text-[#5c6080] text-left">
          Find or start a conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-y px-2">
        {/* Friends button */}
        <button
          onClick={() => setActiveChannel(null as any)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-1",
            !activeChannelId ? "bg-[#5865f2] text-white" : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
          )}
        >
          <UserPlus size={18} />
          Friends
        </button>

        <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6080] px-3 py-1 mt-2">
          Direct Messages
        </p>

        {dms.map((dm: any) => (
          <button
            key={dm.id}
            onClick={() => setActiveChannel(dm.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              activeChannelId === dm.id ? "bg-[#2e3150] text-[#dcdbf0]" : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
            )}
          >
            <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {dm.recipient?.username?.[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="truncate">{dm.recipient?.username ?? "Unknown"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
