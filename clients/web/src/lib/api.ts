import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem("refresh_token");
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
          { refresh_token: refresh }
        );
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post("/api/auth/register", data),
  login: (data: { email: string; password: string; totp_code?: string }) =>
    api.post("/api/auth/login", data),
  logout: () => api.post("/api/auth/logout"),
  refreshToken: (refresh_token: string) =>
    api.post("/api/auth/refresh", { refresh_token }),
  getMe: () => api.get("/api/users/@me"),
  updateProfile: (data: Partial<{ username: string; bio: string; status: string; custom_status: string }>) =>
    api.patch("/api/users/@me", data),
  updateMe: (data: Partial<{ username: string; bio: string; status: string; custom_status: string }>) =>
    api.patch("/api/users/@me", data),
};


// ─── Guilds ────────────────────────────────────────────────────────────────

export const guildsApi = {
  list: () => api.get("/api/guilds/@me"),
  get: (id: string) => api.get(`/api/guilds/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post("/api/guilds", data),
  update: (id: string, data: object) => api.patch(`/api/guilds/${id}`, data),
  delete: (id: string) => api.delete(`/api/guilds/${id}`),
  leave: (id: string) => api.post(`/api/guilds/${id}/leave`),
  joinViaInvite: (code: string) => api.post(`/api/invites/${code}`),
  joinByInvite: (code: string) => api.post(`/api/invites/${code}`),
  getInvite: (code: string) => api.get(`/api/invites/${code}`),
  getMembers: (id: string, after?: string) =>
    api.get(`/api/guilds/${id}/members`, { params: { after, limit: 100 } }),
  // Roles
  getRoles: (id: string) => api.get(`/api/guilds/${id}/roles`),
  createRole: (guildId: string, data: { name: string; color: number; permissions: number }) =>
    api.post(`/api/guilds/${guildId}/roles`, data),
  updateRole: (guildId: string, roleId: string, data: object) =>
    api.patch(`/api/guilds/${guildId}/roles/${roleId}`, data),
  deleteRole: (guildId: string, roleId: string) =>
    api.delete(`/api/guilds/${guildId}/roles/${roleId}`),
  updateMemberRoles: (guildId: string, userId: string, roleIds: string[]) =>
    api.patch(`/api/guilds/${guildId}/members/${userId}`, { roles: roleIds }),
  // Bans
  getBans: (id: string) => api.get(`/api/guilds/${id}/bans`),
  banMember: (guildId: string, userId: string, reason?: string) =>
    api.put(`/api/guilds/${guildId}/bans/${userId}`, { reason }),
  unbanMember: (guildId: string, userId: string) =>
    api.delete(`/api/guilds/${guildId}/bans/${userId}`),
  kickMember: (guildId: string, userId: string) =>
    api.delete(`/api/guilds/${guildId}/members/${userId}`),
  // Invites
  getInvites: (guildId: string) => api.get(`/api/guilds/${guildId}/invites`),
  revokeInvite: (code: string) => api.delete(`/api/invites/${code}`),
  // Emojis
  getEmojis: (guildId: string) => api.get(`/api/guilds/${guildId}/emojis`),
  createEmoji: (guildId: string, data: { name: string; image: string }) =>
    api.post(`/api/guilds/${guildId}/emojis`, data),
  deleteEmoji: (guildId: string, emojiId: string) =>
    api.delete(`/api/guilds/${guildId}/emojis/${emojiId}`),
  // Audit log
  getAuditLog: (guildId: string, params?: object) =>
    api.get(`/api/guilds/${guildId}/audit-logs`, { params }),
  removeGuild: (id: string) => api.delete(`/api/guilds/${id}`),
};

// ─── Channels ──────────────────────────────────────────────────────────────

export const channelsApi = {
  list: (guildId: string) => api.get(`/api/guilds/${guildId}/channels`),
  get: (id: string) => api.get(`/api/channels/${id}`),
  create: (guildId: string, data: object) =>
    api.post(`/api/guilds/${guildId}/channels`, data),
  update: (id: string, data: object) => api.patch(`/api/channels/${id}`, data),
  delete: (id: string) => api.delete(`/api/channels/${id}`),
  createInvite: (channelId: string, data?: object) =>
    api.post(`/api/channels/${channelId}/invites`, data ?? {}),
  triggerTyping: (channelId: string) =>
    api.post(`/api/channels/${channelId}/typing`),
  getPins: (channelId: string) => api.get(`/api/channels/${channelId}/pins`),
};

// ─── Messages ──────────────────────────────────────────────────────────────

export const messagesApi = {
  list: (channelId: string, params?: { before?: string; limit?: number }) =>
    api.get(`/api/channels/${channelId}/messages`, { params }),
  send: (channelId: string, data: { content?: string; reply_to_id?: string }) =>
    api.post(`/api/channels/${channelId}/messages`, data),
  edit: (channelId: string, msgId: string, data: { content: string }) =>
    api.patch(`/api/channels/${channelId}/messages/${msgId}`, data),
  delete: (channelId: string, msgId: string) =>
    api.delete(`/api/channels/${channelId}/messages/${msgId}`),
  addReaction: (channelId: string, msgId: string, emoji: string) =>
    api.put(`/api/channels/${channelId}/messages/${msgId}/reactions/${emoji}/@me`),
  removeReaction: (channelId: string, msgId: string, emoji: string) =>
    api.delete(`/api/channels/${channelId}/messages/${msgId}/reactions/${emoji}/@me`),
  pin: (channelId: string, msgId: string) =>
    api.put(`/api/channels/${channelId}/pins/${msgId}`),
  unpin: (channelId: string, msgId: string) =>
    api.delete(`/api/channels/${channelId}/pins/${msgId}`),
  getPins: (channelId: string) => api.get(`/api/channels/${channelId}/pins`),
  ack: (channelId: string, msgId: string) =>
    api.post(`/api/channels/${channelId}/messages/${msgId}/ack`),
  triggerTyping: (channelId: string) =>
    api.post(`/api/channels/${channelId}/typing`),
  search: (guildId: string, q: string, params?: object) =>
    api.get(`/api/guilds/${guildId}/messages/search`, { params: { q, ...params } }),
  // Threads
  createThread: (channelId: string, msgId: string, data: { name: string; auto_archive_duration?: number }) =>
    api.post(`/api/channels/${channelId}/messages/${msgId}/threads`, data),
  getThreads: (channelId: string) =>
    api.get(`/api/channels/${channelId}/threads`),
  joinThread: (threadId: string) =>
    api.put(`/api/channels/${threadId}/thread-members/@me`),
  leaveThread: (threadId: string) =>
    api.delete(`/api/channels/${threadId}/thread-members/@me`),
};

// ─── Friends ───────────────────────────────────────────────────────────────

export const friendsApi = {
  list: () => api.get("/api/v1/friends"),
  pending: () => api.get("/api/v1/friends?status=pending"),
  send: (data: { username: string }) =>
    api.post("/api/v1/friends", data),
  accept: (friendshipId: string) =>
    api.put(`/api/v1/friends/${friendshipId}/accept`),
  decline: (friendshipId: string) =>
    api.delete(`/api/v1/friends/${friendshipId}`),
  remove: (friendshipId: string) =>
    api.delete(`/api/v1/friends/${friendshipId}`),
  block: (userId: string) =>
    api.post(`/api/v1/friends/${userId}/block`),
  // DM Channels
  listDMs: () => api.get("/api/v1/channels/@me"),
  openDM: (recipientId: string) =>
    api.post("/api/v1/channels/@me", { recipient_id: recipientId }),
  closeDM: (channelId: string) =>
    api.delete(`/api/v1/channels/@me/${channelId}`),
};


// ─── Voice ─────────────────────────────────────────────────────────────────

export const voiceApi = {
  joinChannel: (channelId: string) =>
    api.post(`/api/channels/${channelId}/voice/join`),
  updateState: (data: { channel_id?: string | null; self_mute?: boolean; self_deaf?: boolean }) =>
    api.patch("/api/voice/state", data),
  getRoom: (channelId: string) => api.get(`/api/channels/${channelId}/voice`),
};

// ─── Upload ────────────────────────────────────────────────────────────────

export const mediaApi = {
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    return api.post("/api/users/@me/avatar", form);
  },
  uploadBanner: (file: File) => {
    const form = new FormData();
    form.append("banner", file);
    return api.post("/api/users/@me/banner", form);
  },
  uploadAttachment: (channelId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/api/channels/${channelId}/attachments`, form);
  },
  uploadGuildIcon: (guildId: string, file: File) => {
    const form = new FormData();
    form.append("icon", file);
    return api.post(`/api/guilds/${guildId}/icon`, form);
  },
};

