# syntax=docker/dockerfile:1
# Production build (not `next dev`): the app is compiled once here, so the
# container never has to compile a route on first visit. On a slow disk that
# is the difference between minutes-per-page and instant navigation.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# build-server.mjs copies public/ + .next/static into .next/standalone and
# refuses to proceed if data/ or auth.json leaked into the bundle.
RUN npm run build && node scripts/build-server.mjs

FROM node:22-bookworm-slim
WORKDIR /app
# Demo verification runs headless Chromium. The standalone server has no
# Electron helper, so headless.ts falls back to system Chrome via CHROME_PATH.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Mutable records (chats, graph, keys) stay on the volume, never in the image.
ENV LH_DATA_DIR=/data
ENV LH_AUTH_FILE=/data/auth.json
VOLUME /data

COPY --from=build /app/.next/standalone ./

EXPOSE 3000
CMD ["node", "server.js"]
