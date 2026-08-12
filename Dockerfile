# Puppeteer's bundled Chromium download is skipped in every stage — the runtime
# stage installs the distribution's own instead.
FROM node:24-slim AS deps
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-slim AS build
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# fonts-liberation covers the fallback stack; the page's own webfont is
# fetched at render time. Without any fonts installed, text renders as boxes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# Production dependencies only — the SWC toolchain and test runner are build-time
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/main"]
