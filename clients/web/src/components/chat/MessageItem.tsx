"use client";
import { useState, useCallback } from "react";
import Image from "next/image";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { messagesApi } from "@/lib/api";
import { useAuthStore, useMessageStore } from "@/lib/store";
import { ContextMenu, useContextMenu, ContextMenuItem } from "@/components/ui/ContextMenu";
import MessageContent from "./MessageContent";
import UserProfileCard from "@/components/user/UserProfileCard";
import EmojiPickerButton from "./EmojiPickerButton";
import { Edit, Trash2, Reply, Pin, Copy, Hash, Link, Bookmark, Flag, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface MessageAuthor {
  id: string;
  username: string;
  avatar_url?: string | null;
  discriminator?: string;
}

interface MessageData {
  id: string;
  author_id: string;
  author: MessageAuthor;
  content: string;
  timestamp: number;
  edited_at?: number | null;
  reactions: { emoji: string; count: number; me: boolean }[];
  attachments: { id: string; url: string; filename: string; content_type: string; width?: number; height?: number }[];
  reply_to?: MessageData | null;
  pending?: boolean;
}

interface Props {
  message: MessageData;
  channelId: string;
  prevMessage?: MessageData;
  onReply?: (msg: MessageData) => void;
}

// Format timestamp like Discord
function formatTime(ts: number): string {
  const d = new Date(ts);
  if (isToday(d)) return `Today at ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `Yesterday at ${format(d, "h:mm a")}`;
  return format(d, "MM/dd/yyyy h:mm a");
}

// Show short time for grouped messages (same author, < 7 mins apart)
function formatShort(ts: number): string {
  return format(new Date(ts), "h:mm a");
}

export default function MessageItem({ message: msg, channelId, prevMessage, onReply }: Props) {
  const { user } = useAuthStore();
  const { deleteMessage, editMessage, addReaction, removeReaction } = useMessageStore();

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [hovering, setHovering] = useState(false);
  const [profileCardUser, setProfileCardUser] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showEmojiReact, setShowEmojiReact] = useState(false);

  const { menu, open: openCtx, close: closeCtx } = useContextMenu();

  const isOwn = msg.author_id === user?.id;

  // Group with previous message (show compact — no avatar/name)
  const prevSameAuthor = prevMessage?.author_id === msg.author_id;
  const prevCloseEnough = Math.abs((msg.timestamp) - (prevMessage?.timestamp ?? 0)) < 7 * 60 * 1000;
  const grouped = prevSameAuthor && prevCloseEnough && !msg.reply_to;

  // ── Context menu items ───────────────────────────────────────────────────
  const buildContextMenu = useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: "react", label: "Add Reaction",
        icon: <Smile size={14} />,
        onClick: () => setShowEmojiReact(true),
      },
      {
        id: "reply", label: "Reply",
        icon: <Reply size={14} />,
        onClick: () => onReply?.(msg),
      },
      {
        id: "copy", label: "Copy Text",
        icon: <Copy size={14} />,
        onClick: () => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); },
        shortcut: "Ctrl+C",
      },
      {
        id: "copy-link", label: "Copy Message Link",
        icon: <Link size={14} />,
        onClick: () => {
          navigator.clipboard.writeText(`${window.location.origin}/channels/${channelId}/${msg.id}`);
          toast.success("Link copied!");
        },
      },
      {
        id: "pin", label: "Pin Message",
        icon: <Pin size={14} />,
        divider: true,
        onClick: () => messagesApi.pin(channelId, msg.id).then(() => toast.success("Pinned!")).catch(() => toast.error("Failed")),
      },
      {
        id: "bookmark", label: "Mark Unread",
        icon: <Bookmark size={14} />,
        onClick: () => toast("Marked unread", { icon: "📌" }),
      },
    ];

    if (isOwn) {
      items.push(
        {
          id: "edit", label: "Edit Message",
          icon: <Edit size={14} />,
          divider: true,
          onClick: () => { setEditing(true); setEditContent(msg.content); },
          shortcut: "E",
        },
        {
          id: "delete", label: "Delete Message",
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => {
            messagesApi.delete(channelId, msg.id)
              .then(() => deleteMessage(channelId, msg.id))
              .catch(() => toast.error("Failed to delete"));
          },
        }
      );
    } else {
      items.push({
        id: "report", label: "Report Message",
        icon: <Flag size={14} />,
        divider: true, danger: true,
        onClick: () => toast("Message reported", { icon: "🚩" }),
      });
    }
    return items;
  }, [msg, channelId, isOwn, onReply, deleteMessage]);

  // ── Edit submit ────────────────────────────────────────────────────────
  const submitEdit = async () => {
    if (editContent.trim() === msg.content) { setEditing(false); return; }
    try {
      await messagesApi.edit(channelId, msg.id, { content: editContent.trim() });
      editMessage(channelId, msg.id, editContent.trim());
    } catch { toast.error("Failed to edit"); }
    setEditing(false);
  };

  // ── Reaction toggle ────────────────────────────────────────────────────
  const toggleReaction = async (emoji: string) => {
    const existing = msg.reactions.find(r => r.emoji === emoji);
    if (existing?.me) {
      await messagesApi.removeReaction(channelId, msg.id, encodeURIComponent(emoji));
      removeReaction(channelId, msg.id, emoji);
    } else {
      await messagesApi.addReaction(channelId, msg.id, encodeURIComponent(emoji));
      addReaction(channelId, msg.id, emoji, true);
    }
  };

  return (
    <>
      <div
        id={`msg-${msg.id}`}
        onContextMenu={(e) => openCtx(e, buildContextMenu())}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { setHovering(false); setShowEmojiReact(false); }}
        className={cn(
          "group relative flex items-start gap-4 px-4 hover:bg-[#1e2035]/60 transition-colors",
          grouped ? "py-0.5" : "pt-4 pb-0.5",
          msg.pending && "opacity-60",
        )}
      >
        {/* Avatar / time gutter */}
        <div className="w-10 flex-shrink-0 flex justify-center">
          {grouped ? (
            <span className="text-[10px] text-[#5c6080] mt-[3px] opacity-0 group-hover:opacity-100 transition-opacity select-none">
              {formatShort(msg.timestamp)}
            </span>
          ) : (
            <button
              onClick={(e) => setProfileCardUser({ id: msg.author_id, x: e.clientX, y: e.clientY })}
              className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-0 hover:ring-2 ring-[#5865f2] transition-all"
            >
              {msg.author.avatar_url ? (
                <Image src={msg.author.avatar_url} alt="" width={40} height={40} className="object-cover" />
              ) : (
                <div className="w-10 h-10 bg-[#5865f2] flex items-center justify-center text-white font-bold">
                  {msg.author.username[0]?.toUpperCase()}
                </div>
              )}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          {/* Author + timestamp */}
          {!grouped && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <button
                onClick={(e) => setProfileCardUser({ id: msg.author_id, x: e.clientX, y: e.clientY })}
                className="font-semibold text-[#dcdbf0] hover:underline text-sm leading-none"
              >
                {msg.author.username}
              </button>
              <span className="text-[10px] text-[#5c6080]">{formatTime(msg.timestamp)}</span>
              {msg.pending && <span className="text-[10px] text-[#fee75c]">Sending…</span>}
            </div>
          )}

          {/* Reply context */}
          {msg.reply_to && (
            <div className="flex items-center gap-2 text-sm text-[#8b8fad] mb-1">
              <div className="w-4 h-4 border-t-2 border-l-2 border-[#4e5058] rounded-tl-sm ml-2 self-end flex-shrink-0" />
              <span className="font-medium text-[#dcdbf0]">{msg.reply_to.author.username}</span>
              <span className="truncate line-clamp-1">{msg.reply_to.content.slice(0, 60)}</span>
            </div>
          )}

          {/* Message content */}
          {editing ? (
            <div className="mt-1">
              <textarea
                autoFocus
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                  if (e.key === "Escape") setEditing(false);
                }}
                className="w-full bg-[#1e2035] text-[#dcdbf0] rounded-lg p-2 text-sm outline-none border border-[#5865f2] resize-none"
                rows={2}
              />
              <p className="text-[10px] text-[#8b8fad] mt-1">
                <kbd className="bg-[#2e3150] px-1 rounded">Enter</kbd> save ·{" "}
                <kbd className="bg-[#2e3150] px-1 rounded">Esc</kbd> cancel
              </p>
            </div>
          ) : (
            <MessageContent content={msg.content} />
          )}

          {/* Edited indicator */}
          {msg.edited_at && !editing && (
            <span className="text-[10px] text-[#5c6080] ml-1">(edited)</span>
          )}

          {/* Attachments */}
          {msg.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {msg.attachments.map(att => (
                <div key={att.id}>
                  {att.content_type.startsWith("image/") ? (
                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={att.url}
                        alt={att.filename}
                        width={att.width ?? 300}
                        height={att.height ?? 200}
                        className="max-w-[400px] max-h-[300px] object-cover rounded-xl hover:brightness-90 transition-all cursor-pointer"
                      />
                    </a>
                  ) : (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-[#1e2035] border border-[#2e3150] rounded-lg px-3 py-2 hover:bg-[#252840] transition-colors"
                    >
                      <Hash size={16} className="text-[#8b8fad]" />
                      <span className="text-sm text-[#00aff4] hover:underline">{att.filename}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reactions */}
          {msg.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {msg.reactions.map(r => (
                <button
                  key={r.emoji}
                  onClick={() => toggleReaction(r.emoji)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border transition-colors",
                    r.me
                      ? "bg-[#5865f2]/20 border-[#5865f2] text-[#5865f2]"
                      : "bg-[#1e2035] border-[#2e3150] text-[#dcdbf0] hover:border-[#5865f2]"
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="text-xs font-medium">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hover toolbar — Discord-style */}
        {hovering && !editing && (
          <div className="absolute right-4 top-0 -translate-y-1/2 flex items-center gap-0.5 bg-[#1e2035] border border-[#2e3150] rounded-lg shadow-lg px-1 py-1 z-10">
            <EmojiPickerButton
              onSelect={emoji => toggleReaction(emoji)}
              buttonClassName="p-1.5 text-[#8b8fad] hover:text-[#fee75c]"
            />
            <TipBtn icon={<Reply size={15} />}    tip="Reply"         onClick={() => onReply?.(msg)} />
            {isOwn && <TipBtn icon={<Edit size={15} />} tip="Edit"  onClick={() => { setEditing(true); setEditContent(msg.content); }} />}
            <TipBtn icon={<Pin size={15} />}      tip="Pin"          onClick={() => messagesApi.pin(channelId, msg.id).catch(() => {})} />
            {isOwn && (
              <TipBtn icon={<Trash2 size={15} />} tip="Delete" danger
                onClick={() => messagesApi.delete(channelId, msg.id).then(() => deleteMessage(channelId, msg.id))} />
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {menu && <ContextMenu {...menu} onClose={closeCtx} />}

      {/* User profile popup */}
      {profileCardUser && (
        <UserProfileCard
          userId={profileCardUser.id}
          position={{ x: profileCardUser.x, y: profileCardUser.y }}
          onClose={() => setProfileCardUser(null)}
        />
      )}
    </>
  );
}

function TipBtn({ icon, tip, onClick, danger = false }: { icon: React.ReactNode; tip: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={tip}
      className={cn(
        "w-7 h-7 flex items-center justify-center rounded transition-colors",
        danger ? "text-[#8b8fad] hover:text-[#ed4245] hover:bg-[#ed4245]/10"
               : "text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150]"
      )}
    >
      {icon}
    </button>
  );
}
