"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { messagesApi, channelsApi } from "@/lib/api";
import { useUIStore, useMessageStore, useAuthStore } from "@/lib/store";
import { Hash, AtSign, Bell, Pin, Search, Inbox, HelpCircle, Loader2 } from "lucide-react";
import MessageItem from "./MessageItem";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import { cn } from "@/lib/utils";

export default function ChatArea() {
  const { activeChannelId, activeGuildId } = useUIStore();
  const { messages, setMessages, prependMessages } = useMessageStore();
  const { user } = useAuthStore();

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fetchingOlder, setFetchingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const channelMessages = messages[activeChannelId ?? ""] ?? [];

  // Fetch channel info
  const { data: channel } = useQuery({
    queryKey: ["channel", activeChannelId],
    queryFn: () => channelsApi.get(activeChannelId!).then((r) => r.data),
    enabled: !!activeChannelId,
  });

  // Fetch initial messages
  const { isLoading } = useQuery({
    queryKey: ["messages", activeChannelId],
    queryFn: async () => {
      const { data } = await messagesApi.list(activeChannelId!, { limit: 50 });
      setMessages(activeChannelId!, data.reverse());
      return data;
    },
    enabled: !!activeChannelId,
  });

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages.length]);

  // Infinite scroll — load older on scroll to top
  const handleScroll = useCallback(async () => {
    const el = scrollRef.current;
    if (!el || fetchingOlder || !hasMore) return;
    if (el.scrollTop < 200) {
      setFetchingOlder(true);
      const oldest = channelMessages[0];
      if (!oldest) { setFetchingOlder(false); return; }
      const { data } = await messagesApi.list(activeChannelId!, {
        before: oldest.id,
        limit: 50,
      });
      if (data.length === 0) setHasMore(false);
      else prependMessages(activeChannelId!, data.reverse());
      setFetchingOlder(false);
    }
  }, [fetchingOlder, hasMore, channelMessages, activeChannelId, prependMessages]);

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#8b8fad] gap-4">
        <div className="w-16 h-16 rounded-full bg-[#1e2035] flex items-center justify-center">
          <Hash size={32} />
        </div>
        <p className="text-lg font-semibold">Select a channel to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <header className="h-12 flex items-center px-4 gap-2 border-b border-[#111827] shadow-sm flex-shrink-0">
        <Hash size={20} className="text-[#8b8fad]" />
        <span className="font-semibold text-[#dcdbf0]">{channel?.name ?? "…"}</span>
        {channel?.topic && (
          <>
            <div className="w-[1px] h-5 bg-[#2e3150] mx-1" />
            <span className="text-sm text-[#8b8fad] truncate">{channel.topic}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 text-[#8b8fad]">
          {[Bell, Pin, Search, Inbox, HelpCircle].map((Icon, i) => (
            <button key={i} className="p-1.5 rounded hover:text-[#dcdbf0] hover:bg-[#2e3150] transition-colors">
              <Icon size={18} />
            </button>
          ))}
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 scroll-y px-4 py-4 flex flex-col gap-[2px]"
      >
        {fetchingOlder && (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="animate-spin text-[#8b8fad]" />
          </div>
        )}

        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonMsg key={i} />)
          : channelMessages.map((msg, i) => {
              const prev = channelMessages[i - 1];
              const compact =
                prev &&
                prev.author_id === msg.author_id &&
                msg.timestamp - prev.timestamp < 5 * 60 * 1000;
              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  compact={compact}
                  isOwn={msg.author_id === user?.id}
                />
              );
            })}

        <div ref={bottomRef} />
      </div>

      <TypingIndicator channelId={activeChannelId} />
      <MessageInput channelId={activeChannelId} />
    </div>
  );
}

function SkeletonMsg() {
  return (
    <div className="flex gap-4 py-2 animate-fadeIn">
      <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex gap-2">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}
