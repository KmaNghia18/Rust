"use client";
import { create } from "zustand";

// ─── Unread Store ───────────────────────────────────────────────────────────
// Tracks unread message counts and mention counts per channel/guild

interface UnreadEntry {
  count: number;        // total unread messages
  mentionCount: number; // @me or @everyone mentions
  lastReadId?: string;  // last read message ID
}

interface UnreadState {
  // channel_id → entry
  channels: Record<string, UnreadEntry>;
  // guild_id → total mention count (sum of channel mentions)
  guildMentions: Record<string, number>;

  // Actions
  increment: (channelId: string, guildId: string | undefined, isMention: boolean) => void;
  markRead: (channelId: string, guildId: string | undefined, lastReadId?: string) => void;
  clearChannel: (channelId: string) => void;
  getTotalMentions: (guildId: string) => number;
  getChannelUnread: (channelId: string) => UnreadEntry;
  hasUnread: (channelId: string) => boolean;
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  channels: {},
  guildMentions: {},

  increment: (channelId, guildId, isMention) =>
    set((s) => {
      const prev = s.channels[channelId] ?? { count: 0, mentionCount: 0 };
      const updated = {
        ...prev,
        count: prev.count + 1,
        mentionCount: prev.mentionCount + (isMention ? 1 : 0),
      };
      const guildMentions = { ...s.guildMentions };
      if (guildId && isMention) {
        guildMentions[guildId] = (guildMentions[guildId] ?? 0) + 1;
      }
      return {
        channels: { ...s.channels, [channelId]: updated },
        guildMentions,
      };
    }),

  markRead: (channelId, guildId, lastReadId) =>
    set((s) => {
      const prev = s.channels[channelId];
      const guildMentions = { ...s.guildMentions };
      if (guildId && prev?.mentionCount) {
        guildMentions[guildId] = Math.max(0, (guildMentions[guildId] ?? 0) - prev.mentionCount);
      }
      return {
        channels: {
          ...s.channels,
          [channelId]: { count: 0, mentionCount: 0, lastReadId },
        },
        guildMentions,
      };
    }),

  clearChannel: (channelId) =>
    set((s) => {
      const { [channelId]: _, ...rest } = s.channels;
      return { channels: rest };
    }),

  getTotalMentions: (guildId) => get().guildMentions[guildId] ?? 0,
  getChannelUnread: (channelId) => get().channels[channelId] ?? { count: 0, mentionCount: 0 },
  hasUnread: (channelId) => (get().channels[channelId]?.count ?? 0) > 0,
}));
