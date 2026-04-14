# Discord Clone

> A production-grade Discord clone built with **Rust microservices** + **Next.js** + **Tauri**.

[![CI/CD](https://github.com/KmaNghia18/Rust/actions/workflows/ci.yml/badge.svg)](https://github.com/KmaNghia18/Rust/actions/workflows/ci.yml)
![Rust](https://img.shields.io/badge/Rust-1.77+-orange?logo=rust)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│  Next.js Web (port 3000)  │  Tauri Desktop (Windows/macOS/Linux)│
└────────────┬──────────────┴──────────────────┬─────────────┘
             │ HTTP REST                        │ WebSocket
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Microservices                             │
│  Auth :8001  │ Guilds :8002 │ Messages :8003 │ Voice :8004 │
│  Media :8005 │ Search :8006 │ Notifications :8007          │
│  Gateway (WebSocket) :8000                                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                   Infrastructure                            │
│  PostgreSQL  │ Redis  │ ScyllaDB  │ Kafka  │ Elasticsearch  │
│  MinIO  │ Prometheus + Grafana + Jaeger                      │
└─────────────────────────────────────────────────────────────┘
```

## Services

| Service | Port | Tech | Description |
|---------|------|------|-------------|
| **Gateway** | 8000 | tokio-tungstenite | WebSocket gateway, real-time events |
| **Auth** | 8001 | Axum + SQLx + Argon2 | JWT auth, TOTP 2FA, OAuth2 |
| **Guilds** | 8002 | Axum + SQLx | Guilds, channels, roles, permissions |
| **Messages** | 8003 | Axum + ScyllaDB + Kafka | Chat messages with reactions |
| **Voice** | 8004/8005 | WebRTC SFU | Voice/video channels |
| **Media** | 8005 | Axum + MinIO | File upload, image processing |
| **Search** | 8006 | Axum + Elasticsearch | Full-text message/guild/user search |
| **Notifications** | 8007 | Axum + VAPID + SMTP | Push & email notifications |

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Rust 1.77+
- Node.js 20+

### 1. Clone & Configure

```bash
git clone https://github.com/KmaNghia18/Rust.git
cd Rust
cp .env.example .env
# Edit .env with your secrets
```

### 2. Start Infrastructure

```bash
docker compose up -d postgres redis scylladb minio elasticsearch kafka
```

### 3. Run Services

```bash
# All services
cargo build --release

# Individual service
cargo run --bin auth
cargo run --bin gateway
cargo run --bin guilds
cargo run --bin messages
cargo run --bin voice
cargo run --bin media
cargo run --bin search
cargo run --bin notifications
```

### 4. Start Web Client

```bash
cd clients/web
npm install
npm run dev
# → http://localhost:3000
```

### 5. Start Desktop App (optional)

```bash
cd clients/desktop
npm install
npm run tauri dev
```

### Full Stack (Docker Compose)

```bash
docker compose up -d
```

Services available:
- Web App: http://localhost:3000
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686
- pgAdmin: http://localhost:5050
- Kafka UI: http://localhost:8090
- MinIO Console: http://localhost:9001

## Key Features

### Backend
- ✅ JWT authentication with refresh tokens
- ✅ TOTP 2FA (`totp-lite`)
- ✅ 64-bit permission bitfield (Discord-compatible)
- ✅ WebSocket Gateway with heartbeat & reconnect
- ✅ ScyllaDB for high-scale message storage (TIMEUUID partitioning)
- ✅ WebRTC SFU voice channels
- ✅ Image processing: resize → WebP (Lanczos3)
- ✅ Full-text search with Elasticsearch (BM25 + fuzzy)
- ✅ Web Push notifications (VAPID)
- ✅ Email notifications (HTML templates)
- ✅ Rate limiting per endpoint

### Frontend (Next.js)
- ✅ Discord-like UI (dark theme, CSS variables)
- ✅ Real-time messages via WebSocket
- ✅ Infinite scroll with skeleton loaders
- ✅ Optimistic message sending
- ✅ File upload with drag-and-drop
- ✅ Typing indicators
- ✅ Reactions with emoji picker
- ✅ Login / Register with Zod validation

### Desktop (Tauri)
- ✅ Native OS token storage (keychain)
- ✅ WebSocket gateway in Rust backend
- ✅ System tray with mute/deafen controls
- ✅ Global shortcuts (Push-to-Talk: Ctrl+Space)
- ✅ Desktop notifications for @mentions
- ✅ Auto-updater
- ✅ Single-instance enforcement
- ✅ Windows/macOS/Linux builds

## Environment Variables

See [`.env.example`](.env.example) for all variables with descriptions.

## Branching Strategy

```
main           — Production releases
develop        — Integration branch
feature/*      — Feature branches (PR → develop)
hotfix/*       — Emergency fixes (PR → main + develop)
release/x.y.z  — Release prep branches
```

See [`github_branching_strategy.md`](docs/branching.md) for full details.

## Running Tests

```bash
# All tests
cargo test --workspace

# Specific service
cargo test -p auth

# With database (integration tests)
DATABASE_URL=postgres://... cargo test -p guilds -- --include-ignored
```

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit with conventional commits: `feat(scope): description`
4. Open a PR to `develop`

## License

MIT © 2026 Discord Clone Team
