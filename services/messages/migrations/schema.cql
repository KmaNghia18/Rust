-- ScyllaDB/Cassandra CQL Schema for Messages
-- Run this via: cqlsh -f schema.cql

-- Create keyspace
CREATE KEYSPACE IF NOT EXISTS discord_messages
    WITH REPLICATION = {
        'class': 'NetworkTopologyStrategy',
        'datacenter1': 3
    }
    AND DURABLE_WRITES = true;

USE discord_messages;

-- ─── Messages Table ─────────────────────────────────────────────────────────
-- Partitioned by channel_id → all messages in same channel on same node
-- Clustered by message_id (TIMEUUID) descending → newest first

CREATE TABLE IF NOT EXISTS messages (
    channel_id      UUID,
    message_id      TIMEUUID,       -- auto-sorted by time, use NOW()
    guild_id        UUID,
    author_id       UUID,
    content         TEXT,
    type            TINYINT,        -- 0=default, 1=channel_pin, 2=system
    attachments     LIST<TEXT>,     -- JSON strings: {url, filename, size, content_type}
    embeds          LIST<TEXT>,     -- JSON strings: link previews
    mentions        LIST<UUID>,     -- mentioned user IDs
    mention_roles   LIST<UUID>,     -- mentioned role IDs
    mention_everyone BOOLEAN,
    reactions       MAP<TEXT, INT>, -- emoji → count
    edited_at       TIMESTAMP,
    deleted         BOOLEAN,
    reply_to_id     UUID,           -- message this replies to
    thread_id       UUID,           -- thread spawned from this message
    flags           INT,            -- bitfield: suppressed_embeds, etc.
    PRIMARY KEY (channel_id, message_id)
) WITH CLUSTERING ORDER BY (message_id DESC)
  AND gc_grace_seconds = 86400
  AND compaction = {'class': 'TimeWindowCompactionStrategy',
                    'compaction_window_unit': 'DAYS',
                    'compaction_window_size': 1};

-- ─── Reactions Table ────────────────────────────────────────────────────────
-- Track who reacted with what (for listing reactors)

CREATE TABLE IF NOT EXISTS message_reactions (
    channel_id  UUID,
    message_id  TIMEUUID,
    emoji       TEXT,       -- unicode char or "name:id" for custom
    user_id     UUID,
    reacted_at  TIMESTAMP,
    PRIMARY KEY ((channel_id, message_id, emoji), user_id)
);

-- ─── Read States Table ───────────────────────────────────────────────────────
-- Track last read message per user per channel

CREATE TABLE IF NOT EXISTS read_states (
    user_id             UUID,
    channel_id          UUID,
    last_read_message_id TIMEUUID,
    mention_count       COUNTER,
    PRIMARY KEY (user_id, channel_id)
);

-- ─── Pinned Messages Table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pinned_messages (
    channel_id  UUID,
    message_id  TIMEUUID,
    pinned_by   UUID,
    pinned_at   TIMESTAMP,
    PRIMARY KEY (channel_id, pinned_at, message_id)
) WITH CLUSTERING ORDER BY (pinned_at DESC, message_id DESC);
