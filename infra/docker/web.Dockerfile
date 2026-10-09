# Next.js web/BFF. Multi-arch (linux/amd64, linux/arm64). Build context: repo root.
FROM node:22.20.0-alpine3.22 AS deps
WORKDIR /app/apps/web
RUN npm install -g pnpm@12.10.1 --no-audit --no-fund
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22.20.0-alpine3.22 AS build
WORKDIR /app/apps/web
RUN npm install -g pnpm@12.10.1 --no-audit --no-fund
COPY --from=deps /app/apps/web/node_modules ./node_modules
COPY apps/web ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22.20.0-alpine3.22 AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S palavva && adduser -S palavva -G palavva
COPY --from=build --chown=palavva:palavva /app/apps/web/.next/standalone ./
COPY --from=build --chown=palavva:palavva /app/apps/web/.next/static ./.next/static
COPY --from=build --chown=palavva:palavva /app/apps/web/public ./public
USER palavva
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["node", "server.js"]
