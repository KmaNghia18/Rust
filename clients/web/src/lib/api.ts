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
  getInvite: (code: string) => api.get(`/api/invites/${code}`),
  getMembers: (id: string, after?: string) =>
    api.get(`/api/guilds/${id}/members`, { params: { after, limit: 100 } }),
  getRoles: (id: string) => api.get(`/api/guilds/${id}/roles`),
  getBans: (id: string) => api.get(`/api/guilds/${id}/bans`),
  banMember: (guildId: string, userId: string, reason?: string) =>
    api.put(`/api/guilds/${guildId}/bans/${userId}`, { reason }),
  kickMember: (guildId: string, userId: string) =>
    api.delete(`/api/guilds/${guildId}/members/${userId}`),
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
  ack: (channelId: string, msgId: string) =>
    api.post(`/api/channels/${channelId}/messages/${msgId}/ack`),
  search: (guildId: string, q: string, params?: object) =>
    api.get(`/api/guilds/${guildId}/messages/search`, { params: { q, ...params } }),
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
