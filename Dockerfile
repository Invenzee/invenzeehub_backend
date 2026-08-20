# InvenzeeHub backend — Express + Socket.io (Dokploy / Docker)
# Set runtime env in Dokploy (MONGODB_URI, JWT_*, CORS_ORIGIN, etc.)
# See .env.example for the full list.

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=5000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 appuser

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY src ./src

USER appuser
EXPOSE 5000

CMD ["node", "server.js"]
