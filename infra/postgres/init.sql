-- ═══════════════════════════════════════════════════════════════════════════
-- Discord Clone — Full Schema + Seed Data
-- Chạy tự động khi Docker khởi động lần đầu
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Create databases ─────────────────────────────────────────────────────
CREATE DATABASE discord_auth;
CREATE DATABASE discord_guilds;
CREATE DATABASE discord_notifications;

-- ─── Application user ─────────────────────────────────────────────────────
CREATE USER discord_app WITH PASSWORD 'app_password';
GRANT ALL PRIVILEGES ON DATABASE discord_dev          TO discord_app;
GRANT ALL PRIVILEGES ON DATABASE discord_auth         TO discord_app;
GRANT ALL PRIVILEGES ON DATABASE discord_guilds       TO discord_app;
GRANT ALL PRIVILEGES ON DATABASE discord_notifications TO discord_app;

-- ═══════════════════════════════════════════════════════════════════════════
-- AUTH DATABASE
-- ═══════════════════════════════════════════════════════════════════════════
\c discord_auth

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(32)  NOT NULL UNIQUE,
    discriminator   VARCHAR(4)   NOT NULL DEFAULT '0000',
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    avatar_url      TEXT,
    banner_url      TEXT,
    bio             TEXT,
    status          VARCHAR(16)  NOT NULL DEFAULT 'offline',
    custom_status   TEXT,
    is_bot          BOOLEAN      NOT NULL DEFAULT FALSE,
    is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked     BOOLEAN     NOT NULL DEFAULT FALSE
);

-- User notes (private notes about other users)
CREATE TABLE user_notes (
    author_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT    NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (author_id, target_id)
);

-- Friendships
CREATE TABLE friendships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending|accepted|blocked
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (requester_id, addressee_id)
);

-- DM channels (between 2 users)
CREATE TABLE dm_channels (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dm_participants (
    channel_id  UUID NOT NULL REFERENCES dm_channels(id)  ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    closed_at   TIMESTAMPTZ,
    PRIMARY KEY (channel_id, user_id)
);

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO discord_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO discord_app;

-- ─── Seed: demo users ─────────────────────────────────────────────────────
-- Password for all demo users = "password123"
-- bcrypt hash of "password123" with cost=12:
INSERT INTO users (id, username, discriminator, email, password_hash, avatar_url, bio, status, is_verified) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin',    '0001', 'admin@discord.local',   '$2b$12$LDFl/RHn4GFTPMpqUVIbq.vRrCHPAp7SaOsmNMF7P2e/Ac2LopVWy', NULL, 'Server administrator 👑', 'online',  TRUE),
  ('00000000-0000-0000-0000-000000000002', 'Alice',    '0002', 'alice@discord.local',   '$2b$12$LDFl/RHn4GFTPMpqUVIbq.vRrCHPAp7SaOsmNMF7P2e/Ac2LopVWy', NULL, 'Hello world! 👋',         'online',  TRUE),
  ('00000000-0000-0000-0000-000000000003', 'Bob',      '0003', 'bob@discord.local',     '$2b$12$LDFl/RHn4GFTPMpqUVIbq.vRrCHPAp7SaOsmNMF7P2e/Ac2LopVWy', NULL, 'Just chilling 🎮',        'idle',    TRUE),
  ('00000000-0000-0000-0000-000000000004', 'Charlie',  '0004', 'charlie@discord.local', '$2b$12$LDFl/RHn4GFTPMpqUVIbq.vRrCHPAp7SaOsmNMF7P2e/Ac2LopVWy', NULL, 'Busy coding 💻',          'dnd',     TRUE),
  ('00000000-0000-0000-0000-000000000005', 'Diana',    '0005', 'diana@discord.local',   '$2b$12$LDFl/RHn4GFTPMpqUVIbq.vRrCHPAp7SaOsmNMF7P2e/Ac2LopVWy', NULL, 'Night owl 🦉',            'offline', TRUE),
  ('00000000-0000-0000-0001-000000000001', 'Discordbot','0000','bot@discord.local',      '$2b$12$LDFl/RHn4GFTPMpqUVIbq.vRrCHPAp7SaOsmNMF7P2e/Ac2LopVWy', NULL, 'I am a bot 🤖',           'online',  TRUE);

UPDATE users SET is_bot = TRUE WHERE username = 'Discordbot';

-- Friendships (Alice ↔ Bob accepted, Alice → Charlie pending)
INSERT INTO friendships (requester_id, addressee_id, status) VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'accepted'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'pending');

