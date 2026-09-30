FROM rust:1-slim-bookworm AS build
WORKDIR /build
COPY server/Cargo.toml server/Cargo.lock ./
COPY server/src ./src
RUN cargo build --locked --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home k12
WORKDIR /app
COPY --from=build /build/target/release/k12-ai-server /app/k12-ai-server
USER k12
CMD ["/app/k12-ai-server"]
