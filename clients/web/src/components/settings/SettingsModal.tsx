"use client";
import { useState } from "react";
import { useAuthStore, useUIStore } from "@/lib/store";
import { X, User, Bell, Gamepad2, Mic, Monitor, Palette, ShieldCheck, CreditCard, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import AccountSettings from "./sections/AccountSettings";
import AppearanceSettings from "./sections/AppearanceSettings";
import VoiceSettings from "./sections/VoiceSettings";
import NotificationSettings from "./sections/NotificationSettings";

const SECTIONS = [
  { id: "my-account",    label: "My Account",    icon: User,       group: "USER SETTINGS" },
  { id: "appearance",    label: "Appearance",     icon: Palette,    group: "USER SETTINGS" },
  { id: "notifications", label: "Notifications",  icon: Bell,       group: "USER SETTINGS" },
  { id: "voice",         label: "Voice & Video",  icon: Mic,        group: "USER SETTINGS" },
  { id: "activity",      label: "Activity",       icon: Gamepad2,   group: "USER SETTINGS" },
  { id: "privacy",       label: "Privacy",        icon: ShieldCheck, group: "USER SETTINGS" },
  { id: "billing",       label: "Nitro / Billing", icon: CreditCard, group: "BILLING" },
];

export default function SettingsModal() {
  const { settingsOpen, settingsPage, closeSettings, openSettings } = useUIStore();
  const { logout } = useAuthStore();

  if (!settingsOpen) return null;

  const currentSection = SECTIONS.find((s) => s.id === settingsPage) ?? SECTIONS[0];

  function renderSection() {
    switch (settingsPage) {
      case "my-account":    return <AccountSettings />;
      case "appearance":    return <AppearanceSettings />;
      case "voice":         return <VoiceSettings />;
      case "notifications": return <NotificationSettings />;
      default:              return <div className="text-[#8b8fad] p-4">Coming soon…</div>;
    }
  }

  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Sidebar */}
      <aside className="w-[218px] bg-[#1e2035] flex-shrink-0 py-16 px-3 flex flex-col gap-1 border-r border-[#111827]">
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6080] px-2 mb-1">{group}</p>
            {SECTIONS.filter((s) => s.group === group).map((s) => (
              <button
                key={s.id}
                onClick={() => openSettings(s.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-[7px] rounded-[4px] text-sm transition-colors text-left",
                  settingsPage === s.id
                    ? "bg-[#2e3150] text-[#dcdbf0]"
                    : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
                )}
              >
                <s.icon size={16} />
                {s.label}
              </button>
            ))}
          </div>
        ))}
        <div className="mt-auto">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-2 py-[7px] rounded-[4px] text-sm text-[#ed4245] hover:bg-[#ed4245]/10 transition-colors"
          >
            <LogOut size={16} /> Log Out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 bg-[#252840] overflow-y-auto relative">
        <div className="max-w-[740px] mx-auto py-16 px-10">
          <h2 className="text-xl font-bold text-[#dcdbf0] mb-6">{currentSection.label}</h2>
          {renderSection()}
        </div>
      </main>

      {/* Close button */}
      <button
        onClick={closeSettings}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#2e3150] text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#3e4160] transition-colors z-10"
      >
        <X size={16} />
      </button>
    </div>
  );
}
