import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  discriminator: string;
  email: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  status: "online" | "idle" | "dnd" | "offline";
  custom_status?: string;
  is_bot: boolean;
}

export interface Guild {
  id: string;
  name: string;
  icon_url?: string;
  banner_url?: string;
  description?: string;
  owner_id: string;
  member_count: number;
}

export interface Channel {
  id: string;
  guild_id: string;
  name: string;
  type: 0 | 1 | 2 | 3 | 4 | 5; // text|dm|voice|group|category|forum
  position: number;
  parent_id?: string;
  topic?: string;
  nsfw: boolean;
  bitrate?: number;
  user_limit?: number;
}

export interface Message {
  id: string;
  channel_id: string;
  guild_id?: string;
  author_id: string;
  author?: User;
  content: string;
  timestamp: number;
  edited_at?: number;
  reactions: { emoji: string; count: number; me: boolean }[];
  attachments: Attachment[];
  embeds: Embed[];
  reply_to?: Message;
  mention_everyone: boolean;
  mentions: string[];
  pending?: boolean; // optimistic
}

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  content_type: string;
  width?: number;
  height?: number;
  thumbnail_url?: string;
}

export interface Embed {
  type: string;
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  image?: { url: string; width?: number; height?: number };
  thumbnail?: { url: string };
  author?: { name: string; icon_url?: string };
  footer?: { text: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

export interface VoiceState {
  user_id: string;
  channel_id?: string;
  guild_id?: string;
  self_mute: boolean;
  self_deaf: boolean;
  self_video: boolean;
  self_stream: boolean;
  server_mute: boolean;
  server_deaf: boolean;
}

export interface Member {
  user_id: string;
  user?: User;
  nickname?: string;
  roles: string[];
  joined_at: string;
  muted: boolean;
  deafened: boolean;
}

// ─── Auth Store ────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, access: string, refresh: string) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: "discord-auth" }
  )
);

// ─── UI Store ──────────────────────────────────────────────────────────────

interface UIState {
  activeGuildId: string | null;
  activeChannelId: string | null;
  mobileSidebarOpen: boolean;
  memberListOpen: boolean;
  settingsOpen: boolean;
  settingsPage: string;
  settingsTab: string;
  setActiveGuild: (id: string | null) => void;
  setActiveChannel: (id: string | null) => void;
  toggleMobileSidebar: () => void;
  toggleMemberList: () => void;
  openSettings: (page?: string) => void;
  closeSettings: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeGuildId: null,
  activeChannelId: null,
  mobileSidebarOpen: false,
  memberListOpen: true,
  settingsOpen: false,
  settingsPage: "my-account",
  settingsTab: "my-account",
  setActiveGuild: (id) => set({ activeGuildId: id, activeChannelId: null }),
  setActiveChannel: (id) => set({ activeChannelId: id }),
  toggleMobileSidebar: () =>
    set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
  toggleMemberList: () => set((s) => ({ memberListOpen: !s.memberListOpen })),
  openSettings: (page = "my-account") =>
    set({ settingsOpen: true, settingsPage: page, settingsTab: page }),
  closeSettings: () => set({ settingsOpen: false }),
}));

// ─── Guild Store ───────────────────────────────────────────────────────────

interface GuildState {
  guilds: Guild[];
  setGuilds: (guilds: Guild[]) => void;
  addGuild: (guild: Guild) => void;
  updateGuild: (id: string, patch: Partial<Guild>) => void;
  removeGuild: (id: string) => void;
}

