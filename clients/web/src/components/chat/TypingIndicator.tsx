"use client";
import { useMessageStore, useAuthStore } from "@/lib/store";

interface Props { channelId: string }

export default function TypingIndicator({ channelId }: Props) {
  const { typingUsers } = useMessageStore();
  const { user } = useAuthStore();

  const now = Date.now();
  const typers = Object.entries(typingUsers[channelId] ?? {})
    .filter(([uid, ts]) => uid !== user?.id && now - ts < 8000)
    .map(([uid]) => uid);

  if (typers.length === 0) return null;

  const label =
    typers.length === 1
      ? `Someone is typing`
      : typers.length < 4
      ? `${typers.length} people are typing`
      : "Several people are typing";

  return (
    <div className="px-4 h-6 flex items-center gap-2 text-xs text-[#8b8fad]">
      <span className="flex gap-[3px] items-end">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[6px] h-[6px] rounded-full bg-[#8b8fad] animate-typing"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </span>
      <span><strong className="font-semibold text-[#dcdbf0]">{label}</strong></span>
    </div>
  );
}
