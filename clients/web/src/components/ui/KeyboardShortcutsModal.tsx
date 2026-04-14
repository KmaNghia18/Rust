"use client";
import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

interface Props { onClose: () => void }

const SHORTCUTS = [
  {
    category: "Navigation",
    items: [
      { keys: ["Ctrl", "K"],    desc: "Quick Switcher — jump to channel or server" },
      { keys: ["Ctrl", "F"],    desc: "Search messages in current channel" },
      { keys: ["Ctrl", "/"],    desc: "Show Keyboard Shortcuts" },
      { keys: ["Alt", "↑"],    desc: "Go to previous channel" },
      { keys: ["Alt", "↓"],    desc: "Go to next channel" },
      { keys: ["Alt", "←"],    desc: "Navigate back (history)" },
      { keys: ["Alt", "→"],    desc: "Navigate forward (history)" },
      { keys: ["Ctrl", "Shift", "M"], desc: "Direct Messages" },
    ],
  },
  {
    category: "Text Formatting",
    items: [
      { keys: ["Ctrl", "B"],    desc: "Bold" },
      { keys: ["Ctrl", "I"],    desc: "Italic" },
      { keys: ["Ctrl", "U"],    desc: "Underline" },
      { keys: ["Shift", "Enter"], desc: "New line (without sending)" },
      { keys: ["/"],            desc: "Open slash commands" },
      { keys: ["@"],            desc: "Mention a user" },
      { keys: ["#"],            desc: "Reference a channel" },
      { keys: [":"],            desc: "Open emoji picker" },
    ],
  },
  {
    category: "Messages",
    items: [
      { keys: ["↑"],            desc: "Edit your last message" },
      { keys: ["Esc"],          desc: "Cancel editing / collapse thread" },
      { keys: ["Enter"],        desc: "Send message" },
      { keys: ["Ctrl", "Enter"], desc: "Send (when Enter Sends is off)" },
      { keys: ["Ctrl", "R"],    desc: "React to last message" },
    ],
  },
  {
    category: "Voice & Media",
    items: [
      { keys: ["Ctrl", "Shift", "D"], desc: "Toggle Deafen" },
      { keys: ["Ctrl", "Shift", "M"], desc: "Toggle Mute" },
      { keys: ["Ctrl", "Shift", "V"], desc: "Toggle Video" },
    ],
  },
  {
    category: "Window",
    items: [
      { keys: ["Ctrl", "+"],    desc: "Zoom in (Desktop)" },
      { keys: ["Ctrl", "-"],    desc: "Zoom out (Desktop)" },
      { keys: ["Ctrl", "0"],    desc: "Reset Zoom (Desktop)" },
      { keys: ["F11"],          desc: "Toggle Fullscreen (Desktop)" },
    ],
  },
];

export default function KeyboardShortcutsModal({ onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-[#252840] rounded-2xl border border-[#2e3150] shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-fadeIn"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e3150] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#5865f2]/20 rounded-lg flex items-center justify-center">
              <Keyboard size={16} className="text-[#5865f2]" />
            </div>
            <h2 className="text-lg font-bold text-[#dcdbf0]">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto scroll-y flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {SHORTCUTS.map(section => (
            <div key={section.category}>
              <p className="text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-3">
                {section.category}
              </p>
              <div className="space-y-2">
                {section.items.map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#dcdbf0] flex-1">{desc}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="bg-[#1e2035] border border-[#2e3150] rounded px-2 py-0.5 text-xs text-[#dcdbf0] font-mono shadow-sm">
                            {k}
                          </kbd>
                          {i < keys.length - 1 && (
                            <span className="text-[10px] text-[#5c6080]">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-[#2e3150] text-center flex-shrink-0">
          <p className="text-xs text-[#5c6080]">Press <kbd className="bg-[#1e2035] border border-[#2e3150] rounded px-1.5 text-[#8b8fad]">Ctrl + /</kbd> to toggle this panel</p>
        </div>
      </div>
    </div>
  );
}
