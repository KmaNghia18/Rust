"use client";
import { useAppearanceStore } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { Monitor, Moon, Sunset } from "lucide-react";

const THEMES = [
  { id: "dark",     label: "Dark",     icon: <Moon size={16} />,    bg: "#111827", surface: "#1e2035" },
  { id: "darker",   label: "Darker",   icon: <Monitor size={16} />, bg: "#0d0e1a", surface: "#16182a" },
  { id: "midnight", label: "Midnight", icon: <Sunset size={16} />,  bg: "#060612", surface: "#0f1128" },
] as const;

export default function AppearanceSettings() {
  const {
    theme, messageDisplay, fontSize, reducedMotion, showAvatarInCompact, enterSends,
    setTheme, setMessageDisplay, setFontSize, setReducedMotion, setShowAvatarInCompact, setEnterSends,
  } = useAppearanceStore();

  return (
    <div className="space-y-8">
      {/* Theme */}
      <Section label="Theme">
        <div className="flex gap-3">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex-1 rounded-xl overflow-hidden border-2 transition-all",
                theme === t.id ? "border-[#5865f2]" : "border-[#2e3150]"
              )}
            >
              {/* Mini preview */}
              <div className="h-16 flex" style={{ background: t.bg }}>
                <div className="w-8" style={{ background: t.surface }} />
                <div className="flex-1 p-2 space-y-1.5">
                  <div className="h-1.5 rounded w-3/4 bg-white/20" />
                  <div className="h-1.5 rounded w-1/2 bg-white/10" />
                </div>
              </div>
              <div className={cn(
                "flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors",
                theme === t.id ? "bg-[#5865f2] text-white" : "bg-[#1e2035] text-[#8b8fad]"
              )}>
                {t.icon} {t.label}
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* Message Display */}
      <Section label="Message Display">
        <div className="flex gap-3">
          {(["cozy", "compact"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setMessageDisplay(mode)}
              className={cn(
                "flex-1 p-4 rounded-xl border-2 text-left transition-all",
                messageDisplay === mode ? "border-[#5865f2] bg-[#5865f2]/10" : "border-[#2e3150] bg-[#1e2035]"
              )}
            >
              {/* Mini message mock */}
              <div className="flex gap-2 mb-2">
                {mode === "cozy" && (
                  <div className="w-8 h-8 rounded-full bg-[#5865f2]/40 flex-shrink-0" />
                )}
                <div className="flex-1 space-y-1">
                  <div className="h-2 rounded bg-white/20 w-20" />
                  <div className="h-1.5 rounded bg-white/10 w-full" />
                  <div className="h-1.5 rounded bg-white/10 w-2/3" />
                </div>
              </div>
              <p className={cn(
                "text-sm font-semibold capitalize",
                messageDisplay === mode ? "text-[#5865f2]" : "text-[#8b8fad]"
              )}>
                {mode}
              </p>
              <p className="text-xs text-[#5c6080] mt-0.5">
                {mode === "cozy"
                  ? "Discord's default — with avatars"
                  : "Dense — only username, no avatars"}
              </p>
            </button>
          ))}
        </div>
      </Section>

      {/* Font Size */}
      <Section label="Chat Font Size">
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#8b8fad]">12px</span>
          <input
            type="range" min={12} max={20} step={1} value={fontSize}
            onChange={e => setFontSize(+e.target.value)}
            className="flex-1 accent-[#5865f2]"
          />
          <span className="text-xs text-[#8b8fad]">20px</span>
          <div className="w-12 text-right text-sm font-mono text-[#dcdbf0]">{fontSize}px</div>
        </div>
        {/* Preview */}
        <div className="bg-[#1e2035] rounded-xl p-3 mt-2 border border-[#2e3150]">
          <p style={{ fontSize: `${fontSize}px` }} className="text-[#dcdbf0] leading-relaxed">
            The quick brown fox jumps over the lazy dog.{" "}
            <span className="text-[#5865f2] font-semibold">@Username</span>{" "}
            <span className="bg-[#5865f2]/20 text-[#aab4ff] rounded px-1 py-0.5">#channel</span>
          </p>
        </div>
      </Section>

      {/* Toggles */}
      <Section label="Accessibility & Behavior">
        {[
          {
            id: "motion", label: "Reduce Motion",
            desc: "Disable animations and transitions across the app",
            value: reducedMotion, set: setReducedMotion,
          },
          {
            id: "compact-avatar", label: "Show Avatars in Compact Mode",
            desc: "Display user avatars even in compact message mode",
            value: showAvatarInCompact, set: setShowAvatarInCompact,
          },
          {
            id: "enter-sends", label: "Enter Sends Message",
            desc: "When off, use Ctrl+Enter (or Cmd+Enter) to send",
            value: enterSends, set: setEnterSends,
          },
        ].map(item => (
          <div key={item.id} className="flex items-center justify-between py-3 border-b border-[#2e3150] last:border-0">
            <div>
              <p className="text-sm text-[#dcdbf0] font-medium">{item.label}</p>
              <p className="text-xs text-[#8b8fad] mt-0.5">{item.desc}</p>
            </div>
            <Toggle value={item.value} onChange={item.set} />
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-3">{label}</p>
      <div className="bg-[#1e2035] rounded-xl p-4">{children}</div>
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
