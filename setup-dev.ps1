#!/usr/bin/env pwsh
# setup-dev.ps1 — Khởi động toàn bộ Discord Clone dev environment
# Chạy: .\setup-dev.ps1
# Reset DB: .\setup-dev.ps1 -Reset

param(
    [switch]$Reset,     # Xóa toàn bộ data cũ và seed lại
    [switch]$ServicesOnly, # Chỉ start services, không chạy seed
    [switch]$NoFrontend    # Không start Next.js
)

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Discord Clone — Dev Environment Setup    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Check requirements ────────────────────────────────────────────────────
function Check-Required {
    param($cmd, $name, $url)
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "❌ $name not found. Install from: $url" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ $name" -ForegroundColor Green
}

Write-Host "Checking requirements..." -ForegroundColor Yellow
Check-Required "docker"      "Docker"       "https://docker.com"
Check-Required "docker-compose" "Docker Compose" "https://docs.docker.com/compose"
Check-Required "cargo"       "Rust/Cargo"   "https://rustup.rs"
Check-Required "node"        "Node.js"      "https://nodejs.org"
Write-Host ""

# ── .env.local ────────────────────────────────────────────────────────────
$envLocal = "clients\web\.env.local"
if (-not (Test-Path $envLocal)) {
    Write-Host "📝 Creating .env.local from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" $envLocal
    Write-Host "⚠️  Edit $envLocal and set your API keys (GIPHY, etc.)" -ForegroundColor Yellow
} else {
    Write-Host "✅ .env.local exists" -ForegroundColor Green
}

# ── Reset (if requested) ──────────────────────────────────────────────────
if ($Reset) {
    Write-Host ""
    Write-Host "⚠️  Resetting all data..." -ForegroundColor Red
    docker-compose down -v 2>$null
    Write-Host "✅ Old containers and volumes removed" -ForegroundColor Green
}

# ── Start infrastructure ──────────────────────────────────────────────────
Write-Host ""
Write-Host "🐳 Starting infrastructure (Postgres, Redis, ScyllaDB, MinIO, NATS)..." -ForegroundColor Yellow
docker-compose up -d postgres redis scylladb minio nats

Write-Host ""
Write-Host "⏳ Waiting for Postgres to be ready..." -ForegroundColor Yellow
$maxWait = 60; $waited = 0
do {
    Start-Sleep -Seconds 2; $waited += 2
    $ready = docker exec discord_postgres pg_isready -U postgres 2>$null
    Write-Host "  [$waited/${maxWait}s] Postgres: $ready"
} while ($ready -notmatch "accepting" -and $waited -lt $maxWait)

if ($waited -ge $maxWait) {
    Write-Host "❌ Postgres not ready after ${maxWait}s" -ForegroundColor Red; exit 1
}
Write-Host "✅ Postgres ready!" -ForegroundColor Green

# ── Wait for ScyllaDB ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "⏳ Waiting for ScyllaDB to be ready (may take 60-90s)..." -ForegroundColor Yellow
$maxWait = 120; $waited = 0
do {
    Start-Sleep -Seconds 5; $waited += 5
    $status = docker exec discord_scylla nodetool status 2>$null
    if ($waited % 15 -eq 0) { Write-Host "  [$waited/${maxWait}s] ScyllaDB starting..." }
} while ($status -notmatch "UN" -and $waited -lt $maxWait)

if ($status -match "UN") {
    Write-Host "✅ ScyllaDB ready!" -ForegroundColor Green
} else {
    Write-Host "⚠️  ScyllaDB may not be ready — continuing anyway" -ForegroundColor Yellow
}

# ── Run ScyllaDB schema ───────────────────────────────────────────────────
Write-Host ""
Write-Host "📊 Loading ScyllaDB schema + seed messages..." -ForegroundColor Yellow
docker cp "infra\scylla\init.cql" discord_scylla:/tmp/init.cql

$cqlResult = docker exec discord_scylla cqlsh -f /tmp/init.cql 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ ScyllaDB schema loaded!" -ForegroundColor Green
} else {
    Write-Host "⚠️  ScyllaDB init: $cqlResult" -ForegroundColor Yellow
    Write-Host "   (This is OK if schema already exists)" -ForegroundColor Gray
}

# ── Build Rust services ───────────────────────────────────────────────────
if (-not $ServicesOnly) {
    Write-Host ""
    Write-Host "🦀 Building Rust services (this may take 2-5 minutes first time)..." -ForegroundColor Yellow
    cargo build --release 2>&1 | Tail-n 5
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Rust build failed!" -ForegroundColor Red; exit 1
    }
    Write-Host "✅ Rust build complete!" -ForegroundColor Green
}

# ── Start all services via Docker Compose ────────────────────────────────
Write-Host ""
Write-Host "🚀 Starting all backend services..." -ForegroundColor Yellow
docker-compose up -d

Write-Host ""
Write-Host "⏳ Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# ── Start Frontend ────────────────────────────────────────────────────────
if (-not $NoFrontend) {
    Write-Host ""
    Write-Host "⚡ Starting Next.js frontend..." -ForegroundColor Yellow
    Set-Location "clients\web"
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing npm packages..." -ForegroundColor Gray
        npm install --silent
    }
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Normal
    Set-Location "..\..\"
    Write-Host "✅ Frontend starting at http://localhost:3000" -ForegroundColor Green
}

# ── Summary ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                   🎉 Setup Complete!                        ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Frontend       → http://localhost:3000                     ║" -ForegroundColor White
Write-Host "║  API Gateway    → http://localhost:8080                     ║" -ForegroundColor White
Write-Host "║  MinIO Console  → http://localhost:9001                     ║" -ForegroundColor White
Write-Host "║  Grafana        → http://localhost:3001                     ║" -ForegroundColor White
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Demo Accounts (password: password123)                      ║" -ForegroundColor Yellow
Write-Host "║  admin@discord.local  ← Admin (owner of servers)           ║" -ForegroundColor White
Write-Host "║  alice@discord.local  ← Member                             ║" -ForegroundColor White
Write-Host "║  bob@discord.local    ← Member                             ║" -ForegroundColor White
Write-Host "║  charlie@discord.local← Member                             ║" -ForegroundColor White
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Pre-seeded Servers:                                        ║" -ForegroundColor Yellow
Write-Host "║  🎉 Chill Zone     (5 text + 3 voice channels)             ║" -ForegroundColor White
Write-Host "║  💻 Dev Community  (5 text channels)                       ║" -ForegroundColor White
Write-Host "║  Invite codes: /invite/chill123 | /invite/devclub          ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "📖 Logs: docker-compose logs -f [service-name]" -ForegroundColor Gray
Write-Host "🛑 Stop: docker-compose down" -ForegroundColor Gray
Write-Host "♻️  Reset: .\setup-dev.ps1 -Reset" -ForegroundColor Gray
Write-Host ""
