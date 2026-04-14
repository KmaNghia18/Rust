-- Friends & social relationships
CREATE TABLE IF NOT EXISTS friendships (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    friend_id   UUID NOT NULL,
    status      VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- 'pending' | 'accepted' | 'blocked'
    initiator   UUID NOT NULL,       -- who sent the request
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, friend_id),
    CHECK (user_id <> friend_id)
);

CREATE INDEX idx_friendships_user   ON friendships(user_id, status);
CREATE INDEX idx_friendships_friend ON friendships(friend_id, status);

-- Direct Message channels (type=1 DM, type=3 Group DM)
CREATE TABLE IF NOT EXISTS dm_channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type SMALLINT NOT NULL DEFAULT 1,   -- 1=dm, 3=group_dm
    name        VARCHAR(100),                    -- only for group DMs
    icon_url    TEXT,                            -- only for group DMs
    owner_id    UUID,                            -- only for group DMs
    last_message_id UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DM participants
CREATE TABLE IF NOT EXISTS dm_participants (
    channel_id      UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    nickname        VARCHAR(32),
    last_read_at    TIMESTAMPTZ,
    is_closed       BOOLEAN NOT NULL DEFAULT false,   -- hidden from sidebar
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_dm_participants_user ON dm_participants(user_id, is_closed);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER friendships_updated_at  BEFORE UPDATE ON friendships  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER dm_channels_updated_at  BEFORE UPDATE ON dm_channels  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
