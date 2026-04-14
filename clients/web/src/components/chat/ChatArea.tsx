"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { messagesApi } from "@/lib/api";
import { useMessageStore, useChannelStore, useUIStore, useGuildStore } from "@/lib/store";
import { useUnreadStore } from "@/lib/unread";
import MessageItem from "./MessageItem";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import PinnedMessages from "./PinnedMessages";
import SearchOverlay from "./SearchOverlay";
import {
  Hash, Volume2, Pin, Search, Bell, BellOff, Inbox,
  Users, ChevronDown, AtSign
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReplyState { id: string; author: string; content: string }

export default function ChatArea() {
  const { activeChannelId } = useChannelStore();
  const { activeGuildId } = useGuildStore();
  const { messages } = useMessageStore();
  const { channels } = useChannelStore();
  const { getChannelUnread, markRead } = useUnreadStore();

  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [reply, setReply] = useState<ReplyState | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [lastReadMsgId, setLastReadMsgId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const channel = Object.values(channels).flat().find(c => c.id === activeChannelId);
  const channelMessages = messages[activeChannelId ?? ""] ?? [];
  const unread = getChannelUnread(activeChannelId ?? "");

  // ── Keyboard shortcut: Ctrl+F → search ──────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // ── Infinite load older messages ─────────────────────────────────────────
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["messages", activeChannelId],
    queryFn: ({ pageParam }) =>
      messagesApi.list(activeChannelId!, { before: pageParam as string, limit: 50 })
        .then(r => r.data),
    getNextPageParam: (last: any[]) => last.length === 50 ? last[last.length - 1]?.id : undefined,
    initialPageParam: undefined,
    enabled: !!activeChannelId,
  });

  // ── Scroll detection ─────────────────────────────────────────────────────
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setNewMessagesCount(0);
      markRead(activeChannelId ?? "", activeGuildId ?? undefined);
    }
    if (el.scrollTop < 200 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, activeChannelId, activeGuildId, markRead]);

  // ── Auto-scroll on new message if at bottom ──────────────────────────────
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setNewMessagesCount(c => c + 1);
    }
  }, [channelMessages.length]);

  // ── Mark read on channel switch ──────────────────────────────────────────
  useEffect(() => {
    const lastMsg = channelMessages.at(-1);
    setLastReadMsgId(lastMsg?.id ?? null);
    setNewMessagesCount(0);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }, [activeChannelId]);

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#252840]">
        <div className="text-center">
          <Hash size={72} className="text-[#2e3150] mx-auto mb-4" />
          <p className="text-2xl font-bold text-[#5c6080]">Select a channel</p>
          <p className="text-[#5c6080] mt-1">Choose a channel from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  const isVoice = channel?.type === 2;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Channel header */}
        <header className="h-12 flex items-center px-4 gap-3 border-b border-[#111827] flex-shrink-0 bg-[#252840] z-10">
          {/* Channel icon + name */}
          <div className="flex items-center gap-2 flex-1">
            {channel?.type === 2
              ? <Volume2 size={20} className="text-[#8b8fad]" />
              : <Hash size={20} className="text-[#8b8fad]" />
            }
            <span className="font-bold text-[#dcdbf0]">{channel?.name}</span>
            {channel?.topic && (
              <>
                <div className="w-[1px] h-4 bg-[#2e3150]" />
                <span className="text-xs text-[#8b8fad] truncate max-w-xs">{channel.topic}</span>
              </>
            )}
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-1">
            <HeaderBtn icon={<Bell size={18} />}    tip="Notification Settings" />
            <HeaderBtn
              icon={<Pin size={18} />}
              tip="Pinned Messages"
              active={showPins}
              onClick={() => { setShowPins(!showPins); }}
            />
            <HeaderBtn
              icon={<Users size={18} />}
              tip="Member List"
              active={showMembers}
              onClick={() => setShowMembers(!showMembers)}
            />
            <div className="flex items-center gap-1 bg-[#1e2035] rounded-lg px-2 py-1 ml-1 cursor-pointer hover:bg-[#2e3150]"
              onClick={() => setShowSearch(true)}
            >
              <Search size={14} className="text-[#8b8fad]" />
              <span className="text-xs text-[#5c6080] w-24">Search…</span>
              <kbd className="text-[9px] bg-[#252840] px-1 rounded text-[#5c6080]">Ctrl+F</kbd>
            </div>
            <HeaderBtn icon={<Inbox size={18} />}   tip="Inbox" />
          </div>
        </header>

        {/* Messages list */}
        <div ref={scrollRef} onScroll={onScroll}
          className="flex-1 overflow-y-auto scroll-y flex flex-col"
        >
          {/* Load more indicator */}
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Channel welcome message */}
          {!hasNextPage && channelMessages.length > 0 && (
            <div className="px-4 pt-12 pb-4">
              <div className="w-14 h-14 rounded-full bg-[#2e3150] flex items-center justify-center mb-4">
                <Hash size={28} className="text-[#dcdbf0]" />
              </div>
              <p className="text-3xl font-black text-[#dcdbf0] mb-2">Welcome to #{channel?.name}!</p>
              {channel?.topic && <p className="text-[#8b8fad]">{channel.topic}</p>}
              <p className="text-sm text-[#5c6080] mt-2">This is the start of the #{channel?.name} channel.</p>
            </div>
          )}

          {/* Messages */}
          {channelMessages.map((msg, i) => {
            const isLastRead = lastReadMsgId && channelMessages[i - 1]?.id === lastReadMsgId && !isAtBottom;
            return (
              <div key={msg.id}>
                {/* New messages divider */}
                {isLastRead && (
                  <div className="flex items-center gap-3 px-4 py-1 my-2">
                    <div className="flex-1 h-[1px] bg-[#ed4245]" />
                    <span className="text-[10px] font-bold text-[#ed4245] uppercase tracking-wider whitespace-nowrap">
                      New Messages
                    </span>
                    <div className="flex-1 h-[1px] bg-[#ed4245]" />
                  </div>
                )}
                <MessageItem
                  message={msg as any}
                  channelId={activeChannelId}
                  prevMessage={channelMessages[i - 1] as any}
                  onReply={m => setReply({ id: m.id, author: m.author.username, content: m.content })}
                />
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* Scroll-to-bottom button */}
        {!isAtBottom && (
          <div className="absolute bottom-24 right-8 z-10">
            <button
              onClick={() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                setIsAtBottom(true);
              }}
              className="flex items-center gap-2 bg-[#5865f2] text-white text-xs font-semibold rounded-full px-4 py-2 shadow-lg hover:bg-[#4752c4] transition-colors"
            >
              <ChevronDown size={14} />
              {newMessagesCount > 0 ? `${newMessagesCount} new message${newMessagesCount > 1 ? "s" : ""}` : "Jump to present"}
            </button>
          </div>
        )}

        {/* Reply preview */}
        {reply && (
          <div className="flex items-center gap-3 px-4 py-2 bg-[#252840] border-t border-[#2e3150] text-sm">
            <AtSign size={14} className="text-[#5865f2] flex-shrink-0" />
            <span className="text-[#8b8fad]">Replying to</span>
            <span className="font-semibold text-[#dcdbf0]">{reply.author}</span>
            <span className="text-[#8b8fad] truncate flex-1">{reply.content.slice(0, 60)}</span>
            <button onClick={() => setReply(null)} className="text-[#8b8fad] hover:text-[#dcdbf0]">✕</button>
          </div>
        )}

        <TypingIndicator channelId={activeChannelId} />
        <MessageInput channelId={activeChannelId} />
      </div>

      {/* Pinned panel */}
      {showPins && channel && (
        <PinnedMessages
          channelId={activeChannelId}
          channelName={channel.name}
          onClose={() => setShowPins(false)}
        />
      )}

      {/* Search overlay */}
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
    </div>
  );
}

function HeaderBtn({ icon, tip, active = false, onClick }: {
  icon: React.ReactNode; tip: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={tip}
      className={cn(
        "p-1.5 rounded transition-colors",
        active ? "text-[#dcdbf0]" : "text-[#8b8fad] hover:text-[#dcdbf0]"
      )}
    >
      {icon}
    </button>
  );
}
