"use client";
import { useState } from "react";
import { channelsApi } from "@/lib/api";
import { useChannelStore, useGuildStore } from "@/lib/store";
import { X, Hash, Volume2, Megaphone, BookOpen, Lock, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Props {
  guildId: string;
  categoryId?: string;
  onClose: () => void;
}

const CHANNEL_TYPES = [
  {
    type: 0, label: "Text Channel", icon: Hash,
    desc: "Send messages, images, GIFs, emoji, opinions, and puns",
  },
  {
    type: 2, label: "Voice Channel", icon: Volume2,
    desc: "Hang out together with voice, video, and screen share",
  },
  {
    type: 5, label: "Announcement Channel", icon: Megaphone,
    desc: "Important updates that other servers can follow",
  },
] as const;

export default function CreateChannelModal({ guildId, categoryId, onClose }: Props) {
  const { addChannel } = useChannelStore();
  const { channels } = useChannelStore();

  const [type, setType] = useState<0 | 2 | 5>(0);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);

  // Slugify channel name like Discord
  const slugify = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 100);

  const handleCreate = async () => {
    const channelName = slugify(name);
    if (!channelName) return;
    setLoading(true);
    try {
      const { data } = await channelsApi.create(guildId, {
        name: channelName,
        type,
        topic: topic.trim() || undefined,
        parent_id: categoryId || undefined,
        nsfw: false,
      });
      addChannel(guildId, data);
      toast.success(`#${channelName} created!`);
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "Failed to create channel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#252840] rounded-2xl w-full max-w-md border border-[#2e3150] shadow-2xl animate-fadeIn">
        {/* Header */}
        <div className="p-6 border-b border-[#2e3150]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#dcdbf0]">Create Channel</h2>
              {categoryId && (
                <p className="text-xs text-[#8b8fad] mt-0.5 flex items-center gap-1">
                  <ChevronDown size={12} /> in a category
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Channel type */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-2">
              Channel Type
            </label>
            <div className="space-y-2">
              {CHANNEL_TYPES.map(ct => (
                <button
                  key={ct.type}
                  onClick={() => setType(ct.type as any)}
                  className={cn("channel-type-card w-full", type === ct.type && "selected")}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                    type === ct.type ? "bg-[#5865f2]/20 text-[#5865f2]" : "bg-[#2e3150] text-[#8b8fad]"
                  )}>
                    <ct.icon size={20} />
                  </div>
                  <div className="text-left">
                    <p className={cn("text-sm font-semibold", type === ct.type ? "text-[#dcdbf0]" : "text-[#8b8fad]")}>
                      {ct.label}
                    </p>
                    <p className="text-xs text-[#5c6080] mt-0.5">{ct.desc}</p>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-auto",
                    type === ct.type ? "border-[#5865f2]" : "border-[#4e5058]"
                  )}>
                    {type === ct.type && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#5865f2]" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Channel name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1.5">
              Channel Name
            </label>
            <div className="flex items-center bg-[#1e2035] border border-[#2e3150] focus-within:border-[#5865f2] rounded-lg px-3 py-2.5 gap-2 transition-colors">
              {type === 0 ? <Hash size={16} className="text-[#8b8fad]" />
               : type === 2 ? <Volume2 size={16} className="text-[#8b8fad]" />
               : <Megaphone size={16} className="text-[#8b8fad]" />}
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="new-channel"
                maxLength={100}
                className="flex-1 bg-transparent text-sm text-[#dcdbf0] outline-none placeholder-[#5c6080]"
              />
            </div>
            {name && (
              <p className="text-xs text-[#5c6080] mt-1">
                Channel: <span className="text-[#8b8fad]">#{slugify(name)}</span>
              </p>
            )}
          </div>

          {/* Topic (text only) */}
          {type === 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1.5">
                Topic <span className="text-[#5c6080] normal-case tracking-normal font-normal">(optional)</span>
              </label>
              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                maxLength={1024}
                rows={2}
                placeholder="Let members know how to use this channel!"
                className="w-full bg-[#1e2035] border border-[#2e3150] focus:border-[#5865f2] rounded-lg px-3 py-2.5 text-sm text-[#dcdbf0] placeholder-[#5c6080] outline-none resize-none transition-colors"
              />
            </div>
          )}

          {/* Private channel toggle */}
          <div className="flex items-start gap-3 bg-[#1e2035] rounded-xl p-4 border border-[#2e3150]">
            <Lock size={20} className={cn("flex-shrink-0 mt-0.5", isPrivate ? "text-[#5865f2]" : "text-[#8b8fad]")} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#dcdbf0]">Private Channel</p>
              <p className="text-xs text-[#8b8fad] mt-0.5">
                Only selected members and roles can view this channel.
              </p>
            </div>
            <Toggle value={isPrivate} onChange={setIsPrivate} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm text-[#8b8fad] hover:text-[#dcdbf0] hover:bg-[#2e3150] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || loading}
              className="px-5 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold rounded-lg flex items-center gap-2 disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Create Channel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn("w-10 h-5 rounded-full relative transition-colors flex-shrink-0",
        value ? "bg-[#5865f2]" : "bg-[#4e5058]")}
    >
      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
        value ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}
