-- ScyllaDB / Cassandra schema + seed messages
-- File này được chạy bởi script seed.sh

-- Keyspace
CREATE KEYSPACE IF NOT EXISTS discord
    WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    AND durable_writes = true;

USE discord;

-- ─── Messages table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    channel_id      UUID,
    message_id      TIMEUUID,               -- sortable by time
    author_id       UUID,
    content         TEXT,
    type            TINYINT,                -- 0=default,1=reply,2=system
    reply_to_id     UUID,
    attachments     LIST<FROZEN<MAP<TEXT, TEXT>>>,
    embeds          LIST<FROZEN<MAP<TEXT, TEXT>>>,
    mentions        LIST<UUID>,
    mention_everyone BOOLEAN,
    pinned          BOOLEAN,
    edited_at       TIMESTAMP,
    deleted         BOOLEAN,
    PRIMARY KEY (channel_id, message_id)
) WITH CLUSTERING ORDER BY (message_id DESC)
   AND default_time_to_live = 0;

-- ─── Reactions table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reactions (
    channel_id  UUID,
    message_id  TIMEUUID,
    emoji       TEXT,
    user_id     UUID,
    PRIMARY KEY ((channel_id, message_id), emoji, user_id)
);

-- ─── Read receipts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS read_states (
    user_id         UUID,
    channel_id      UUID,
    last_message_id TIMEUUID,
    mention_count   INT,
    PRIMARY KEY (user_id, channel_id)
);

-- ─── Typing indicators (TTL 10s) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS typing (
    channel_id  UUID,
    user_id     UUID,
    started_at  TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
) WITH default_time_to_live = 10;

-- ─── Seed: Messages in #general (Chill Zone) ─────────────────────────────
-- Channel: 30000000-0000-0000-0001-000000000010
-- Note: We use now() for TIMEUUID which generates a valid time-based UUID
INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000001, 'Chào mừng đến với **Chill Zone**! 🎉\n\nĐây là server để mọi người thư giãn và chat vui. Hãy đọc rules và giới thiệu bản thân nhé!', 0, TRUE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000002, 'Xin chào mọi người! Mình là Alice 👋 Mình hay online vào buổi tối, ai muốn chat cứ ping mình nhé!', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000003, 'Hey mọi người! Bob đây 🎮 Đang chơi game ai muốn join không?', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000004, 'Hi all! Vừa xong deadline mệt quá 😭 Nay chill với mọi người cho khỏe nào', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000002, '> Đang chơi game ai muốn join không?\n\nGame gì vậy Bob? Mình join với 😄', 1, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000003, 'Minecraft! Mình mới build cái nhà mới siêu đẹp 🏠 Đang cần người phá 😂', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000001, 'Nhớ là **ban** ai phá nhà bảo không cản 😤', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0001-000000000010, now(), 00000000-0000-0000-0000-000000000005, 'Alo mọi người! Mình vừa wake up ☕ có gì mới không?', 0, FALSE, FALSE, FALSE);

-- Messages in #rust channel (Dev Community)
INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0002-000000000011, now(), 00000000-0000-0000-0000-000000000001, '# Rust Tips & Tricks 🦀\n\nThread này để share những tips hay về Rust. Bắt đầu với tip đầu tiên:\n\n```rust\n// Dùng ? operator thay vì unwrap()\nfn read_file(path: &str) -> Result<String, io::Error> {\n    let mut file = File::open(path)?;\n    let mut content = String::new();\n    file.read_to_string(&mut content)?;\n    Ok(content)\n}\n```', 0, FALSE, TRUE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0002-000000000011, now(), 00000000-0000-0000-0000-000000000002, 'Hay đó! Thêm một cái nữa:\n```rust\n// Clone on write - dùng khi không chắc cần clone hay không\nuse std::borrow::Cow;\n\nfn process(s: Cow<str>) -> Cow<str> {\n    if s.contains(\"rust\") {\n        s.to_uppercase().into()\n    } else {\n        s\n    }\n}\n```', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0002-000000000011, now(), 00000000-0000-0000-0000-000000000003, '> Hay đó! Thêm một cái nữa\n\nOh nice! Chưa biết cái Cow này 😮 Cảm ơn nhé!', 1, FALSE, FALSE, FALSE);

-- Messages in #general (Dev Community)
INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0002-000000000010, now(), 00000000-0000-0000-0000-000000000001, 'Chào mừng đến **Dev Community**! 💻\nĐây là nơi để thảo luận về lập trình, hỏi đáp và share projects.\n\n- 🦀 `#rust` — Rust programming\n- 🟨 `#javascript` — JS/TS/React  \n- 🆘 `#help` — Hỏi đáp kỹ thuật\n- 🚀 `#showcase` — Show off projects', 0, TRUE, TRUE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0002-000000000010, now(), 00000000-0000-0000-0000-000000000003, 'Hỏi thật: Rust khó không hay solo được? Đang học Go mà thấy nên chuyển 😅', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0002-000000000010, now(), 00000000-0000-0000-0000-000000000001, 'Khó hơn Go nhưng **worth it** lắm! Borrow checker lúc đầu hơi đau não nhưng sau quen rất thỏa mãn 🦀\n\nBắt đầu ở đây: https://doc.rust-lang.org/book/', 0, FALSE, FALSE, FALSE);

INSERT INTO messages (channel_id, message_id, author_id, content, type, mention_everyone, pinned, deleted) VALUES
  (30000000-0000-0000-0002-000000000010, now(), 00000000-0000-0000-0000-000000000002, 'Đồng ý! Sau khi hiểu ownership thì code cảm giác rất clean. Plus performance trong như C 🚀', 0, FALSE, FALSE, FALSE);
