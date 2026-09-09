FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-slim AS runtime
ENV NODE_ENV=production

# No browser, and no fonts for it to render with. Both left with the rendering
# — engaging-worker carries them now, which is the point of the split: this
# image is 226 MB of Node and nothing else, and boots in a fraction of the 21
# seconds a Chrome-carrying one took.

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
