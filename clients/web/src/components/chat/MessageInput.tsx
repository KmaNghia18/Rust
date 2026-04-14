"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { messagesApi, mediaApi } from "@/lib/api";
import { useAuthStore, useMessageStore } from "@/lib/store";
import { Plus, Gift, Smile, Sticker, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props { channelId: string }

export default function MessageInput({ channelId }: Props) {
  const { user } = useAuthStore();
  const { addMessage } = useMessageStore();
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [typingTimer, setTypingTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [content]);

  // Typing indicator
  const triggerTyping = useCallback(() => {
    if (typingTimer) clearTimeout(typingTimer);
    messagesApi.triggerTyping ? messagesApi.triggerTyping(channelId) : null;
    const t = setTimeout(() => setTypingTimer(null), 5000);
    setTypingTimer(t);
  }, [channelId, typingTimer]);

  const sendMessage = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;
    if (sending) return;

    setSending(true);

    // Optimistic add
    const optimistic = {
      id: `opt-${Date.now()}`,
      channel_id: channelId,
      author_id: user!.id,
      content: trimmed,
      timestamp: Date.now(),
      reactions: [],
      attachments: [],
      embeds: [],
      mention_everyone: false,
      mentions: [],
      pending: true,
    };
    addMessage(channelId, optimistic);
    setContent("");
    setFiles([]);

    try {
      // Upload attachments first
      const attachmentIds: string[] = [];
      for (const file of files) {
        const { data } = await mediaApi.uploadAttachment(channelId, file);
        attachmentIds.push(data.id);
      }

      await messagesApi.send(channelId, { content: trimmed });
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [content, files, sending, channelId, user, addMessage]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles).slice(0, 10);
    setFiles((f) => [...f, ...arr].slice(0, 10));
  };

  return (
    <div className="px-4 pb-6 flex-shrink-0">
      {/* File previews */}
      {files.length > 0 && (
        <div className="mb-2 flex gap-2 flex-wrap">
          {files.map((f, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-[#1e2035] border border-[#2e3150] group">
              {f.type.startsWith("image/") ? (
                <Image
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-1 p-2">
                  <span className="text-xs text-[#8b8fad] text-center truncate w-full">{f.name}</span>
                </div>
              )}
              <button
                onClick={() => setFiles((ff) => ff.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#ed4245] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input box */}
      <div
        className="flex items-end gap-2 bg-[#252840] rounded-xl px-4 py-3 border border-[#2e3150] focus-within:border-[#5865f2] transition-colors"
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Attachment button */}
        <button
          onClick={() => fileRef.current?.click()}
          className="p-1 text-[#8b8fad] hover:text-[#dcdbf0] transition-colors flex-shrink-0"
        >
          <Plus size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.txt,.zip"
          onChange={(e) => addFiles(e.target.files)}
        />

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            triggerTyping();
          }}
          onKeyDown={onKeyDown}
          placeholder={`Message #channel`}
          rows={1}
          className={cn(
            "flex-1 bg-transparent text-[#dcdbf0] placeholder-[#5c6080]",
            "text-sm resize-none outline-none leading-6 max-h-[200px]"
          )}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {[Gift, Smile, Sticker].map((Icon, i) => (
            <button key={i} className="p-1 text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
              <Icon size={20} />
            </button>
          ))}
          {(content.trim() || files.length > 0) && (
            <button
              onClick={sendMessage}
              disabled={sending}
              className="p-1 text-[#5865f2] hover:text-[#7289da] transition-colors"
            >
              <Send size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