// ─── Users ─────────────────────────────────────────────────────────────────

export const usersApi = {
  getProfile: (userId: string) => api.get(`/api/users/${userId}/profile`),
  getNotes: (userId: string) => api.get(`/api/users/@me/notes/${userId}`),
  setNote: (userId: string, note: string) =>
    api.put(`/api/users/@me/notes/${userId}`, { note }),
};

// Backwards compat (authApi.getProfile)
export const getProfile = (userId: string) => usersApi.getProfile(userId);

// ─── GIF (Giphy) ───────────────────────────────────────────────────────────
// Get your free key at: https://developers.giphy.com → Create App → API
// Then add to .env.local: NEXT_PUBLIC_GIPHY_API_KEY=your_key

const GIPHY_BASE = "https://api.giphy.com/v1/gifs";
const GIPHY_KEY  = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "";

// Normalise Giphy response to match our GifResult interface
function normaliseGiphy(data: any[]) {
  return data.map((g: any) => ({
    id: g.id,
    title: g.title,
    media_formats: {
      gif:     { url: g.images?.original?.url     ?? "", dims: [parseInt(g.images?.original?.width     ?? "0"), parseInt(g.images?.original?.height     ?? "0")] as [number,number] },
      tinygif: { url: g.images?.fixed_width?.url  ?? "", dims: [parseInt(g.images?.fixed_width?.width  ?? "0"), parseInt(g.images?.fixed_width?.height  ?? "0")] as [number,number] },
    },
  }));
}

