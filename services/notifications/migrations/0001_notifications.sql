-- Notification preferences per user per guild/channel
CREATE TABLE IF NOT EXISTS notification_settings (
    user_id             UUID NOT NULL,
    target_type         VARCHAR(8) NOT NULL,    -- 'guild' | 'channel' | 'global'
    target_id           UUID,                   -- NULL for global
    muted               BOOLEAN NOT NULL DEFAULT FALSE,
    muted_until         TIMESTAMPTZ,            -- timed mute
    notification_level  SMALLINT NOT NULL DEFAULT 0,
    -- 0=all  1=only_mentions  2=nothing
    suppress_everyone   BOOLEAN NOT NULL DEFAULT FALSE,
    suppress_roles      BOOLEAN NOT NULL DEFAULT FALSE,
    mobile_push         BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id, target_type, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::UUID))
);

-- Web Push subscriptions (VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,      -- client public key
    auth        TEXT NOT NULL,      -- auth secret
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In-app notification inbox
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    type        VARCHAR(32) NOT NULL,
    -- 'message_mention' | 'friend_request' | 'friend_accept' | 'guild_invite'
    -- 'server_boost' | 'message_reply' | 'reaction'
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    icon_url    TEXT,
    action_url  TEXT,           -- deep link: /channels/guildId/channelId
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    data        JSONB,          -- extra context (guild_id, channel_id, message_id)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subs_user     ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_settings     ON notification_settings(user_id);
