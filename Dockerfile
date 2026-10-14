FROM node:20.18.1-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20.18.1-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20.18.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=file:./data/agentpostmortem.db
RUN mkdir -p data && chown node:node data
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["npm", "start"]
