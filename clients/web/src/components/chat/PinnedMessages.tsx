"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { messagesApi } from "@/lib/api";
import { Pin, X, Hash, ArrowRight } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import MessageContent from "@/components/chat/MessageContent";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface Props {
  channelId: string;
  channelName: string;
  onClose: () => void;
}

export default function PinnedMessages({ channelId, channelName, onClose }: Props) {
  const qc = useQueryClient();

  const { data: pins = [], isLoading } = useQuery({
    queryKey: ["pins", channelId],
    queryFn: () => messagesApi.getPins(channelId).then(r => r.data),
  });

  const unpin = useMutation({
    mutationFn: (msgId: string) => messagesApi.unpin(channelId, msgId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pins", channelId] }); toast.success("Unpinned!"); },
    onError: () => toast.error("Failed to unpin"),
  });

  return (
    <div className="w-64 bg-[#1e2035] flex flex-col h-full border-l border-[#111827]">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#111827] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Pin size={16} className="text-[#8b8fad]" />
          <span className="font-semibold text-[#dcdbf0] text-sm">Pinned Messages</span>
        </div>
        <button onClick={onClose} className="text-[#8b8fad] hover:text-[#dcdbf0] transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2 scroll-y">
        {isLoading && (
          <div className="space-y-3 px-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[#252840] rounded-xl p-3 space-y-2">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-2 w-full rounded" />
                <div className="skeleton h-2 w-3/4 rounded" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && pins.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 bg-[#252840] rounded-full flex items-center justify-center mb-3">
              <Pin size={28} className="text-[#5c6080]" />
            </div>
            <p className="text-sm font-semibold text-[#5c6080]">No pins yet!</p>
            <p className="text-xs text-[#5c6080] mt-1">
              Right-click a message and select <strong className="text-[#8b8fad]">Pin Message</strong> to pin it here.
            </p>
          </div>
        )}

        {!isLoading && pins.map((pin: any) => (
          <div
            key={pin.id}
            className="mx-2 mb-2 bg-[#252840] rounded-xl border border-[#2e3150] hover:border-[#5865f2]/50 transition-colors group"
          >
            <div className="p-3">
              {/* Author */}
              <div className="flex items-center gap-2 mb-2">
                {pin.author?.avatar_url ? (
                  <Image src={pin.author.avatar_url} alt="" width={20} height={20} className="rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#5865f2] flex items-center justify-center text-[10px] font-bold text-white">
                    {pin.author?.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-semibold text-[#dcdbf0]">{pin.author?.username}</span>
                <span className="text-[10px] text-[#5c6080] ml-auto">
                  {format(new Date(pin.timestamp), "MM/dd/yyyy")}
                </span>
              </div>

              {/* Content preview */}
              <div className="text-xs text-[#8b8fad] line-clamp-4">
                <MessageContent content={pin.content} compact />
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#2e3150]">
              <button
                onClick={() => {
                  const el = document.getElementById(`msg-${pin.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.classList.add("flash-highlight");
                  setTimeout(() => el?.classList.remove("flash-highlight"), 1500);
                  onClose();
                }}
                className="text-[10px] text-[#5865f2] hover:underline flex items-center gap-1"
              >
                Jump to Message <ArrowRight size={10} />
              </button>
              <button
                onClick={() => unpin.mutate(pin.id)}
                className="text-[10px] text-[#8b8fad] hover:text-[#ed4245] transition-colors"
              >
                Unpin
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
