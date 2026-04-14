"use client";
import { useState, useRef, useEffect } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

// Lazy-load emoji-mart to avoid SSR issues
let EmojiPicker: any = null;
let emojiData: any = null;

interface Props {
  onSelect: (emoji: string) => void;
  className?: string;
  buttonClassName?: string;
}

export default function EmojiPickerButton({ onSelect, className, buttonClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load emoji-mart dynamically (large library)
  useEffect(() => {
    if (!loaded && open) {
      Promise.all([
        import("@emoji-mart/react"),
        import("@emoji-mart/data"),
      ]).then(([pickerMod, dataMod]) => {
        EmojiPicker = pickerMod.default;
        emojiData   = dataMod.default;
        setLoaded(true);
      });
    }
  }, [open, loaded]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Emoji Picker"
        className={cn(
          "p-1.5 text-[#8b8fad] hover:text-[#dcdbf0] transition-colors rounded",
          open && "text-[#5865f2]",
          buttonClassName
        )}
      >
        <Smile size={20} />
      </button>

      {open && (
        <div className="absolute bottom-12 right-0 z-50 shadow-2xl animate-fadeIn">
          {loaded && EmojiPicker ? (
            <EmojiPicker
              data={emojiData}
              onEmojiSelect={(emoji: { native: string }) => {
                onSelect(emoji.native);
                setOpen(false);
              }}
              theme="dark"
              previewPosition="none"
              skinTonePosition="search"
              navPosition="bottom"
              perLine={8}
              maxFrequentRows={2}
              locale="en"
            />
          ) : (
            <div className="w-[352px] h-[400px] bg-[#252840] rounded-xl border border-[#2e3150] flex items-center justify-center text-[#8b8fad]">
              <div className="flex flex-col items-center gap-2">
                <Smile size={32} className="animate-pulse-sm" />
                <span className="text-sm">Loading emojis…</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
