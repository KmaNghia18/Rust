"use client";
import { useState } from "react";
import { messagesApi } from "@/lib/api";
import { useAuthStore, useMessageStore } from "@/lib/store";
import { Message } from "@/lib/store";
import { format, isToday, isYesterday } from "date-fns";
import Image from "next/image";
import { Edit2, Trash2, Reply, Smile, MoreHorizontal, Pin, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Props {
  message: Message;
  compact: boolean;
  isOwn: boolean;
}

export default function MessageItem({ message, compact, isOwn }: Props) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const { updateMessage, deleteMessage } = useMessageStore();
  const { user } = useAuthStore();

  const ts = new Date(message.timestamp);
  const timeLabel = isToday(ts)
    ? `Today at ${format(ts, "h:mm a")}`
    : isYesterday(ts)
    ? `Yesterday at ${format(ts, "h:mm a")}`
    : format(ts, "MM/dd/yyyy h:mm a");

  const handleEdit = async () => {
    if (editContent.trim() === message.content) { setEditing(false); return; }
    try {
      await messagesApi.edit(message.channel_id, message.id, { content: editContent.trim() });
      updateMessage(message.channel_id, message.id, { content: editContent.trim(), edited_at: Date.now() });
      setEditing(false);
    } catch { toast.error("Failed to edit message"); }
  };

  const handleDelete = async () => {
    try {
      await messagesApi.delete(message.channel_id, message.id);
      deleteMessage(message.channel_id, message.id);
    } catch { toast.error("Failed to delete message"); }
  };

  const addReaction = async (emoji: string) => {
    try {
      await messagesApi.addReaction(message.channel_id, message.id, emoji);
    } catch {}
  };

  return (
    <div
      className={cn(
        "relative flex gap-4 px-2 py-[2px] rounded-[4px] group",
        "hover:bg-[#1e2035] transition-colors",
        compact ? "pt-[2px]" : "pt-4",
        message.pending && "opacity-60"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar or timestamp spacer */}
      {compact ? (
        <div className="w-10 flex-shrink-0 flex items-center justify-end">
          {hovered && (
            <span className="text-[10px] text-[#5c6080] leading-none">
              {format(ts, "h:mm")}
            </span>
          )}
        </div>
      ) : (
        <div className="w-10 h-10 flex-shrink-0 mt-[2px]">
          {message.author?.avatar_url ? (
            <Image
              src={message.author.avatar_url}
              alt={message.author.username ?? ""}
              width={40}
              height={40}
              className="rounded-full cursor-pointer hover:opacity-90 object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-sm font-bold text-white cursor-pointer">
              {(message.author?.username ?? "?")[0].toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        {!compact && (
          <div className="flex items-baseline gap-2 mb-[2px]">
            <span className="font-semibold text-[#dcdbf0] text-sm hover:underline cursor-pointer">
              {message.author?.username ?? "Unknown"}
            </span>
            <span className="text-[10px] text-[#5c6080]">{timeLabel}</span>
            {message.edited_at && (
              <span className="text-[10px] text-[#5c6080]">(edited)</span>
            )}
          </div>
        )}

        {/* Reply */}
        {message.reply_to && (
          <div className="flex items-center gap-2 mb-1 text-[#8b8fad] text-xs opacity-70 hover:opacity-100 cursor-pointer">
            <Reply size={12} />
            <span className="font-semibold">{message.reply_to.author?.username}</span>
            <span className="truncate">{message.reply_to.content}</span>
          </div>
        )}

        {/* Body text */}
        {editing ? (
          <div className="mt-1">
            <textarea
              className="w-full bg-[#252840] text-[#dcdbf0] text-sm rounded-lg p-2 resize-none outline-none border border-[#5865f2]"
              value={editContent}
              autoFocus
              rows={3}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex gap-2 mt-1 text-xs text-[#8b8fad]">
              <span>escape to <button onClick={() => setEditing(false)} className="text-[#5865f2]">cancel</button></span>
              <span>· enter to <button onClick={handleEdit} className="text-[#5865f2]">save</button></span>
            </div>
          </div>
        ) : (
          <div className="message-content text-sm text-[#dcdbf0] break-words whitespace-pre-wrap">
            {message.content}
          </div>
        )}

        {/* Attachments */}
        {message.attachments?.map((att) => (
          <div key={att.id} className="mt-2">
            {att.content_type.startsWith("image/") ? (
              <Image
                src={att.url}
                alt={att.filename}
                width={att.width ?? 400}
                height={att.height ?? 300}
                className="rounded-lg max-w-[400px] max-h-[300px] object-contain cursor-pointer hover:opacity-90"
                style={{ width: "auto", height: "auto", maxWidth: 400, maxHeight: 300 }}
              />
            ) : (
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#1e2035] border border-[#2e3150] rounded-lg px-3 py-2 text-sm text-[#5865f2] hover:underline"
              >
                📎 {att.filename}
                <span className="text-[#5c6080] text-xs">
                  {(att.size / 1024).toFixed(0)} KB
                </span>
              </a>
            )}
          </div>
        ))}

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => addReaction(r.emoji)}
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors",
                  r.me
                    ? "bg-[#5865f2]/20 border-[#5865f2] text-[#5865f2]"
                    : "bg-[#1e2035] border-[#2e3150] text-[#dcdbf0] hover:border-[#5865f2]"
                )}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action toolbar (on hover) */}
      {hovered && (
        <div className="absolute top-0 right-4 -translate-y-1/2 flex items-center gap-1 bg-[#252840] border border-[#2e3150] rounded-lg p-1 shadow-lg z-10 animate-fadeIn">
          {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => (
            <button
              key={emoji}
              onClick={() => addReaction(emoji)}
              className="text-sm hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
          <div className="w-[1px] h-4 bg-[#2e3150] mx-1" />
          <ToolbarBtn title="Add reaction"><Smile size={14} /></ToolbarBtn>
          <ToolbarBtn title="Reply"><Reply size={14} /></ToolbarBtn>
          {isOwn && <ToolbarBtn title="Edit" onClick={() => { setEditing(true); setEditContent(message.content); }}><Edit2 size={14} /></ToolbarBtn>}
          {isOwn && <ToolbarBtn title="Delete" onClick={handleDelete} danger><Trash2 size={14} /></ToolbarBtn>}
          <ToolbarBtn title="More"><MoreHorizontal size={14} /></ToolbarBtn>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({ children, onClick, title, danger }: {
  children: React.ReactNode; onClick?: () => void; title: string; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "w-7 h-7 flex items-center justify-center rounded transition-colors",
        danger
          ? "text-[#ed4245] hover:bg-[#ed4245]/20"
          : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
      )}
    >
      {children}
    </button>
  );
}
