FROM node:20-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter litapp-shared build
RUN pnpm --filter litapp-api build

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]