-- ═══════════════════════════════════════════════════════════════════════════
-- GUILDS DATABASE
-- ═══════════════════════════════════════════════════════════════════════════
\c discord_guilds

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Guilds
CREATE TABLE guilds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    icon_url        TEXT,
    banner_url      TEXT,
    owner_id        UUID         NOT NULL,
    member_count    INT          NOT NULL DEFAULT 1,
    system_channel_id UUID,
    verification_level INT       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID        NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    color       INT          NOT NULL DEFAULT 0,
    hoist       BOOLEAN      NOT NULL DEFAULT FALSE,
    position    INT          NOT NULL DEFAULT 0,
    permissions BIGINT       NOT NULL DEFAULT 0,
    mentionable BOOLEAN      NOT NULL DEFAULT FALSE,
    managed     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Members
CREATE TABLE members (
    guild_id    UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL,
    nickname    VARCHAR(32),
    joined_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    muted       BOOLEAN      NOT NULL DEFAULT FALSE,
    deafened    BOOLEAN      NOT NULL DEFAULT FALSE,
    is_owner    BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (guild_id, user_id)
);

-- Member roles
CREATE TABLE member_roles (
    guild_id    UUID NOT NULL,
    user_id     UUID NOT NULL,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (guild_id, user_id, role_id),
    FOREIGN KEY (guild_id, user_id) REFERENCES members(guild_id, user_id) ON DELETE CASCADE
);

