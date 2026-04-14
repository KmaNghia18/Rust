FROM lukemathwalker/cargo-chef:latest-rust-1.77-alpine AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json --bin media

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin media

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata curl
COPY --from=builder /app/target/release/media /app/service
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD curl -f http://localhost/health || exit 1
ENTRYPOINT ["/app/service"]
