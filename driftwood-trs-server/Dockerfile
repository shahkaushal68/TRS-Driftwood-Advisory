# ─── Stage 1: Production dependencies ────────────────────────────────────────
# Debian-slim (glibc), matching the runner stage below — not Alpine (musl). Packages with
# platform-specific native bindings (@napi-rs/canvas, puppeteer's Chromium) resolve to the
# binary matching whatever libc `npm ci` runs under here, and that binary gets copied
# verbatim into the runner stage — Alpine here + Debian runner installs the wrong (musl)
# native binding and it silently fails to load at runtime.
FROM node:24-slim AS deps
WORKDIR /app

# Puppeteer caches its downloaded Chromium under $HOME/.cache/puppeteer by default, outside
# node_modules — pin it under /app so the runner stage below can copy it across.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# unzip: Puppeteer's Chrome download ships as a .zip; node:24-slim has no archiver installed,
# so extraction fails and leaves the browser folder created but the executable missing. That
# failure used to be swallowed silently (see below) — install it up front so this can't recur.
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# puppeteer's own postinstall (install.mjs) swallows Chrome-download failures and always
# exits 0 — a transient network/registry hiccup during `npm ci` silently ships an image
# with an empty cache dir instead of failing the build. Install explicitly and verify the
# binary actually landed so a bad build fails here instead of 500ing in production.
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev \
    && npx puppeteer browsers install chrome \
    && [ -n "$(ls -A /app/.cache/puppeteer/chrome 2>/dev/null)" ] \
    && npm cache clean --force

# ─── Stage 2: TypeScript build ────────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ─── Stage 3: Production runtime ─────────────────────────────────────────────
# Debian-slim, not Alpine: Puppeteer's downloaded Chromium is a glibc build and Puppeteer
# explicitly doesn't support musl-libc Alpine. Alpine's own `chromium` apk is the usual
# workaround, but it drags in an ~800MB GTK/X11 dependency chain — worse than just running
# on a base Chromium can actually target.
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Shared libraries headless Chromium needs at runtime (Puppeteer's documented Debian list).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
      libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 \
      libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m -d /home/nestjs -s /bin/false nestjs
ENV HOME=/home/nestjs

COPY --from=deps  --chown=nestjs:nodejs /app/node_modules       ./node_modules
COPY --from=deps  --chown=nestjs:nodejs /app/.cache/puppeteer   ./.cache/puppeteer
COPY --from=builder --chown=nestjs:nodejs /app/dist        ./dist
COPY --chown=nestjs:nodejs package*.json ./
COPY --chown=nestjs:nodejs drizzle                         ./drizzle
COPY --chown=nestjs:nodejs scripts/fetch-aws-secrets.mjs   ./scripts/fetch-aws-secrets.mjs

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nestjs

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:8000/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main"]
