ARG SERVICE_NAME
FROM lukemathwalker/cargo-chef:latest-rust-1.77-alpine AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json --bin ${SERVICE_NAME}

FROM chef AS builder
ARG SERVICE_NAME
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin ${SERVICE_NAME}

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata curl
ARG SERVICE_NAME
COPY --from=builder /app/target/release/${SERVICE_NAME} /app/service
EXPOSE 8001 8002 8003 8004 8005 8006 8007
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:${PORT:-8001}/health || exit 1
ENTRYPOINT ["/app/service"]