-- Channels
CREATE TABLE channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID         REFERENCES guilds(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    type        SMALLINT     NOT NULL DEFAULT 0, -- 0=text,2=voice,4=category,5=announcement
    position    INT          NOT NULL DEFAULT 0,
    parent_id   UUID         REFERENCES channels(id) ON DELETE SET NULL,
    topic       TEXT,
    nsfw        BOOLEAN      NOT NULL DEFAULT FALSE,
    bitrate     INT,
    user_limit  INT,
    rate_limit  INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Invites
CREATE TABLE invites (
    code        VARCHAR(10)  PRIMARY KEY,
    guild_id    UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id  UUID         REFERENCES channels(id) ON DELETE SET NULL,
    inviter_id  UUID         NOT NULL,
    uses        INT          NOT NULL DEFAULT 0,
    max_uses    INT          NOT NULL DEFAULT 0,
    max_age     INT          NOT NULL DEFAULT 86400,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Bans
CREATE TABLE bans (
    guild_id    UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL,
    reason      TEXT,
    banned_by   UUID         NOT NULL,
    banned_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);

-- Audit logs
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL,
    action_type INT          NOT NULL,
    target_id   UUID,
    reason      TEXT,
    changes     JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Emoji
CREATE TABLE emojis (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID         NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name        VARCHAR(64)  NOT NULL,
    image_url   TEXT         NOT NULL,
    created_by  UUID         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Pin messages (stores message IDs from ScyllaDB)
CREATE TABLE pinned_messages (
    channel_id  UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id  UUID         NOT NULL,
    pinned_by   UUID         NOT NULL,
    pinned_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, message_id)
);

-- Notification settings per user+guild
CREATE TABLE notification_settings (
    user_id     UUID         NOT NULL,
    guild_id    UUID         REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id  UUID         REFERENCES channels(id) ON DELETE CASCADE,
    level       VARCHAR(16)  NOT NULL DEFAULT 'all', -- all|mentions|nothing
    muted       BOOLEAN      NOT NULL DEFAULT FALSE,
    muted_until TIMESTAMPTZ,
    PRIMARY KEY (user_id, COALESCE(guild_id, '00000000-0000-0000-0000-000000000000'), COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'))
);

-- Voice states
CREATE TABLE voice_states (
    guild_id        UUID    NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id      UUID    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         UUID    NOT NULL,
    session_id      TEXT    NOT NULL,
    self_mute       BOOLEAN NOT NULL DEFAULT FALSE,
    self_deaf       BOOLEAN NOT NULL DEFAULT FALSE,
    self_video      BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (guild_id, user_id)
);

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO discord_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO discord_app;

-- ─── Seed: Demo server "Chill Zone" ───────────────────────────────────────
-- Guild
INSERT INTO guilds (id, name, description, owner_id, member_count) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Chill Zone',    'Nơi để thư giãn và chat vui 🎉', '00000000-0000-0000-0000-000000000001', 5),
  ('10000000-0000-0000-0000-000000000002', 'Dev Community', 'Thảo luận về lập trình 💻',      '00000000-0000-0000-0000-000000000001', 3);

-- Roles for "Chill Zone"
INSERT INTO roles (id, guild_id, name, color, hoist, position, permissions) VALUES
  ('20000000-0000-0000-0001-000000000001', '10000000-0000-0000-0000-000000000001', '@everyone', 0,       FALSE, 0, 104324673),
  ('20000000-0000-0000-0001-000000000002', '10000000-0000-0000-0000-000000000001', 'Admin',     16711680, TRUE,  3, 2147483647),
  ('20000000-0000-0000-0001-000000000003', '10000000-0000-0000-0000-000000000001', 'Moderator', 5814783, TRUE,  2, 268453896),
  ('20000000-0000-0000-0001-000000000004', '10000000-0000-0000-0000-000000000001', 'Member',    3066993, FALSE, 1, 104187456);

-- Roles for "Dev Community"
INSERT INTO roles (id, guild_id, name, color, hoist, position, permissions) VALUES
  ('20000000-0000-0000-0002-000000000001', '10000000-0000-0000-0000-000000000002', '@everyone', 0,       FALSE, 0, 104324673),
  ('20000000-0000-0000-0002-000000000002', '10000000-0000-0000-0000-000000000002', 'Admin',     16711680, TRUE,  2, 2147483647),
  ('20000000-0000-0000-0002-000000000003', '10000000-0000-0000-0000-000000000002', 'Developer', 5765632, TRUE,  1, 104187456);

-- Members of "Chill Zone"
INSERT INTO members (guild_id, user_id, is_owner) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', TRUE),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', FALSE),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', FALSE),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', FALSE),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', FALSE);

-- Members of "Dev Community"
INSERT INTO members (guild_id, user_id, is_owner) VALUES
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', TRUE),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', FALSE),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', FALSE);

-- Member roles
INSERT INTO member_roles VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0001-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0001-000000000003'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '20000000-0000-0000-0001-000000000004'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '20000000-0000-0000-0001-000000000004'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', '20000000-0000-0000-0001-000000000004');

-- Channels for "Chill Zone"
INSERT INTO channels (id, guild_id, name, type, position) VALUES
  -- Categories
  ('30000000-0000-0000-0001-000000000001', '10000000-0000-0000-0000-000000000001', 'TEXT CHANNELS',  4, 0),
  ('30000000-0000-0000-0001-000000000002', '10000000-0000-0000-0000-000000000001', 'VOICE CHANNELS', 4, 10),
  ('30000000-0000-0000-0001-000000000003', '10000000-0000-0000-0000-000000000001', 'MEDIA',          4, 20);

INSERT INTO channels (id, guild_id, name, type, position, parent_id, topic) VALUES
  -- Text channels
  ('30000000-0000-0000-0001-000000000010', '10000000-0000-0000-0000-000000000001', 'general',      0, 1, '30000000-0000-0000-0001-000000000001', 'Nơi chat mọi thứ! Drop memes, ảnh, hay chỉ là "hey" 👋'),
  ('30000000-0000-0000-0001-000000000011', '10000000-0000-0000-0000-000000000001', 'introductions', 0, 2, '30000000-0000-0000-0001-000000000001', 'Giới thiệu bản thân với mọi người 🙌'),
  ('30000000-0000-0000-0001-000000000012', '10000000-0000-0000-0000-000000000001', 'announcements', 5, 3, '30000000-0000-0000-0001-000000000001', 'Thông báo quan trọng từ admin 📢'),
  ('30000000-0000-0000-0001-000000000013', '10000000-0000-0000-0000-000000000001', 'memes',         0, 4, '30000000-0000-0000-0001-000000000001', 'Share meme xịn nhất 😂'),
  ('30000000-0000-0000-0001-000000000014', '10000000-0000-0000-0000-000000000001', 'off-topic',     0, 5, '30000000-0000-0000-0001-000000000001', 'Hỏi gì cũng được, kể gì cũng được 🗨️');

