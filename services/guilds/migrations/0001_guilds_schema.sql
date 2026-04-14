-- ─── Guilds (Servers) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guilds (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    icon_url            TEXT,
    banner_url          TEXT,
    splash_url          TEXT,
    owner_id            UUID NOT NULL,
    is_public           BOOLEAN NOT NULL DEFAULT FALSE,
    vanity_url_code     VARCHAR(32) UNIQUE,
    verification_level  SMALLINT NOT NULL DEFAULT 0,        -- 0=none 1=low 2=med 3=high 4=very_high
    explicit_filter     SMALLINT NOT NULL DEFAULT 0,        -- 0=disabled 1=members-no-roles 2=all
    default_notif_level SMALLINT NOT NULL DEFAULT 0,        -- 0=all 1=mentions
    boost_count         INT NOT NULL DEFAULT 0,
    boost_level         SMALLINT NOT NULL DEFAULT 0,        -- 0,1,2,3
    max_members         INT NOT NULL DEFAULT 500000,
    preferred_locale    VARCHAR(10) NOT NULL DEFAULT 'en-US',
    system_channel_id   UUID,                               -- where system msgs go
    rules_channel_id    UUID,
    afk_channel_id      UUID,
    afk_timeout         INT NOT NULL DEFAULT 300,           -- seconds
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Guild Members ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guild_members (
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    nickname    VARCHAR(32),
    avatar_url  TEXT,                   -- guild-specific avatar
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    premium_since TIMESTAMPTZ,          -- when they started boosting
    deaf        BOOLEAN NOT NULL DEFAULT FALSE,
    mute        BOOLEAN NOT NULL DEFAULT FALSE,
    pending     BOOLEAN NOT NULL DEFAULT FALSE,  -- not passed verification gate
    timed_out_until TIMESTAMPTZ,        -- timeout (temporary mute)
    PRIMARY KEY (guild_id, user_id)
);

-- ─── Roles ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    color       INT NOT NULL DEFAULT 0,             -- RGB color as integer
    hoist       BOOLEAN NOT NULL DEFAULT FALSE,     -- show separately in member list
    icon_url    TEXT,
    position    INT NOT NULL DEFAULT 0,             -- higher = more powerful
    permissions BIGINT NOT NULL DEFAULT 0,          -- 64-bit permission bitfield
    mentionable BOOLEAN NOT NULL DEFAULT FALSE,
    managed     BOOLEAN NOT NULL DEFAULT FALSE,     -- managed by integration/bot
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Member Roles ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS member_roles (
    guild_id    UUID NOT NULL,
    user_id     UUID NOT NULL,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (guild_id, user_id, role_id),
    FOREIGN KEY (guild_id, user_id) REFERENCES guild_members(guild_id, user_id) ON DELETE CASCADE
);

-- ─── Channels ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        UUID REFERENCES guilds(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES channels(id) ON DELETE SET NULL,    -- category
    name            VARCHAR(100) NOT NULL,
    type            SMALLINT NOT NULL DEFAULT 0,
    -- 0=text 1=dm 2=voice 3=group_dm 4=category 5=announcement
    -- 10=announcement_thread 11=public_thread 12=private_thread
    -- 13=stage 15=forum
    topic           TEXT,
    position        INT NOT NULL DEFAULT 0,
    nsfw            BOOLEAN NOT NULL DEFAULT FALSE,
    slowmode_delay  INT NOT NULL DEFAULT 0,         -- seconds between messages
    bitrate         INT NOT NULL DEFAULT 64000,     -- voice channels (bps)
    user_limit      INT NOT NULL DEFAULT 0,         -- voice; 0=unlimited
    rtc_region      TEXT,                           -- voice region override
    video_quality   SMALLINT NOT NULL DEFAULT 1,    -- 1=auto 2=full
    last_message_id UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Channel Permission Overwrites ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channel_overwrites (
    channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    target_id   UUID NOT NULL,              -- role_id or user_id
    target_type VARCHAR(4) NOT NULL,        -- 'role' or 'user'
    allow       BIGINT NOT NULL DEFAULT 0,  -- permissions to allow
    deny        BIGINT NOT NULL DEFAULT 0,  -- permissions to deny
    PRIMARY KEY (channel_id, target_id)
);

-- ─── Invite Links ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invites (
    code            VARCHAR(16) PRIMARY KEY,
    guild_id        UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    channel_id      UUID REFERENCES channels(id) ON DELETE SET NULL,
    creator_id      UUID NOT NULL,
    uses            INT NOT NULL DEFAULT 0,
    max_uses        INT,                    -- NULL = unlimited
    temporary       BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ,            -- NULL = never
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Bans ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guild_bans (
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    reason      TEXT,
    banned_by   UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);

-- ─── Audit Logs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    target_id   UUID,
    action_type SMALLINT NOT NULL,
    -- 1=guild_update, 10=channel_create, 11=channel_update, 12=channel_delete
    -- 20=member_kick, 21=member_prune, 22=member_ban_add, 23=member_ban_remove
    -- 24=member_update, 25=member_role_update
    -- 30=role_create, 31=role_update, 32=role_delete
    -- 40=invite_create, 42=invite_delete
    -- 72=message_delete, 73=message_bulk_delete, 74=message_pin, 75=message_unpin
    changes     JSONB,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_guild_members_user ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_roles_guild ON roles(guild_id, position);
CREATE INDEX IF NOT EXISTS idx_channels_guild ON channels(guild_id, position);
CREATE INDEX IF NOT EXISTS idx_channels_parent ON channels(parent_id);
CREATE INDEX IF NOT EXISTS idx_invites_guild ON invites(guild_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild ON audit_logs(guild_id, created_at DESC);

-- ─── Triggers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_guilds_updated_at
    BEFORE UPDATE ON guilds FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at
    BEFORE UPDATE ON channels FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
