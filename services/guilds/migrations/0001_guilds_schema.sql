-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram search for guild names

-- ─── Guilds ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guilds (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(100) NOT NULL,
    description      TEXT,
    icon_url         TEXT,
    banner_url       TEXT,
    splash_url       TEXT,
    owner_id         UUID NOT NULL,
    is_public        BOOLEAN NOT NULL DEFAULT false,
    verification_level SMALLINT NOT NULL DEFAULT 0,
    -- 0=none 1=low 2=medium 3=high 4=very_high
    explicit_filter  SMALLINT NOT NULL DEFAULT 0,
    default_message_notifications SMALLINT NOT NULL DEFAULT 0,
    system_channel_id UUID,
    rules_channel_id  UUID,
    max_members      INT NOT NULL DEFAULT 500000,
    vanity_url_code  VARCHAR(32) UNIQUE,
    premium_tier     SMALLINT NOT NULL DEFAULT 0,
    premium_count    INT NOT NULL DEFAULT 0,
    preferred_locale VARCHAR(8) NOT NULL DEFAULT 'en-US',
    features         TEXT[] NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guilds_owner    ON guilds(owner_id);
CREATE INDEX idx_guilds_public   ON guilds(is_public) WHERE is_public = true;
CREATE INDEX idx_guilds_name_trgm ON guilds USING gin(name gin_trgm_ops);

-- ─── Roles ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id     UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    color        INT NOT NULL DEFAULT 0,       -- RGB hex int
    hoist        BOOLEAN NOT NULL DEFAULT false, -- show separately in member list
    icon_url     TEXT,
    position     INT NOT NULL DEFAULT 0,
    permissions  BIGINT NOT NULL DEFAULT 0,    -- 64-bit permission bitfield
    mentionable  BOOLEAN NOT NULL DEFAULT false,
    managed      BOOLEAN NOT NULL DEFAULT false, -- bot-managed role
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roles_guild ON roles(guild_id, position);

-- ─── Channels ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id         UUID REFERENCES guilds(id) ON DELETE CASCADE,
    parent_id        UUID REFERENCES channels(id) ON DELETE SET NULL,
    name             VARCHAR(100) NOT NULL,
    type             SMALLINT NOT NULL DEFAULT 0,
    -- 0=text 1=dm 2=voice 3=group_dm 4=category 5=announcement 6=forum
    position         INT NOT NULL DEFAULT 0,
    topic            TEXT,
    nsfw             BOOLEAN NOT NULL DEFAULT false,
    slowmode_seconds INT NOT NULL DEFAULT 0,
    bitrate          INT,                          -- voice channels
    user_limit       INT,                          -- voice max users
    rtc_region       VARCHAR(32),
    video_quality_mode SMALLINT DEFAULT 1,        -- 1=auto 2=full
    default_auto_archive_duration INT,            -- forum threads
    flags            INT NOT NULL DEFAULT 0,
    last_message_id  UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_guild    ON channels(guild_id, position);
CREATE INDEX idx_channels_parent   ON channels(parent_id);

-- ─── Channel Permission Overwrites ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_overwrites (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    target_id  UUID NOT NULL,
    target_type SMALLINT NOT NULL,   -- 0=role 1=member
    allow      BIGINT NOT NULL DEFAULT 0,
    deny       BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, target_id)
);

-- ─── Guild Members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_members (
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    nickname    VARCHAR(32),
    avatar_url  TEXT,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    premium_since TIMESTAMPTZ,
    is_owner    BOOLEAN NOT NULL DEFAULT false,
    pending     BOOLEAN NOT NULL DEFAULT false,   -- membership screening
    muted       BOOLEAN NOT NULL DEFAULT false,
    deafened    BOOLEAN NOT NULL DEFAULT false,
    timed_out_until TIMESTAMPTZ,
    PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX idx_members_user  ON guild_members(user_id);
CREATE INDEX idx_members_guild ON guild_members(guild_id);

-- ─── Member Roles (many-to-many) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_roles (
    guild_id UUID NOT NULL,
    user_id  UUID NOT NULL,
    role_id  UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (guild_id, user_id, role_id),
    FOREIGN KEY (guild_id, user_id) REFERENCES guild_members(guild_id, user_id) ON DELETE CASCADE
);

-- ─── Invites ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
    code        VARCHAR(16) PRIMARY KEY,
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    inviter_id  UUID NOT NULL,
    uses        INT NOT NULL DEFAULT 0,
    max_uses    INT NOT NULL DEFAULT 0,        -- 0 = unlimited
    max_age     INT NOT NULL DEFAULT 86400,    -- seconds, 0 = never
    temporary   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ
);

CREATE INDEX idx_invites_guild ON invites(guild_id);

-- ─── Guild Emojis ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_emojis (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name        VARCHAR(32) NOT NULL,
    url         TEXT NOT NULL,
    animated    BOOLEAN NOT NULL DEFAULT false,
    creator_id  UUID NOT NULL,
    managed     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emojis_guild ON guild_emojis(guild_id);

-- ─── Guild Bans ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_bans (
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    reason      TEXT,
    banned_by   UUID NOT NULL,
    banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);

-- ─── Webhooks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    creator_id  UUID NOT NULL,
    name        VARCHAR(80) NOT NULL,
    avatar_url  TEXT,
    token       VARCHAR(64) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    type        SMALLINT NOT NULL DEFAULT 1,   -- 1=incoming 2=follower 3=application
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Auto-update timestamp trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER guilds_updated_at   BEFORE UPDATE ON guilds   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