INSERT INTO channels (id, guild_id, name, type, position, parent_id) VALUES
  -- Voice channels
  ('30000000-0000-0000-0001-000000000020', '10000000-0000-0000-0000-000000000001', 'General Voice', 2, 1, '30000000-0000-0000-0001-000000000002'),
  ('30000000-0000-0000-0001-000000000021', '10000000-0000-0000-0000-000000000001', 'Gaming',        2, 2, '30000000-0000-0000-0001-000000000002'),
  ('30000000-0000-0000-0001-000000000022', '10000000-0000-0000-0000-000000000001', 'Music',         2, 3, '30000000-0000-0000-0001-000000000002');

-- Update system channel
UPDATE guilds SET system_channel_id = '30000000-0000-0000-0001-000000000010'
WHERE id = '10000000-0000-0000-0000-000000000001';

-- Channels for "Dev Community"
INSERT INTO channels (id, guild_id, name, type, position) VALUES
  ('30000000-0000-0000-0002-000000000001', '10000000-0000-0000-0000-000000000002', 'GENERAL', 4, 0),
  ('30000000-0000-0000-0002-000000000002', '10000000-0000-0000-0000-000000000002', 'PROJECTS', 4, 10);

INSERT INTO channels (id, guild_id, name, type, position, parent_id, topic) VALUES
  ('30000000-0000-0000-0002-000000000010', '10000000-0000-0000-0000-000000000002', 'general',     0, 1, '30000000-0000-0000-0002-000000000001', 'Chat tổng hợp'),
  ('30000000-0000-0000-0002-000000000011', '10000000-0000-0000-0000-000000000002', 'rust',        0, 2, '30000000-0000-0000-0002-000000000001', '🦀 Thảo luận Rust programming'),
  ('30000000-0000-0000-0002-000000000012', '10000000-0000-0000-0000-000000000002', 'javascript',  0, 3, '30000000-0000-0000-0002-000000000001', 'JS/TS/React discussions'),
  ('30000000-0000-0000-0002-000000000013', '10000000-0000-0000-0000-000000000002', 'help',        0, 4, '30000000-0000-0000-0002-000000000001', 'Hỏi đáp kỹ thuật 🆘'),
  ('30000000-0000-0000-0002-000000000014', '10000000-0000-0000-0000-000000000002', 'showcase',    0, 1, '30000000-0000-0000-0002-000000000002', 'Show off project của mày nào 🚀');

-- Invites
INSERT INTO invites (code, guild_id, channel_id, inviter_id, max_uses, max_age) VALUES
  ('chill123', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0001-000000000010', '00000000-0000-0000-0000-000000000001', 0, 0),
  ('devclub',  '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000001', 0, 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS DATABASE
-- ═══════════════════════════════════════════════════════════════════════════
\c discord_notifications

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    type        VARCHAR(32)  NOT NULL, -- message_mention|friend_request|guild_invite|system
    title       TEXT         NOT NULL,
    body        TEXT,
    data        JSONB,
    read        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO discord_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO discord_app;

-- ─── Seed: welcome notifications ──────────────────────────────────────────
INSERT INTO notifications (user_id, type, title, body) VALUES
  ('00000000-0000-0000-0000-000000000001', 'system', 'Welcome to Discord Clone! 🎉', 'Ứng dụng đã sẵn sàng. Hãy tạo server hoặc tham gia server có sẵn!'),
  ('00000000-0000-0000-0000-000000000002', 'system', 'Welcome to Discord Clone! 🎉', 'Ứng dụng đã sẵn sàng. Hãy tạo server hoặc tham gia server có sẵn!');