export const useGuildStore = create<GuildState>((set) => ({
  guilds: [],
  setGuilds: (guilds) => set({ guilds }),
  addGuild: (guild) => set((s) => ({ guilds: [...s.guilds, guild] })),
  updateGuild: (id, patch) =>
    set((s) => ({
      guilds: s.guilds.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),
  removeGuild: (id) =>
    set((s) => ({ guilds: s.guilds.filter((g) => g.id !== id) })),
}));

// ─── Channel Store ─────────────────────────────────────────────────────────

interface ChannelState {
  channels: Record<string, Channel[]>; // guild_id → channels
  activeChannelId: string | null;
  setChannels: (guildId: string, channels: Channel[]) => void;
  addChannel: (guildId: string, channel: Channel) => void;
  removeChannel: (guildId: string, channelId: string) => void;
  setActiveChannel: (channelId: string | null) => void;
}

export const useChannelStore = create<ChannelState>((set) => ({
  channels: {},
  activeChannelId: null,
  setChannels: (guildId, channels) =>
    set((s) => ({ channels: { ...s.channels, [guildId]: channels } })),
  addChannel: (guildId, channel) =>
    set((s) => ({
      channels: {
        ...s.channels,
        [guildId]: [...(s.channels[guildId] ?? []), channel],
      },
    })),
  removeChannel: (guildId, channelId) =>
    set((s) => ({
      channels: {
        ...s.channels,
        [guildId]: (s.channels[guildId] ?? []).filter(
          (c) => c.id !== channelId
        ),
      },
    })),
  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
}));

// ─── Message Store ─────────────────────────────────────────────────────────

interface MessageState {
  messages: Record<string, Message[]>; // channel_id → messages
  typingUsers: Record<string, Record<string, number>>; // channel_id → {user_id: timestamp}
  setMessages: (channelId: string, messages: Message[]) => void;
  prependMessages: (channelId: string, messages: Message[]) => void;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, msgId: string, patch: Partial<Message>) => void;
  deleteMessage: (channelId: string, msgId: string) => void;
  setTyping: (channelId: string, userId: string) => void;
  clearTyping: (channelId: string, userId: string) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: {},
  typingUsers: {},
  setMessages: (channelId, messages) =>
    set((s) => ({ messages: { ...s.messages, [channelId]: messages } })),
  prependMessages: (channelId, older) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: [...older, ...(s.messages[channelId] ?? [])],
      },
    })),
  addMessage: (channelId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: [...(s.messages[channelId] ?? []), message],
      },
    })),
  updateMessage: (channelId, msgId, patch) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).map((m) =>
          m.id === msgId ? { ...m, ...patch } : m
        ),
      },
    })),
  deleteMessage: (channelId, msgId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).filter(
          (m) => m.id !== msgId
        ),
      },
    })),
  setTyping: (channelId, userId) =>
    set((s) => ({
      typingUsers: {
        ...s.typingUsers,
        [channelId]: { ...(s.typingUsers[channelId] ?? {}), [userId]: Date.now() },
      },
    })),
  clearTyping: (channelId, userId) =>
    set((s) => {
      const ch = { ...(s.typingUsers[channelId] ?? {}) };
      delete ch[userId];
      return { typingUsers: { ...s.typingUsers, [channelId]: ch } };
    }),
}));

// ─── Voice Store ───────────────────────────────────────────────────────────

interface VoiceState2 {
  voiceStates: Record<string, VoiceState>; // user_id → state
  // Aliases for VoiceBar / UserPanel
  connected: boolean;
  channelId: string | null;
  currentChannelId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  setVoiceState: (userId: string, state: VoiceState) => void;
  joinVoice: (channelId: string) => void;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeaf: () => void;
  toggleVideo: () => void;
}

export const useVoiceStore = create<VoiceState2>((set) => ({
  voiceStates: {},
  connected: false,
  channelId: null,
  currentChannelId: null,
  selfMute: false,
  selfDeaf: false,
  selfVideo: false,
  setVoiceState: (userId, state) =>
    set((s) => ({ voiceStates: { ...s.voiceStates, [userId]: state } })),
  joinVoice: (channelId) => set({ currentChannelId: channelId, channelId, connected: true }),
  leaveVoice: () => set({ currentChannelId: null, channelId: null, connected: false, selfMute: false, selfDeaf: false, selfVideo: false }),
  toggleMute: () => set((s) => ({ selfMute: !s.selfMute })),
  toggleDeaf: () => set((s) => ({ selfDeaf: !s.selfDeaf })),
  toggleVideo: () => set((s) => ({ selfVideo: !s.selfVideo })),
}));
