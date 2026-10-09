# PocketBase pinned to v0.40.5; binary checksum verified against upstream checksums.txt per arch.
FROM alpine:3.22 AS fetch
ARG PB_VERSION=0.40.5
ARG TARGETARCH
RUN apk add --no-cache curl unzip
WORKDIR /tmp
# TARGETARCH is set by buildx; fall back to the build host's arch for the legacy builder.
RUN ARCH="${TARGETARCH:-$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')}" \
 && curl -fsSLo pocketbase_${PB_VERSION}_linux_${ARCH}.zip https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${ARCH}.zip \
 && curl -fsSLo checksums.txt https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/checksums.txt \
 && grep " pocketbase_${PB_VERSION}_linux_${ARCH}.zip$" checksums.txt | sha256sum -c - \
 && mv pocketbase_${PB_VERSION}_linux_${ARCH}.zip pb.zip \
 && unzip pb.zip pocketbase

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget && addgroup -S pb && adduser -S pb -G pb
COPY --from=fetch /tmp/pocketbase /usr/local/bin/pocketbase
COPY services/pocketbase/pb_migrations /pb/pb_migrations
COPY services/pocketbase/pb_hooks /pb/pb_hooks
RUN mkdir -p /pb/pb_data && chown -R pb:pb /pb
USER pb
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
# Listens on the private compose network only; never published to the host.
CMD ["pocketbase", "serve", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--http=0.0.0.0:8090"]
