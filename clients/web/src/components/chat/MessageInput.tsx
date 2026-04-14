"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { messagesApi, mediaApi } from "@/lib/api";
import { useAuthStore, useMessageStore, useUIStore, useChannelStore } from "@/lib/store";
import { useUnreadStore } from "@/lib/unread";
import EmojiPickerButton from "./EmojiPickerButton";
import GifPicker from "./GifPicker";
import { Plus, Send, X, Hash } from "lucide-react";
import toast from "react-hot-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props { channelId: string }

// ─── Autocomplete types ────────────────────────────────────────────────────
interface Suggestion {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string | null;
  type: "user" | "channel" | "emoji";
}

export default function MessageInput({ channelId }: Props) {
  const { user } = useAuthStore();
  const { addMessage, updateMessage } = useMessageStore();
  const { activeGuildId } = useUIStore();
  const { channels } = useChannelStore();
  const { markRead } = useUnreadStore();

  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [triggerPos, setTriggerPos] = useState<number | null>(null);
  const [triggerChar, setTriggerChar] = useState<"@" | "#" | ":" | null>(null);
  const [showGif, setShowGif] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  // ── Notification sounds ─────────────────────────────────────────────────
  const playSend = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch {}
  };

  // ── Auto-resize textarea ────────────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [content]);

  // ── Typing indicator ───────────────────────────────────────────────────
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerTyping = () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    messagesApi.triggerTyping?.(channelId).catch(() => {});
    typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 5000);
  };

  // ── Autocomplete parsing ───────────────────────────────────────────────
  const parseAutocomplete = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const last = before.split(/\s/).pop() ?? "";

    const atMatch = last.match(/@(\w*)$/);
    const hashMatch = last.match(/#(\w*)$/);
    const colonMatch = last.match(/:(\w{2,})$/);

    if (atMatch) {
      setTriggerChar("@");
      setTriggerPos(cursorPos - atMatch[0].length);
      // Filter guild members
      const q = atMatch[1].toLowerCase();
      const guildChannels = channels[activeGuildId ?? ""] ?? [];
      const members: Suggestion[] = [
        { id: "everyone", label: "everyone", sublabel: "Notify everyone", icon: null, type: "user" },
        { id: "here",     label: "here",     sublabel: "Online members",  icon: null, type: "user" },
      ];
      setSuggestions(members.filter(m => m.label.includes(q)).slice(0, 10));
    } else if (hashMatch) {
      setTriggerChar("#");
      setTriggerPos(cursorPos - hashMatch[0].length);
      const q = hashMatch[1].toLowerCase();
      const guildChannels = (channels[activeGuildId ?? ""] ?? []).filter(c => c.type === 0);
      const suggs: Suggestion[] = guildChannels
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 10)
        .map(c => ({ id: c.id, label: c.name, type: "channel" as const }));
      setSuggestions(suggs);
    } else {
      setSuggestions([]);
      setTriggerChar(null);
      setTriggerPos(null);
    }
  }, [channels, activeGuildId]);

  // ── Apply selected suggestion ──────────────────────────────────────────
  const applySuggestion = (suggestion: Suggestion) => {
    if (triggerPos === null || !triggerChar) return;
    const prefix = content.slice(0, triggerPos);
    const suffix = content.slice(inputRef.current?.selectionEnd ?? content.length);
    const insert = triggerChar === "@"
      ? `@${suggestion.label} `
      : `#${suggestion.label} `;
    const newContent = prefix + insert + suffix;
    setContent(newContent);
    setSuggestions([]);
    setTriggerChar(null);

    // Restore cursor
    setTimeout(() => {
      const pos = prefix.length + insert.length;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  };

  // ── Send message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (gifUrl?: string) => {
    const trimmed = gifUrl ?? content.trim();
    if (!trimmed && files.length === 0) return;
    if (sending) return;

    setSending(true);

    const optimisticId = `opt-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      channel_id: channelId,
      author_id: user!.id,
      author: user as any,
      content: trimmed,
      timestamp: Date.now(),
      reactions: [], attachments: [], embeds: [],
      mention_everyone: trimmed.includes("@everyone"),
      mentions: [],
      pending: true,
    };
    addMessage(channelId, optimistic);
    setContent("");
    setFiles([]);
    playSend();

    try {
      const { data } = await messagesApi.send(channelId, {
        content: trimmed,
        // attachments handled separately via media service
      });
      updateMessage(channelId, optimisticId, { ...data, pending: false });
      markRead(channelId, activeGuildId ?? undefined, data.id);
    } catch {
      toast.error("Failed to send message");
      updateMessage(channelId, optimisticId, { pending: false });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [content, files, sending, channelId, user, addMessage, updateMessage, markRead, activeGuildId]);

  // ── Keyboard handling ──────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIndex(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || e.key === "Enter" && suggestions.length > 0) {
        e.preventDefault();
        applySuggestion(suggestions[suggestionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setSuggestions([]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(f => [...f, ...Array.from(list)].slice(0, 10));
  };

  const channelName = (channels[activeGuildId ?? ""] ?? []).find(c => c.id === channelId)?.name ?? "channel";

  return (
    <div className="px-4 pb-6 flex-shrink-0">
      {/* Autocomplete popover */}
      {suggestions.length > 0 && (
        <div className="mb-2 bg-[#1e2035] border border-[#2e3150] rounded-xl overflow-hidden shadow-xl">
          <div className="px-3 py-1.5 border-b border-[#2e3150]">
            <span className="text-xs text-[#8b8fad] font-medium">
              {triggerChar === "@" ? "Members matching…" : "Channels matching…"}
            </span>
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                i === suggestionIndex ? "bg-[#5865f2] text-white" : "text-[#dcdbf0] hover:bg-[#2e3150]"
              )}
            >
              {s.type === "user"    && <span className="text-base">@</span>}
              {s.type === "channel" && <Hash size={14} className="flex-shrink-0" />}
              <span className="font-medium">{s.label}</span>
              {s.sublabel && <span className="ml-auto text-xs opacity-60">{s.sublabel}</span>}
            </button>
          ))}
          <div className="px-3 py-1 border-t border-[#2e3150]">
            <span className="text-[10px] text-[#5c6080]">Tab / Enter to select · Esc to close</span>
          </div>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="mb-2 flex gap-2 flex-wrap">
          {files.map((f, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-[#1e2035] border border-[#2e3150] group">
              {f.type.startsWith("image/") ? (
                <Image src={URL.createObjectURL(f)} alt={f.name} fill className="object-cover" />
              ) : (
                <div className="h-full flex items-center justify-center p-1">
                  <span className="text-[10px] text-[#8b8fad] text-center truncate">{f.name}</span>
                </div>
              )}
              <button
                onClick={() => setFiles(ff => ff.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#ed4245] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input box */}
      <div
        className="flex items-end gap-2 bg-[#2e3150] rounded-xl px-4 py-3 border border-transparent focus-within:border-[#5865f2]/50 transition-colors"
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Attachment */}
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach file"
          className="p-1 text-[#8b8fad] hover:text-[#dcdbf0] transition-colors flex-shrink-0 mb-0.5"
        >
          <Plus size={20} />
        </button>
        <input ref={fileRef} type="file" className="hidden" multiple
          accept="image/*,video/*,audio/*,.pdf,.txt,.zip"
          onChange={e => addFiles(e.target.files)} />

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={content}
          onChange={e => {
            setContent(e.target.value);
            triggerTyping();
            parseAutocomplete(e.target.value, e.target.selectionEnd ?? 0);
          }}
          onKeyDown={onKeyDown}
          placeholder={`Message #${channelName}`}
          rows={1}
          className="flex-1 bg-transparent text-[#dcdbf0] placeholder-[#5c6080] text-sm resize-none outline-none leading-6 max-h-[200px] py-0.5"
        />

        {/* Emoji + GIF + send */}
        <div className="flex items-center mb-0.5 relative">
          <EmojiPickerButton
            onSelect={emoji => setContent(c => c + emoji)}
            buttonClassName="text-[#8b8fad] hover:text-[#fee75c]"
          />
          <button
            onClick={() => setShowGif(g => !g)}
            title="GIF Picker"
            className={cn(
              "p-1.5 transition-colors rounded text-[#8b8fad] hover:text-[#5865f2]",
              showGif && "text-[#5865f2]"
            )}
          >
            <span className="text-xs font-black">GIF</span>
          </button>
          {showGif && (
            <GifPicker
              onSelect={gifUrl => {
                sendMessage(gifUrl);
                setShowGif(false);
              }}
              onClose={() => setShowGif(false)}
            />
          )}

          {(content.trim() || files.length > 0) && (
            <button
              onClick={() => sendMessage()}
              disabled={sending}
              title="Send message (Enter)"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white transition-colors ml-1 disabled:opacity-60"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
