# # apps/roomRouter/Dockerfile
# #
# # MONOREPO BUILD — Docker context must be the REPO ROOT
# #
# # roomRouter uses Bun (not Node.js — fixed from previous version).
# # It does NOT depend on @repo/db, so we don't need to copy packages/db/
# # or run prisma generate. Much simpler than wsbackend.
# #
# # In docker-compose.yml:
# #   room-router:
# #     build:
# #       context: .
# #       dockerfile: apps/roomRouter/Dockerfile

# # ── Stage 1: install dependencies ─────────────────────────────────────────────
# FROM oven/bun:1.2-alpine AS deps

# WORKDIR /repo

# # Root manifest + lockfile
# COPY package.json bun.lockb* ./

# # Only roomRouter's package.json — no other packages needed
# COPY apps/roomRouter/package.json ./apps/roomRouter/package.json

# RUN bun install --frozen-lockfile

# # ── Stage 2: runtime ──────────────────────────────────────────────────────────
# FROM oven/bun:1.2-alpine AS runner

# RUN apk add --no-cache wget

# WORKDIR /repo

# COPY --from=deps /repo/node_modules             ./node_modules
# COPY --from=deps /repo/apps/roomRouter/package.json ./apps/roomRouter/package.json
# COPY package.json ./

# # Copy source
# COPY apps/roomRouter/src/ ./apps/roomRouter/src/

# RUN addgroup -S app && adduser -S app -G app
# USER app

# EXPOSE 9000

# HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
#   CMD wget -q --spider http://localhost:9000/health || exit 1

# WORKDIR /repo/apps/roomRouter
# CMD ["bun", "src/index.ts"]


## with monorepo

# apps/roomRouter/Dockerfile
#
# MONOREPO BUILD — Docker context must be the REPO ROOT
#
# roomRouter uses Bun (not Node.js — fixed from previous version).
# It does NOT depend on @repo/db, so we don't need to copy packages/db/
# or run prisma generate. Much simpler than wsbackend.
#
# In docker-compose.yml:
#   room-router:
#     build:
#       context: .
#       dockerfile: apps/roomRouter/Dockerfile

# ── Stage 1: install dependencies ─────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS deps

WORKDIR /repo

# Root manifest + lockfile
COPY package.json bun.lockb* ./

# Only roomRouter's package.json — no other packages needed
COPY apps/roomRouter/package.json ./apps/roomRouter/package.json

RUN bun install

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS runner

RUN apk add --no-cache wget

WORKDIR /repo

COPY --from=deps /repo/node_modules             ./node_modules
COPY --from=deps /repo/apps/roomRouter/package.json ./apps/roomRouter/package.json
COPY package.json ./

# Copy source
COPY apps/roomRouter/src/ ./apps/roomRouter/src/

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 9000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:9000/health || exit 1

WORKDIR /repo/apps/roomRouter
CMD ["bun", "src/index.ts"]