# backend/Dockerfile

# Base Stage: Node.js 22 LTS を指定
FROM node:22-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./
# lockfile 通りに厳密インストールする。
# npm install は package.json の semver 範囲を再解決してビルドごとに版が変わりうるが、
# npm ci は package-lock.json に固定されるため、CI がテストした依存ツリーと
# 本番イメージの依存ツリーが完全に一致する。
RUN npm ci

# Development Stage
FROM base AS development
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "start:dev"]

# Production Stage
FROM base AS production
COPY . .
RUN npx prisma generate
RUN npm run build
CMD ["node", "dist/main"]