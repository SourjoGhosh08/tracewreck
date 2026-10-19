FROM node:24.22.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm ci

FROM node:24.22.0-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24.22.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=file:./data/agentpostmortem.db
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV ALLOW_DEMO_RESET=false
RUN mkdir -p data && chown node:node data
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/package-lock.json ./package-lock.json
RUN npm prune --omit=dev
COPY --from=builder --chown=node:node /app/src ./src
USER node
EXPOSE 3000
CMD ["npm", "start"]
