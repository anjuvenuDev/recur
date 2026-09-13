FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/demo-service/package.json apps/demo-service/package.json
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production RECUR_PRODUCTION=true WEB_HOST=0.0.0.0 DATABASE_URL=file:/app/data/recur.db
RUN mkdir -p /app/data /app/artifacts && chown node:node /app/data /app/artifacts
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "scripts/dev.ts"]
