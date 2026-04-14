"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { guildsApi, messagesApi } from "@/lib/api";
import { useGuildStore, useChannelStore } from "@/lib/store";
import { Forward, Hash, Volume2, Search, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import MessageContent from "@/components/chat/MessageContent";

interface SourceMsg {
  id: string;
  content: string;
  author: { username: string; avatar_url?: string | null };
}

interface Props {
  message: SourceMsg;
  onClose: () => void;
}

export default function ForwardMessageModal({ message, onClose }: Props) {
  const { guilds, activeGuildId } = useGuildStore();
  const { channels } = useChannelStore();
  const [search, setSearch] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [forwarding, setForwarding] = useState(false);

  // All channels across all guilds
  const allChannels = guilds.flatMap(guild => {
    const guildChannels = channels[guild.id] ?? [];
    return guildChannels
      .filter(ch => ch.type !== 4 && ch.type !== 2) // text only, no categories/voice
      .map(ch => ({ ...ch, guildName: guild.name, guildId: guild.id }));
  });

  const q = search.toLowerCase();
  const filtered = allChannels.filter(ch =>
    ch.name.toLowerCase().includes(q) || ch.guildName.toLowerCase().includes(q)
  );

  const doForward = async () => {
    if (!selectedChannel) return;
    setForwarding(true);

    const forwardText = [
      comment.trim() ? comment.trim() + "\n\n" : "",
      `> _Forwarded from **${message.author.username}**_`,
      `> ${message.content.split("\n").join("\n> ")}`,
    ].join("\n");

    try {
      await messagesApi.send(selectedChannel, { content: forwardText });
      toast.success("Message forwarded!");
      onClose();
    } catch { toast.error("Failed to forward message"); }
    finally { setForwarding(false); }
  };

  // Group filtered by guild
  const grouped = guilds
    .map(g => ({ guild: g, channels: filtered.filter(ch => ch.guildId === g.id) }))
    .filter(g => g.channels.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#252840] rounded-2xl border border-[#2e3150] w-full max-w-md shadow-2xl animate-fadeIn overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e3150]">
          <div className="flex items-center gap-2">
            <Forward size={18} className="text-[#5865f2]" />
            <h2 className="text-base font-bold text-[#dcdbf0]">Forward Message</h2>
          </div>
          <button onClick={onClose} className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Source message preview */}
        <div className="mx-4 mt-4 p-3 bg-[#1e2035] rounded-xl border border-[#2e3150] border-l-4 border-l-[#5865f2]">
          <p className="text-xs font-semibold text-[#5865f2] mb-1">{message.author.username}</p>
          <div className="text-xs text-[#8b8fad] line-clamp-3">
            <MessageContent content={message.content} compact />
          </div>
        </div>

        {/* Optional comment */}
        <div className="mx-4 mt-3">
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment… (optional)"
            rows={2}
            maxLength={500}
            className="w-full bg-[#1e2035] border border-[#2e3150] focus:border-[#5865f2] rounded-xl px-3 py-2 text-sm text-[#dcdbf0] placeholder-[#5c6080] outline-none resize-none transition-colors"
          />
        </div>

        {/* Search */}
        <div className="mx-4 mt-3 flex items-center gap-2 bg-[#1e2035] border border-[#2e3150] focus-within:border-[#5865f2] rounded-lg px-3 py-2 transition-colors">
          <Search size={14} className="text-[#8b8fad]" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search channels…"
            className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]"
          />
        </div>

        {/* Channel list */}
        <div className="mx-2 my-3 max-h-52 overflow-y-auto scroll-y space-y-0.5">
          {grouped.map(({ guild, channels: gChs }) => (
            <div key={guild.id}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6080] px-3 py-1">{guild.name}</p>
              {gChs.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChannel(ch.id === selectedChannel ? null : ch.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm",
                    ch.id === selectedChannel
                      ? "bg-[#5865f2] text-white"
                      : "text-[#8b8fad] hover:bg-[#2e3150] hover:text-[#dcdbf0]"
                  )}
                >
                  <Hash size={14} className="flex-shrink-0" />
                  <span className="flex-1 text-left truncate">{ch.name}</span>
                  {ch.id === selectedChannel && <Check size={14} className="flex-shrink-0" />}
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-[#5c6080] text-sm py-6">No channels found</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-4 pb-4 justify-end border-t border-[#2e3150] pt-4">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150] rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={doForward}
            disabled={!selectedChannel || forwarding}
            className="flex items-center gap-2 px-5 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold rounded-lg disabled:opacity-60 transition-colors"
          >
            {forwarding ? <Loader2 size={14} className="animate-spin" /> : <Forward size={14} />}
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}