export const gifApi = {
  search: async (q: string, limit = 20, offset = 0) => {
    if (!GIPHY_KEY) return { results: [], total: 0, next: undefined };
    const url = `${GIPHY_BASE}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&rating=g&lang=en`;
    const res = await fetch(url, { cache: "no-store" }).then(r => r.json());
    return { results: normaliseGiphy(res.data ?? []), total: res.pagination?.total_count ?? 0, next: offset + limit };
  },
  featured: async (limit = 20, offset = 0) => {
    if (!GIPHY_KEY) return { results: [], total: 0, next: undefined };
    const url = `${GIPHY_BASE}/trending?api_key=${GIPHY_KEY}&limit=${limit}&offset=${offset}&rating=g`;
    const res = await fetch(url, { cache: "no-store" }).then(r => r.json());
    return { results: normaliseGiphy(res.data ?? []), total: res.pagination?.total_count ?? 0, next: offset + limit };
  },
  categories: async () => {
    if (!GIPHY_KEY) return { tags: [] };
    // Giphy doesn\'t have a categories endpoint like Tenor, return popular search terms
    return {
      tags: [
        { searchterm: "funny",     image: "" },
        { searchterm: "cute",      image: "" },
        { searchterm: "reactions", image: "" },
        { searchterm: "anime",     image: "" },
        { searchterm: "love",      image: "" },
        { searchterm: "gaming",    image: "" },
        { searchterm: "wow",       image: "" },
        { searchterm: "happy",     image: "" },
        { searchterm: "sad",       image: "" },
        { searchterm: "angry",     image: "" },
        { searchterm: "yes",       image: "" },
        { searchterm: "no",        image: "" },
        { searchterm: "lol",       image: "" },
        { searchterm: "cats",      image: "" },
        { searchterm: "dogs",      image: "" },
        { searchterm: "memes",     image: "" },
      ],
    };
  },
};


// ─── Notifications ─────────────────────────────────────────────────────────

export const notifsApi = {
  getSettings: () => api.get("/api/users/@me/notification-settings"),
  updateChannel: (channelId: string, data: object) =>
    api.patch(`/api/users/@me/notification-settings/channels/${channelId}`, data),
  updateGuild: (guildId: string, data: object) =>
    api.patch(`/api/users/@me/notification-settings/guilds/${guildId}`, data),
};

// ─── OGP / Link previews ───────────────────────────────────────────────────

export const embedApi = {
  fetch: (url: string) =>
    api.get("/api/embed", { params: { url } }),
};
