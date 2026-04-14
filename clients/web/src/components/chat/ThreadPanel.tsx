"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { messagesApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Hash, X, MessageSquare, Send, Users, Loader2 } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import MessageContent from "@/components/chat/MessageContent";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface SourceMessage {
  id: string;
  content: string;
  author: { id: string; username: string; avatar_url?: string | null };
  timestamp: number;
}

interface Props {
  channelId: string;
  threadId?: string;
  sourceMessage: SourceMessage;
  onClose: () => void;
}

export default function ThreadPanel({ channelId, threadId, sourceMessage, onClose }: Props) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch or create thread
  const { data: thread, isLoading: creating } = useQuery({
    queryKey: ["thread", sourceMessage.id],
    queryFn: async () => {
      // If threadId provided, fetch that thread's messages
      if (threadId) {
        const { data } = await messagesApi.list(threadId, { limit: 50 });
        return { id: threadId, messages: data };
      }
      // Otherwise create new thread
      const { data } = await messagesApi.createThread(channelId, sourceMessage.id, {
        name: sourceMessage.content.slice(0, 50) || "Thread",
        auto_archive_duration: 1440, // 24h
      });
      return { id: data.id, messages: [] };
    },
    staleTime: 0,
  });

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["thread-messages", thread?.id],
    queryFn: () => thread?.id
      ? messagesApi.list(thread.id, { limit: 50 }).then(r => r.data)
      : Promise.resolve([]),
    enabled: !!thread?.id,
    refetchInterval: 3000,
  });

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMsg = async () => {
    if (!reply.trim() || !thread?.id) return;
    const text = reply.trim();
    setReply("");
    try {
      await messagesApi.send(thread.id, { content: text });
      qc.invalidateQueries({ queryKey: ["thread-messages", thread.id] });
    } catch { toast.error("Failed to send"); }
  };

  return (
    <div className="w-72 bg-[#1e2035] flex flex-col h-full border-l border-[#111827]">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#111827] flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#8b8fad]" />
          <span className="font-semibold text-[#dcdbf0] text-sm">Thread</span>
          {messages.length > 0 && (
            <span className="text-xs text-[#8b8fad]">· {messages.length} repl{messages.length !== 1 ? "ies" : "y"}</span>
          )}
        </div>
        <button onClick={onClose} className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Source message */}
      <div className="px-3 py-3 border-b border-[#2e3150] bg-[#252840]">
        <div className="flex items-start gap-2">
          {sourceMessage.author.avatar_url ? (
            <Image src={sourceMessage.author.avatar_url} alt="" width={24} height={24}
              className="rounded-full flex-shrink-0 mt-0.5" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-[#5865f2] flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
              {sourceMessage.author.username[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-semibold text-[#dcdbf0]">{sourceMessage.author.username}</span>
              <span className="text-[10px] text-[#5c6080]">{format(new Date(sourceMessage.timestamp), "h:mm a")}</span>
            </div>
            <div className="text-xs text-[#8b8fad] line-clamp-3">
              <MessageContent content={sourceMessage.content} compact />
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-3 scroll-y">
        {(creating || loadingMsgs) && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="text-[#5865f2] animate-spin" />
          </div>
        )}

        {messages.map((msg: any) => (
          <div key={msg.id} className="flex items-start gap-2 group">
            {msg.author?.avatar_url ? (
              <Image src={msg.author.avatar_url} alt="" width={28} height={28}
                className="rounded-full flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {msg.author?.username?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-xs font-semibold text-[#dcdbf0]">{msg.author?.username}</span>
                <span className="text-[10px] text-[#5c6080]">{format(new Date(msg.timestamp), "h:mm a")}</span>
              </div>
              <div className="text-sm text-[#dcdbf0]">
                <MessageContent content={msg.content} compact />
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 flex-shrink-0">
        <div className="flex items-end gap-2 bg-[#252840] rounded-xl px-3 py-2.5 border border-[#2e3150] focus-within:border-[#5865f2]/50 transition-colors">
          <textarea
            ref={inputRef}
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
            }}
            placeholder="Reply in thread…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-[#dcdbf0] placeholder-[#5c6080] outline-none resize-none leading-6"
          />
          {reply.trim() && (
            <button onClick={sendMsg}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white transition-colors flex-shrink-0">
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
